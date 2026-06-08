import { corsHeaders, corsResponse, corsError } from "../_shared/cors.ts";
import { safeDbWrite, authenticateUser, parseJsonSafe } from "../_shared/db.ts";

interface ConsoleLine {
  id: number;
  timestamp: number;
  type: string;
  text: string;
  source?: string;
}

interface ConsoleRequest {
  serverId?: number;
  since?: number;
  limit?: number;
  types?: string[];      // Filter by line types: 'error', 'warning', 'chat', 'system', 'info', 'join', 'leave', 'kill'
  search?: string;      // Search in text content
  reverse?: boolean;    // Return in chronological order (default: newest first)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authResult = await authenticateUser(req.headers.get('Authorization'));
    if (authResult instanceof Response) return authResult;
    const { supabase } = authResult;

    let body: ConsoleRequest;
    try {
      body = await req.json();
    } catch {
      return corsError('Invalid request body');
    }

    const { serverId, since, limit, types, search, reverse } = body;
    if (!serverId) return corsError('serverId required');

    const { data: server, error: serverErr } = await supabase
      .from('servers').select('id, agent_url').eq('id', serverId).maybeSingle();
    if (serverErr || !server) return corsError('Server not found', 404);

    const maxLines = Math.min(limit || 500, 2000);

    // If agent is configured, try fetching from agent first
    if (server.agent_url) {
      try {
        const agentUrl = server.agent_url.replace(/\/$/, '');
        const params = new URLSearchParams();
        if (since) params.set('since', String(since));
        if (limit) params.set('limit', String(maxLines));
        if (types && types.length > 0) params.set('types', types.join(','));
        if (search) params.set('search', search);

        const queryString = params.toString();
        const agentResp = await fetch(`${agentUrl}/console${queryString ? `?${queryString}` : ''}`, {
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

        return corsResponse({
          lines: agentData.lines || [],
          source: 'agent',
          timestamp: Date.now(),
          total: agentData.lines?.length || 0,
        });
      } catch (fetchErr) {
        console.error('Agent console fetch error, falling back to DB:', fetchErr);
      }
    }

    // Query console_lines from DB
    let query = supabase
      .from('console_lines')
      .select('id, timestamp, line_type, text, source', { count: 'exact' })
      .eq('server_id', server.id)
      .order('timestamp', { ascending: false })
      .limit(maxLines);

    // Filter by timestamp
    if (since) {
      const sinceDate = new Date(since).toISOString();
      query = query.gte('timestamp', sinceDate);
    }

    // Filter by line types
    if (types && types.length > 0) {
      const validTypes = types.filter(t =>
        ['error', 'warning', 'chat', 'system', 'info', 'join', 'leave', 'kill'].includes(t)
      );
      if (validTypes.length > 0) {
        query = query.in('line_type', validTypes);
      }
    }

    const { data: dbLines, error: dbErr, count } = await query;
    if (dbErr) {
      console.error('DB console query error:', dbErr.message);
      return corsResponse({ lines: [], source: 'database', timestamp: Date.now(), total: 0 });
    }

    // Apply text search filter in-memory (more flexible)
    let filteredLines = dbLines || [];
    if (search) {
      const searchLower = search.toLowerCase();
      filteredLines = filteredLines.filter(l =>
        l.text?.toLowerCase().includes(searchLower)
      );
    }

    // Map to output format
    const lines: ConsoleLine[] = filteredLines.map((l: any) => ({
      id: l.id,
      timestamp: new Date(l.timestamp).getTime() / 1000,
      type: l.line_type,
      text: l.text,
      source: l.source,
    }));

    // Reverse if chronological order requested
    if (reverse !== false) {
      lines.reverse();
    }

    // Get statistics for the response
    const typeCounts: Record<string, number> = {};
    for (const l of dbLines || []) {
      typeCounts[l.line_type] = (typeCounts[l.line_type] || 0) + 1;
    }

    return corsResponse({
      lines,
      source: 'database',
      timestamp: Date.now(),
      total: lines.length,
      hasMore: (count || 0) > maxLines,
      typeCounts,
    });
  } catch (error) {
    console.error('Server console error:', error);
    return corsError('Internal server error', 500);
  }
});
