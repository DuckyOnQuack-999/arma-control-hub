import { corsHeaders, corsResponse, corsError } from "../_shared/cors.ts";
import { safeDbWrite, authenticateUser, parseJsonSafe } from "../_shared/db.ts";
import { validateAgentUrl } from "../_shared/validation.ts";

// Simple in-memory cache for status responses (5 second TTL)
const statusCache = new Map<number, { data: any; timestamp: number }>();
const CACHE_TTL_MS = 5000;
const METRICS_PRUNE_INTERVAL_MS = 5 * 60 * 1000; // Prune every 5 minutes
let lastPruneTime = 0;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authResult = await authenticateUser(req.headers.get('Authorization'));
    if (authResult instanceof Response) return authResult;
    const { supabase } = authResult;

    let body: { serverId?: number };
    try {
      body = await req.json();
    } catch {
      return corsError('Invalid request body');
    }

    const { serverId } = body;
    if (!serverId) return corsError('serverId required');

    // Check cache first
    const cached = statusCache.get(serverId);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
      return corsResponse({ ...cached.data, cached: true });
    }

    const { data: server, error: serverErr } = await supabase
      .from('servers').select('*').eq('id', serverId).maybeSingle();
    if (serverErr || !server) return corsError('Server not found', 404);

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

        // Prune old metrics (> 7 days) - only periodically to reduce DB load
        if (Date.now() - lastPruneTime > METRICS_PRUNE_INTERVAL_MS) {
          const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
          await safeDbWrite(supabase.from('metrics').delete().lt('recorded_at', cutoff), 'metrics prune global');
          lastPruneTime = Date.now();
        }

        const result = {
          success: true,
          status: agentData.status || server.status,
          player_count: agentData.player_count ?? server.player_count,
          cpu_percent: agentData.cpu_percent ?? server.cpu_percent,
          memory_mb: agentData.memory_mb ?? server.memory_mb,
          current_map: agentData.current_map || server.current_map,
          uptime: agentData.uptime ?? server.uptime,
          max_players: server.max_players,
          source: 'agent',
        };
        statusCache.set(serverId, { data: result, timestamp: Date.now() });
        return corsResponse(result);
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

    // Prune old metrics (> 7 days) - only periodically to reduce DB load
    if (Date.now() - lastPruneTime > METRICS_PRUNE_INTERVAL_MS) {
      const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
      await safeDbWrite(supabase.from('metrics').delete().lt('recorded_at', cutoff), 'metrics prune global');
      lastPruneTime = Date.now();
    }

    const result = {
      success: true,
      status: server.status,
      player_count: onlinePlayers ?? server.player_count ?? 0,
      cpu_percent: latestMetric?.cpu_percent ?? server.cpu_percent ?? 0,
      memory_mb: latestMetric?.memory_mb ?? server.memory_mb ?? 0,
      current_map: server.current_map || '',
      uptime,
      max_players: server.max_players,
      source: server.agent_url ? 'agent_fallback' : 'database',
    };
    statusCache.set(serverId, { data: result, timestamp: Date.now() });
    return corsResponse(result);

  } catch (error) {
    console.error('Server status error:', error);
    return corsError('Internal server error', 500);
  }
});
