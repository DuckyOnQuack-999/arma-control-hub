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

async function safeDbWrite(op: Promise<{ error: any }>, label: string) {
  const { error } = await op;
  if (error) console.error(`DB write error (${label}):`, error.message);
}

async function parseJsonSafe(resp: Response): Promise<any> {
  try {
    return await resp.json();
  } catch {
    console.error('Failed to parse agent response as JSON');
    return {};
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
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

    let body: any;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid request body' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { serverId } = body;
    if (!serverId) {
      return new Response(JSON.stringify({ error: 'serverId required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: server, error: serverErr } = await supabase
      .from('servers').select('*').eq('id', serverId).maybeSingle();
    if (serverErr || !server) {
      return new Response(JSON.stringify({ error: 'Server not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Try agent first if configured
    if (server.agent_url && validateAgentUrl(server.agent_url)) {
      try {
        const agentUrl = server.agent_url.replace(/\/$/, '');
        const agentResp = await fetch(`${agentUrl}/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ serverId: server.id }),
          signal: AbortSignal.timeout(10000),
        });

        const agentData = await parseJsonSafe(agentResp);

        const updates: Record<string, unknown> = {};
        if (agentData.status) updates.status = agentData.status;
        if (typeof agentData.player_count === 'number') updates.player_count = agentData.player_count;
        if (typeof agentData.cpu_percent === 'number') updates.cpu_percent = agentData.cpu_percent;
        if (typeof agentData.memory_mb === 'number') updates.memory_mb = agentData.memory_mb;
        if (agentData.current_map) updates.current_map = agentData.current_map;
        if (typeof agentData.uptime === 'number') updates.uptime = agentData.uptime;

        if (Object.keys(updates).length > 0) {
          await safeDbWrite(supabase.from('servers').update(updates).eq('id', server.id), 'server update from agent');
        }

        if (typeof agentData.cpu_percent === 'number') {
          await safeDbWrite(supabase.from('metrics').insert({
            server_id: server.id,
            cpu_percent: agentData.cpu_percent || 0,
            memory_mb: agentData.memory_mb || 0,
            player_count: agentData.player_count || 0,
          }), 'metrics insert from agent');
        }

        // Prune old metrics (> 7 days)
        const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
        await safeDbWrite(supabase.from('metrics').delete().eq('server_id', server.id).lt('recorded_at', cutoff), 'metrics prune');

        return new Response(JSON.stringify({
          success: true,
          status: agentData.status || server.status,
          player_count: agentData.player_count ?? server.player_count,
          cpu_percent: agentData.cpu_percent ?? server.cpu_percent,
          memory_mb: agentData.memory_mb ?? server.memory_mb,
          current_map: agentData.current_map || server.current_map,
          uptime: agentData.uptime ?? server.uptime,
          max_players: server.max_players,
          source: 'agent',
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (fetchErr) {
        console.error('Agent fetch error, computing from DB:', fetchErr);
      }
    }

    // Compute status from DB
    const { count: onlinePlayers, error: countErr } = await supabase
      .from('players')
      .select('*', { count: 'exact', head: true })
      .eq('server_id', server.id)
      .eq('is_online', true);
    if (countErr) console.error('Player count error:', countErr.message);

    const { data: latestMetric, error: metricErr } = await supabase
      .from('metrics')
      .select('*')
      .eq('server_id', server.id)
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (metricErr) console.error('Latest metric error:', metricErr.message);

    // Compute uptime from last start event
    let uptime = server.uptime ?? 0;
    if (server.status === 'online') {
      const { data: startEvent } = await supabase
        .from('server_events')
        .select('occurred_at')
        .eq('server_id', server.id)
        .in('event_type', ['start', 'restart'])
        .order('occurred_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (startEvent) {
        uptime = Math.floor((Date.now() - new Date(startEvent.occurred_at).getTime()) / 1000);
        await safeDbWrite(supabase.from('servers').update({ uptime }).eq('id', server.id), 'server uptime update');
      }
    }

    // Record a metrics point for online servers (every ~30s)
    if (server.status === 'online') {
      const cpu = latestMetric?.cpu_percent ?? server.cpu_percent ?? 0;
      const mem = latestMetric?.memory_mb ?? server.memory_mb ?? 0;
      const players = onlinePlayers ?? server.player_count ?? 0;

      const shouldInsert = !latestMetric ||
        (Date.now() - new Date(latestMetric.recorded_at).getTime()) > 30000;

      if (shouldInsert) {
        await safeDbWrite(supabase.from('metrics').insert({
          server_id: server.id, cpu_percent: cpu, memory_mb: mem, player_count: players,
        }), 'metrics insert from DB poll');

        await safeDbWrite(supabase.from('servers').update({
          player_count: players, uptime,
        }).eq('id', server.id), 'server player_count/uptime update');
      }
    }

    // Prune old metrics (> 7 days)
    const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    await safeDbWrite(supabase.from('metrics').delete().eq('server_id', server.id).lt('recorded_at', cutoff), 'metrics prune');

    return new Response(JSON.stringify({
      success: true,
      status: server.status,
      player_count: onlinePlayers ?? server.player_count ?? 0,
      cpu_percent: latestMetric?.cpu_percent ?? server.cpu_percent ?? 0,
      memory_mb: latestMetric?.memory_mb ?? server.memory_mb ?? 0,
      current_map: server.current_map || '',
      uptime,
      max_players: server.max_players,
      source: server.agent_url ? 'agent_fallback' : 'database',
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Server status error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
