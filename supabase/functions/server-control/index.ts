import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
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

    // Verify user from JWT
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

    // Check role (admin or moderator)
    const { data: hasAdmin } = await supabase.rpc('has_role', { _user_id: user.id, _role: 'admin' });
    const { data: hasMod } = await supabase.rpc('has_role', { _user_id: user.id, _role: 'moderator' });
    if (!hasAdmin && !hasMod) {
      return new Response(JSON.stringify({ error: 'Insufficient permissions' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { serverId, action, command } = await req.json();

    if (!serverId || !action) {
      return new Response(JSON.stringify({ error: 'serverId and action required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify server exists
    const { data: server, error: serverErr } = await supabase
      .from('servers').select('id, name, status, executable_path, config_dir, data_dir, port, agent_url').eq('id', serverId).maybeSingle();
    if (serverErr || !server) {
      return new Response(JSON.stringify({ error: 'Server not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // If agent_url is configured, proxy the action to the host agent
    if (server.agent_url) {
      return await proxyToAgent(server, action, command, user, supabase, corsHeaders);
    }

    // Otherwise, simulate (no agent configured)
    return await simulateAction(server, action, command, user, supabase, corsHeaders);

  } catch (error) {
    console.error('Server control error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Internal error' }), {
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

    // Update server status in DB if agent reports new status
    if (agentData.status) {
      await supabase.from('servers').update({ status: agentData.status }).eq('id', server.id);
    }

    // Log the event
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
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (fetchErr) {
    console.error('Agent proxy error:', fetchErr);
    return new Response(JSON.stringify({
      error: `Agent unreachable at ${agentUrl}: ${fetchErr instanceof Error ? fetchErr.message : 'timeout'}`,
    }), {
      status: 502, headers: { ...cors, 'Content-Type': 'application/json' },
    });
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
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
