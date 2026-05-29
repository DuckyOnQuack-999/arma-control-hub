import { corsHeaders, corsResponse, corsError } from "../_shared/cors.ts";
import { safeDbWrite, authenticateUser, parseJsonSafe } from "../_shared/db.ts";

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authResult = await authenticateUser(req.headers.get('Authorization'));
    if (authResult instanceof Response) return authResult;
    const { supabase } = authResult;

    let body: { serverId?: number; since?: number; limit?: number };
    try {
      body = await req.json();
    } catch {
      return corsError('Invalid request body');
    }

    const { serverId, since, limit } = body;
    if (!serverId) return corsError('serverId required');

    const { data: server, error: serverErr } = await supabase
      .from('servers').select('id, agent_url').eq('id', serverId).maybeSingle();
    if (serverErr || !server) return corsError('Server not found', 404);

    const maxLines = Math.min(limit || 500, 1000);

    // If agent is configured, try fetching from agent first
    if (server.agent_url) {
      try {
        const agentUrl = server.agent_url.replace(/\/$/, '');
        const sinceParam = since ? `?since=${since}` : '';
        const agentResp = await fetch(`${agentUrl}/console${sinceParam}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(5000),
        });
        const agentData = await parseJsonSafe(agentResp);

        if (agentData.lines && Array.isArray(agentData.lines) && agentData.lines.length > 0) {
          const rows = agentData.lines.map((l: any) => ({
            server_id: server.id,
            line_type: l.type || 'system',
            text: l.text || '',
            source: 'agent',
            timestamp: l.timestamp ? new Date(l.timestamp * 1000).toISOString() : new Date().toISOString(),
          }));
          await safeDbWrite(supabase.from('console_lines').insert(rows), 'console_lines insert from agent');
        }

        return corsResponse({ lines: agentData.lines || [], source: 'agent', timestamp: Date.now() });
      } catch (fetchErr) {
        console.error('Agent console fetch error, falling back to DB:', fetchErr);
      }
    }

    // Query console_lines from DB
    let query = supabase
      .from('console_lines')
      .select('id, timestamp, line_type, text, source')
      .eq('server_id', server.id)
      .order('timestamp', { ascending: false })
      .limit(maxLines);

    if (since) {
      const sinceDate = new Date(since).toISOString();
      query = query.gte('timestamp', sinceDate);
    }

    const { data: dbLines, error: dbErr } = await query;
    if (dbErr) {
      console.error('DB console query error:', dbErr.message);
      return corsResponse({ lines: [], source: 'database', timestamp: Date.now() });
    }

    const lines = (dbLines || []).reverse().map((l: any) => ({
      id: l.id,
      timestamp: new Date(l.timestamp).getTime() / 1000,
      type: l.line_type,
      text: l.text,
      source: l.source,
    }));

    return corsResponse({ lines, source: 'database', timestamp: Date.now() });
  } catch (error) {
    console.error('Server console error:', error);
    return corsError('Internal server error', 500);
  }
});
