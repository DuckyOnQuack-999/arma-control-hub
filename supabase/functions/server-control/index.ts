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
      .from('servers').select('id, name, status, executable_path, config_dir, data_dir, port').eq('id', serverId).maybeSingle();
    if (serverErr || !server) {
      return new Response(JSON.stringify({ error: 'Server not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let newStatus: string | null = null;
    let eventType = action;
    let payload: Record<string, unknown> = { source: 'panel', user_id: user.id, user_email: user.email };

    switch (action) {
      case 'start':
        if (server.status !== 'offline' && server.status !== 'crashed') {
          return new Response(JSON.stringify({ error: `Cannot start: server is ${server.status}` }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        // Transition: offline/crashed → starting → online
        await supabase.from('servers').update({ status: 'starting' }).eq('id', serverId);
        // In production, an agent on the host machine would pick up the 'starting' status
        // and launch the actual armagetronad-dedicated process. For now we simulate:
        await supabase.from('servers').update({ status: 'online', uptime: 0 }).eq('id', serverId);
        newStatus = 'online';
        payload.executable = server.executable_path;
        payload.config_dir = server.config_dir;
        payload.data_dir = server.data_dir;
        payload.port = server.port;
        break;

      case 'stop':
        if (server.status !== 'online') {
          return new Response(JSON.stringify({ error: `Cannot stop: server is ${server.status}` }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        await supabase.from('servers').update({ status: 'stopping' }).eq('id', serverId);
        // Graceful stop: mark players offline, then set offline
        await supabase.from('players').update({ is_online: false }).eq('server_id', serverId);
        await supabase.from('servers').update({ status: 'offline', player_count: 0, cpu_percent: 0, memory_mb: 0 }).eq('id', serverId);
        newStatus = 'offline';
        break;

      case 'restart':
        if (server.status !== 'online') {
          return new Response(JSON.stringify({ error: `Cannot restart: server is ${server.status}` }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        await supabase.from('servers').update({ status: 'stopping' }).eq('id', serverId);
        await supabase.from('players').update({ is_online: false }).eq('server_id', serverId);
        await supabase.from('servers').update({ status: 'starting' }).eq('id', serverId);
        await supabase.from('servers').update({ status: 'online', uptime: 0, player_count: 0 }).eq('id', serverId);
        newStatus = 'online';
        break;

      case 'kill':
        await supabase.from('players').update({ is_online: false }).eq('server_id', serverId);
        await supabase.from('servers').update({ status: 'offline', player_count: 0, cpu_percent: 0, memory_mb: 0 }).eq('id', serverId);
        newStatus = 'offline';
        payload.forced = true;
        break;

      case 'command':
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
        eventType = 'command';
        payload.command = command;
        // In production, the agent would pipe this to the server's stdin
        break;

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    // Log the event
    await supabase.from('server_events').insert({
      server_id: serverId,
      event_type: eventType,
      payload,
    });

    // Log to audit trail
    await supabase.from('audit_log').insert({
      user_id: user.id,
      action: `server.${action}`,
      target_type: 'server',
      target_id: String(serverId),
      details: payload,
    });

    return new Response(JSON.stringify({
      success: true,
      message: `Action '${action}' executed on server ${server.name}`,
      newStatus: newStatus || server.status,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Server control error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
