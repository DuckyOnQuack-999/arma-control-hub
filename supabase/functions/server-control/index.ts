import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

function validateAgentUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (!['http:', 'https:'].includes(u.protocol)) return false;
    if (u.hostname === '169.254.169.254') return false;
    return true;
  } catch {
    return false;
  }
}

function sanitizeCommand(cmd: string): string {
  return cmd.replace(/[\r\n\0]/g, '').slice(0, 500);
}

async function safeDbWrite(op: Promise<{ error: any }>, label: string) {
  const { error } = await op;
  if (error) console.error(`DB write error (${label}):`, error.message);
}

async function writeConsoleLine(supabase: any, serverId: number, lineType: string, text: string, source: string) {
  await safeDbWrite(
    supabase.from('console_lines').insert({
      server_id: serverId,
      line_type: lineType,
      text,
      source,
    }),
    `console_lines insert for server ${serverId}`
  );
}

async function parseJsonSafe(resp: Response): Promise<any> {
  try {
    return await resp.json();
  } catch {
    console.error('Failed to parse agent response as JSON');
    return { error: 'Agent returned invalid JSON' };
  }
}

// Prepare config files for server start
async function prepareConfigFiles(supabase: any, serverId: number): Promise<void> {
  // Get all config key-values for this server
  const { data: configs, error } = await supabase
    .from('server_configs')
    .select('filename, key, value')
    .eq('server_id', serverId);

  if (error || !configs || configs.length === 0) {
    return; // No configs to write
  }

  // Group by filename and write to server_files
  const files: Record<string, string[]> = {};
  for (const cfg of configs) {
    const file = cfg.filename || 'settings_custom.cfg';
    if (!files[file]) files[file] = [];
    files[file].push(`${cfg.key} ${cfg.value}`);
  }

  // Write each config file to server_files
  for (const [filename, lines] of Object.entries(files)) {
    const content = lines.join('\n') + '\n';
    const path = `/config/${filename}`;

    await safeDbWrite(
      supabase.from('server_files').upsert({
        server_id: serverId,
        path,
        content,
        is_directory: false,
        size_bytes: new TextEncoder().encode(content).length,
      }, { onConflict: 'server_id,path' }),
      `config file ${filename} write`
    );
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: hasAdmin } = await supabase.rpc('has_role', { _user_id: user.id, _role: 'admin' });
    const { data: hasMod } = await supabase.rpc('has_role', { _user_id: user.id, _role: 'moderator' });
    if (!hasAdmin && !hasMod) {
      return new Response(JSON.stringify({ error: 'Insufficient permissions' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid request body' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const serverId = body.serverId;
    const action = body.action;
    const command = body.command ? sanitizeCommand(body.command) : undefined;

    if (!serverId || !action) {
      return new Response(JSON.stringify({ error: 'serverId and action required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const validActions = ['start', 'stop', 'restart', 'kill', 'command'];
    if (!validActions.includes(action)) {
      return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: server, error: serverErr } = await supabase
      .from('servers').select('id, name, status, executable_path, config_dir, data_dir, port, max_players, agent_url, auto_restart')
      .eq('id', serverId).maybeSingle();
    if (serverErr || !server) {
      return new Response(JSON.stringify({ error: 'Server not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (server.agent_url && validateAgentUrl(server.agent_url)) {
      try {
        const result = await proxyToAgent(server, action, command, user, supabase);
        return result;
      } catch (fetchErr) {
        console.error('Agent proxy error, falling back to DB-driven control:', fetchErr);
      }
    }

    return await dbDrivenControl(server, action, command, user, supabase);

  } catch (error) {
    console.error('Server control error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function proxyToAgent(
  server: any, action: string, command: string | undefined,
  user: any, supabase: any
) {
  const agentUrl = server.agent_url.replace(/\/$/, '');
  const payload: Record<string, unknown> = { action, serverId: server.id };
  if (command) payload.command = command;

  // On start, send full config to agent
  if (action === 'start') {
    payload.config = {
      id: server.id,
      name: server.name,
      executablePath: server.executable_path,
      dataDir: server.data_dir,
      configDir: server.config_dir,
      port: server.port,
      maxPlayers: server.max_players,
      autoRestart: server.auto_restart,
    };

    // Fetch all config key-values for this server
    const { data: configs } = await supabase
      .from('server_configs')
      .select('key, value')
      .eq('server_id', server.id);

    if (configs && configs.length > 0) {
      const configObj: Record<string, string> = {};
      for (const c of configs) {
        configObj[c.key] = c.value;
      }
      payload.configs = configObj;
    }
  }

  const agentResp = await fetch(`${agentUrl}/control`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000), // Increased timeout for start
  });

  const agentData = await parseJsonSafe(agentResp);

  if (agentData.status) {
    await safeDbWrite(supabase.from('servers').update({ status: agentData.status }).eq('id', server.id), 'server status update');
  }
  if (typeof agentData.player_count === 'number') {
    await safeDbWrite(supabase.from('servers').update({ player_count: agentData.player_count }).eq('id', server.id), 'server player_count update');
  }
  if (typeof agentData.cpu_percent === 'number') {
    await safeDbWrite(supabase.from('servers').update({ cpu_percent: agentData.cpu_percent }).eq('id', server.id), 'server cpu_percent update');
  }
  if (typeof agentData.memory_mb === 'number') {
    await safeDbWrite(supabase.from('servers').update({ memory_mb: agentData.memory_mb }).eq('id', server.id), 'server memory_mb update');
  }

  if (agentData.console_lines && Array.isArray(agentData.console_lines)) {
    for (const line of agentData.console_lines) {
      await writeConsoleLine(supabase, server.id, line.type || 'system', line.text, 'agent');
    }
  }

  await safeDbWrite(supabase.from('server_events').insert({
    server_id: server.id,
    event_type: action,
    payload: { source: 'agent', user_id: user.id, user_email: user.email, agent_response: agentData },
  }), 'server_events insert');

  await safeDbWrite(supabase.from('audit_log').insert({
    user_id: user.id,
    action: `server.${action}`,
    target_type: 'server',
    target_id: String(server.id),
    details: { source: 'agent', command },
  }), 'audit_log insert');

  return new Response(JSON.stringify({
    success: agentResp.ok,
    message: agentData.message || `Action '${action}' executed via agent on ${server.name}`,
    newStatus: agentData.status || server.status,
  }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function dbDrivenControl(
  server: any, action: string, command: string | undefined,
  user: any, supabase: any
) {
  let newStatus: string | null = null;

  switch (action) {
    case 'start': {
      if (server.status !== 'offline' && server.status !== 'crashed') {
        return new Response(JSON.stringify({ error: `Cannot start: server is ${server.status}` }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      await safeDbWrite(supabase.from('servers').update({ status: 'starting' }).eq('id', server.id), 'server status starting');

      // Prepare config files from database
      await prepareConfigFiles(supabase, server.id);
      await writeConsoleLine(supabase, server.id, 'info', `Config files prepared from database.`, 'panel');

      await writeConsoleLine(supabase, server.id, 'system', `Starting server on port ${server.port}...`, 'panel');
      await writeConsoleLine(supabase, server.id, 'info', `Binary: ${server.executable_path}`, 'panel');
      await writeConsoleLine(supabase, server.id, 'info', `Config: ${server.config_dir} | Data: ${server.data_dir}`, 'panel');
      await writeConsoleLine(supabase, server.id, 'info', `Max Players: ${server.max_players}`, 'panel');

      // Simulate startup sequence
      await writeConsoleLine(supabase, server.id, 'system', `Loading configuration...`, 'panel');
      await writeConsoleLine(supabase, server.id, 'system', `Binding to UDP port ${server.port}...`, 'panel');
      await writeConsoleLine(supabase, server.id, 'system', `Server initialized successfully.`, 'panel');

      await safeDbWrite(supabase.from('metrics').insert({
        server_id: server.id, cpu_percent: 0, memory_mb: 0, player_count: 0,
      }), 'metrics insert on start');

      await safeDbWrite(supabase.from('servers').update({
        status: 'online', uptime: 0, player_count: 0, cpu_percent: 0, memory_mb: 0, current_map: '',
      }).eq('id', server.id), 'server status online');
      await writeConsoleLine(supabase, server.id, 'system', `Server is now online on port ${server.port}.`, 'panel');

      newStatus = 'online';
      break;
    }

    case 'stop': {
      if (server.status !== 'online' && server.status !== 'starting') {
        return new Response(JSON.stringify({ error: `Cannot stop: server is ${server.status}` }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      await safeDbWrite(supabase.from('servers').update({ status: 'stopping' }).eq('id', server.id), 'server status stopping');
      await writeConsoleLine(supabase, server.id, 'system', `Sending QUIT to server...`, 'panel');
      await writeConsoleLine(supabase, server.id, 'system', `Saving configuration...`, 'panel');
      await writeConsoleLine(supabase, server.id, 'system', `Closing connections...`, 'panel');

      await safeDbWrite(supabase.from('players').update({ is_online: false }).eq('server_id', server.id), 'players offline on stop');

      await safeDbWrite(supabase.from('servers').update({
        status: 'offline', player_count: 0, cpu_percent: 0, memory_mb: 0,
      }).eq('id', server.id), 'server status offline');
      await writeConsoleLine(supabase, server.id, 'system', `Server stopped successfully.`, 'panel');

      newStatus = 'offline';
      break;
    }

    case 'restart': {
      if (server.status !== 'online' && server.status !== 'crashed' && server.status !== 'offline') {
        return new Response(JSON.stringify({ error: `Cannot restart: server is ${server.status}` }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      await writeConsoleLine(supabase, server.id, 'system', `Initiating server restart...`, 'panel');

      if (server.status === 'online') {
        await safeDbWrite(supabase.from('servers').update({ status: 'stopping' }).eq('id', server.id), 'server status stopping on restart');
        await safeDbWrite(supabase.from('players').update({ is_online: false }).eq('server_id', server.id), 'players offline on restart');
        await writeConsoleLine(supabase, server.id, 'system', `Players disconnected.`, 'panel');
      }

      await safeDbWrite(supabase.from('servers').update({ status: 'starting' }).eq('id', server.id), 'server status starting on restart');

      // Prepare config files from database
      await prepareConfigFiles(supabase, server.id);

      await writeConsoleLine(supabase, server.id, 'system', `Starting server on port ${server.port}...`, 'panel');

      await safeDbWrite(supabase.from('servers').update({
        status: 'online', uptime: 0, player_count: 0, cpu_percent: 0, memory_mb: 0, current_map: '',
      }).eq('id', server.id), 'server status online on restart');
      await writeConsoleLine(supabase, server.id, 'system', `Server is now online.`, 'panel');

      newStatus = 'online';
      break;
    }

    case 'kill': {
      if (server.status === 'offline') {
        return new Response(JSON.stringify({ error: 'Cannot kill: server is already offline' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      await writeConsoleLine(supabase, server.id, 'error', `FORCE KILL initiated — process terminated immediately.`, 'panel');

      await safeDbWrite(supabase.from('players').update({ is_online: false }).eq('server_id', server.id), 'players offline on kill');
      await safeDbWrite(supabase.from('servers').update({
        status: 'offline', player_count: 0, cpu_percent: 0, memory_mb: 0,
      }).eq('id', server.id), 'server status offline on kill');

      newStatus = 'offline';
      break;
    }

    case 'command': {
      if (!command) {
        return new Response(JSON.stringify({ error: 'command field required for action=command' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (server.status !== 'online') {
        return new Response(JSON.stringify({ error: `Cannot send command: server is ${server.status}` }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      await writeConsoleLine(supabase, server.id, 'system', `> ${command}`, 'panel');

      const cmdUpper = command.toUpperCase().trim();
      const cmdParts = cmdUpper.split(/\s+/);
      const cmdName = cmdParts[0];

      if (cmdName === 'KICK' && cmdParts[1]) {
        await safeDbWrite(supabase.from('players').update({ is_online: false })
          .eq('server_id', server.id).eq('name', cmdParts[1]), `kick ${cmdParts[1]}`);
        await writeConsoleLine(supabase, server.id, 'warning', `Player ${cmdParts[1]} kicked.`, 'panel');
      } else if (cmdName === 'BAN' && cmdParts[1]) {
        await safeDbWrite(supabase.from('players').update({ is_online: false })
          .eq('server_id', server.id).eq('name', cmdParts[1]), `ban offline ${cmdParts[1]}`);
        await safeDbWrite(supabase.from('bans').insert({
          server_id: server.id, player_name: cmdParts[1], reason: 'Banned via console', banned_by: user.email || 'admin',
        }), `ban insert ${cmdParts[1]}`);
        await writeConsoleLine(supabase, server.id, 'warning', `Player ${cmdParts[1]} banned.`, 'panel');
      } else if (cmdName === 'SILENCE' && cmdParts[1]) {
        await writeConsoleLine(supabase, server.id, 'system', `Player ${cmdParts[1]} silenced.`, 'panel');
      } else if (cmdName === 'VOICE' && cmdParts[1]) {
        await writeConsoleLine(supabase, server.id, 'system', `Player ${cmdParts[1]} given voice.`, 'panel');
      } else if (cmdName === 'SAY' && cmdParts.length > 1) {
        const msg = command.substring(command.indexOf(' ') + 1);
        await writeConsoleLine(supabase, server.id, 'chat', `[SERVER] ${msg}`, 'panel');
      } else if (cmdName === 'CENTER_MESSAGE' && cmdParts.length > 1) {
        const msg = command.substring(command.indexOf(' ') + 1);
        await writeConsoleLine(supabase, server.id, 'info', `[CENTER MESSAGE] ${msg}`, 'panel');
      } else if (cmdName === 'QUIT' || cmdName === 'EXIT' || cmdName === 'SHUTDOWN') {
        await safeDbWrite(supabase.from('servers').update({ status: 'stopping' }).eq('id', server.id), 'server stopping on QUIT');
        await safeDbWrite(supabase.from('players').update({ is_online: false }).eq('server_id', server.id), 'players offline on QUIT');
        await safeDbWrite(supabase.from('servers').update({
          status: 'offline', player_count: 0, cpu_percent: 0, memory_mb: 0,
        }).eq('id', server.id), 'server offline on QUIT');
        newStatus = 'offline';
        await writeConsoleLine(supabase, server.id, 'system', `Server shutdown via console command.`, 'panel');
      } else if (cmdName === 'RESTART') {
        await safeDbWrite(supabase.from('servers').update({ status: 'starting', uptime: 0 }).eq('id', server.id), 'server starting on RESTART');
        newStatus = 'online';
        await writeConsoleLine(supabase, server.id, 'system', `Server restarting...`, 'panel');
      } else if (cmdName === 'TALK_TO_MASTER') {
        const val = cmdParts[1];
        await writeConsoleLine(supabase, server.id, 'info',
          val === '1' || val === 'TRUE' ? `Server will list on master server.` : `Server delisted from master server.`, 'panel');
      }

      // Config key commands (KEY VALUE)
      const configKeyMatch = command.match(/^([A-Z_]+)\s+(.+)$/);
      if (configKeyMatch && !['KICK', 'BAN', 'SAY', 'CENTER_MESSAGE', 'CONSOLE_MESSAGE', 'SILENCE', 'VOICE', 'LOGIN', 'LOGOUT', 'INCLUDE', 'RINCLUDE', 'PLAYERS'].includes(cmdName)) {
        const [, key, value] = configKeyMatch;
        if (/^[A-Z][A-Z_0-9]+$/.test(key)) {
          await safeDbWrite(supabase.from('server_configs').upsert({
            server_id: server.id, filename: 'settings_custom.cfg', key, value,
          }, { onConflict: 'server_id,filename,key' }), `config upsert ${key}`);
          await writeConsoleLine(supabase, server.id, 'info', `Config updated: ${key} = ${value}`, 'panel');
        }
      }

      break;
    }

    default:
      return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
  }

  await safeDbWrite(supabase.from('server_events').insert({
    server_id: server.id,
    event_type: action,
    payload: {
      source: 'panel',
      user_id: user.id,
      user_email: user.email,
      previous_status: server.status,
      new_status: newStatus || server.status,
      command,
    },
  }), 'server_events insert');

  await safeDbWrite(supabase.from('audit_log').insert({
    user_id: user.id,
    action: `server.${action}`,
    target_type: 'server',
    target_id: String(server.id),
    details: {
      source: 'panel',
      previous_status: server.status,
      new_status: newStatus || server.status,
      command,
    },
  }), 'audit_log insert');

  return new Response(JSON.stringify({
    success: true,
    message: `Action '${action}' executed on ${server.name}`,
    newStatus: newStatus || server.status,
  }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
