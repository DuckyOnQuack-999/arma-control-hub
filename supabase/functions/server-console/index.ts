import { corsHeaders, corsResponse, corsError } from "../_shared/cors.ts";
import { authenticateUser, writeConsoleLine, parseJsonSafe } from "../_shared/db.ts";
import { validateAgentUrl } from "../_shared/validation.ts";

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authResult = await authenticateUser(req.headers.get('Authorization'));
    if (authResult instanceof Response) return authResult;
    const { user, supabase } = authResult;

    const body = await req.json().catch(() => ({}));
    const { serverId, limit = 500, before } = body;

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

        const url = before
          ? `${agentUrl}/api/servers/${serverId}/console?limit=${limit}&before=${before}`
          : `${agentUrl}/api/servers/${serverId}/console?limit=${limit}`;

        const agentResp = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${agentToken}`,
          },
          signal: AbortSignal.timeout(5000),
        });

        const agentData = await parseJsonSafe(agentResp);

        if (Array.isArray(agentData)) {
          return corsResponse({
            lines: agentData,
            source: 'agent',
          });
        }
      } catch (fetchErr) {
        console.error('Agent console fetch error:', fetchErr);
      }
    }

    // DB fallback
    let query = supabase
      .from('console_lines')
      .select('*')
      .eq('server_id', serverId)
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (before) {
      query = query.lt('timestamp', before);
    }

    const { data: lines, error } = await query;

    if (error) {
      return corsError('Failed to fetch console lines', 500);
    }

    return corsResponse({
      lines: lines || [],
      source: 'database',
    });

  } catch (error) {
    console.error('Server console error:', error);
    return corsError('Internal server error', 500);
  }
});
