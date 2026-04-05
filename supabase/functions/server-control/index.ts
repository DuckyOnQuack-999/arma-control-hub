import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

function validateAgentUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (!['http:', 'https:'].includes(u.protocol)) return false;
    // Block only cloud metadata endpoint — private IPs are expected for game servers
    if (u.hostname === '169.254.169.254') return false;
    return true;
  } catch {
    return false;
  }
}

function sanitizeCommand(cmd: string): string {
  return cmd.replace(/[\r\n\0]/g, '').slice(0, 500);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders
    });
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

    const body = await req.json();
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
      .from('servers').select('id, name, status, executable_path, config_dir, data_dir, port, agent_url').eq('id', serverId).maybeSingle();
    if (serverErr || !server) {
      return new Response(JSON.stringify({ error: 'Server not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (server.agent_url) {
      if (!validateAgentUrl(server.agent_url)) {
        return new Response(JSON.stringify({ error: 'Invalid agent URL configuration' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return await proxyToAgent(server, action, command, user, supabase, corsHeaders);
    }

    return await simulateAction(server, action, command, user, supabase, corsHeaders);

  } catch (error) {
    console.error('Server control error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function proxyToAgent(
  server: any, action: string, command: string | undefined,
  user: any, supabase: any, cors: Record<string, string>
) {
  const agentUrl = server.agent_url.replace(/\/$/, '');
  const payload: Record<string, unknown> = { action, serverId: server.id };
  if (command) payload.command = command;

  try {
    const agentResp = await fetch(`${agentUrl}/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });

    const agentData = await agentResp.json();

    if (agentData.status) {
      await supabase.from('servers').update({ status: agentData.status }).eq('id', server.id);
    }

    await supabase.from('server_events').insert({
      server_id: server.id,
      event_type: action,
      payload: { source: 'agent', user_id: user.id, user_email: user.email, agent_response: agentData },
    });

    await supabase.from('audit_log').insert({
      user_id: user.id,
      action: `server.${action}`,
      target_type: 'server',
      target_id: String(server.id),
      details: { source: 'agent', command },
    });

    return new Response(JSON.stringify({
      success: agentResp.ok,
      message: agentData.message || `Action '${action}' sent to agent for ${server.name}`,
      newStatus: agentData.status || server.status,
    }), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (fetchErr) {
    console.error('Agent proxy error:', fetchErr);
    // Fall back to simulation mode when agent is unreachable
    return await simulateAction(server, action, command, user, supabase, cors);
  }
}

async function simulateAction(
  server: any, action: string, command: string | undefined,
  user: any, supabase: any, cors: Record<string, string>
) {
  let newStatus: string | null = null;
  let eventType = action;
  const payload: Record<string, unknown> = { source: 'panel_simulated', user_id: user.id, user_email: user.email };

  switch (action) {
    case 'start':
      if (server.status !== 'offline' && server.status !== 'crashed') {
        return new Response(JSON.stringify({ error: `Cannot start: server is ${server.status}` }), {
          status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }
      await supabase.from('servers').update({ status: 'starting' }).eq('id', server.id);
      await supabase.from('servers').update({ status: 'online', uptime: 0 }).eq('id', server.id);
      newStatus = 'online';
      payload.executable = server.executable_path;
      payload.config_dir = server.config_dir;
      payload.data_dir = server.data_dir;
      payload.port = server.port;
      break;

    case 'stop':
      if (server.status !== 'online') {
        return new Response(JSON.stringify({ error: `Cannot stop: server is ${server.status}` }), {
          status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }
      await supabase.from('servers').update({ status: 'stopping' }).eq('id', server.id);
      await supabase.from('players').update({ is_online: false }).eq('server_id', server.id);
      await supabase.from('servers').update({ status: 'offline', player_count: 0, cpu_percent: 0, memory_mb: 0 }).eq('id', server.id);
      newStatus = 'offline';
      break;

    case 'restart':
      if (server.status !== 'online') {
        return new Response(JSON.stringify({ error: `Cannot restart: server is ${server.status}` }), {
          status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }
      await supabase.from('servers').update({ status: 'stopping' }).eq('id', server.id);
      await supabase.from('players').update({ is_online: false }).eq('server_id', server.id);
      await supabase.from('servers').update({ status: 'starting' }).eq('id', server.id);
      await supabase.from('servers').update({ status: 'online', uptime: 0, player_count: 0 }).eq('id', server.id);
      newStatus = 'online';
      break;

    case 'kill':
      await supabase.from('players').update({ is_online: false }).eq('server_id', server.id);
      await supabase.from('servers').update({ status: 'offline', player_count: 0, cpu_percent: 0, memory_mb: 0 }).eq('id', server.id);
      newStatus = 'offline';
      payload.forced = true;
      break;

    case 'command':
      if (!command) {
        return new Response(JSON.stringify({ error: 'command field required for action=command' }), {
          status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }
      if (server.status !== 'online') {
        return new Response(JSON.stringify({ error: `Cannot send command: server is ${server.status}` }), {
          status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }
      eventType = 'command';
      payload.command = command;
      break;

    default:
      return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      });
  }

  await supabase.from('server_events').insert({
    server_id: server.id,
    event_type: eventType,
    payload,
  });

  await supabase.from('audit_log').insert({
    user_id: user.id,
    action: `server.${action}`,
    target_type: 'server',
    target_id: String(server.id),
    details: payload,
  });

  return new Response(JSON.stringify({
    success: true,
    message: `Action '${action}' simulated on server ${server.name} (no agent configured)`,
    newStatus: newStatus || server.status,
  }), {
    status: 200,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
