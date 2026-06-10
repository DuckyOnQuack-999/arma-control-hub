import { corsHeaders, corsResponse, corsError } from "../_shared/cors.ts";
import { authenticateUser, parseJsonSafe } from "../_shared/db.ts";
import { validateAgentUrl } from "../_shared/validation.ts";

interface ServerRow {
  id: number;
  name: string;
  status: string;
  executable_path: string;
  config_dir: string;
  data_dir: string;
  port: number;
  max_players: number;
  agent_url: string;
  agent_token: string;
  auto_restart: boolean;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authResult = await authenticateUser(req.headers.get('Authorization'));
    if (authResult instanceof Response) return authResult;
    const { user, supabase } = authResult;

    const body = await req.json().catch(() => ({}));
    const { serverId } = body;

    if (!serverId) return corsError('serverId required');

    const { data: server, error: serverErr } = await supabase
      .from('servers')
      .select('*')
      .eq('id', serverId)
      .maybeSingle();

    if (serverErr || !server) return corsError('Server not found', 404);

    // Try agent first
    if (server.agent_url && validateAgentUrl(server.agent_url)) {
      try {
        const agentUrl = server.agent_url.replace(/\/$/, '');
        const agentToken = server.agent_token || 'default-agent-token';

        const agentResp = await fetch(`${agentUrl}/api/servers/${serverId}/status`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${agentToken}`,
          },
          signal: AbortSignal.timeout(5000),
        });

        const agentData = await parseJsonSafe(agentResp);

        if (agentData.status) {
          // Update DB with latest status
          await supabase.from('servers').update({
            status: agentData.status,
            current_map: agentData.current_map || server.current_map,
          }).eq('id', server.id);

          // Store metric
          await supabase.from('metrics').insert({
            server_id: server.id,
            cpu: agentData.cpu_percent || 0,
            memory: agentData.memory_mb || 0,
            player_count: agentData.player_count || 0,
          });

          return corsResponse({
            ...agentData,
            source: 'agent',
          });
        }
      } catch (fetchErr) {
        console.error('Agent status fetch error:', fetchErr);
      }
    }

    // DB fallback - compute from stored metrics
    const { data: latestMetric } = await supabase
      .from('metrics')
      .select('*')
      .eq('server_id', serverId)
      .order('timestamp', { ascending: false })
      .limit(1)
      .maybeSingle();

    return corsResponse({
      status: server.status || 'offline',
      player_count: latestMetric?.player_count || 0,
      cpu_percent: latestMetric?.cpu || 0,
      memory_mb: latestMetric?.memory || 0,
      uptime: server.status === 'online' ? Date.now() - new Date(server.updated_at || 0).getTime() : 0,
      current_map: server.current_map || '',
      source: 'database',
    });

  } catch (error) {
    console.error('Server status error:', error);
    return corsError('Internal server error', 500);
  }
});
