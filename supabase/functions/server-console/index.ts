import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

async function safeDbWrite(op: Promise<{ error: any }>, label: string) {
  const { error } = await op;
  if (error) console.error(`DB write error (${label}):`, error.message);
}

async function parseJsonSafe(resp: Response): Promise<any> {
  try {
    return await resp.json();
  } catch {
    console.error('Failed to parse agent response as JSON');
    return { error: 'Agent returned invalid JSON' };
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

    const { serverId, since, limit } = body;
    if (!serverId) {
      return new Response(JSON.stringify({ error: 'serverId required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: server, error: serverErr } = await supabase
      .from('servers').select('id, agent_url').eq('id', serverId).maybeSingle();
    if (serverErr || !server) {
      return new Response(JSON.stringify({ error: 'Server not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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

        // Persist agent console lines to DB
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

        return new Response(JSON.stringify({
          lines: agentData.lines || [],
          source: 'agent',
          timestamp: Date.now(),
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
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
      return new Response(JSON.stringify({ lines: [], source: 'database', timestamp: Date.now() }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const lines = (dbLines || []).reverse().map(l => ({
      id: l.id,
      timestamp: new Date(l.timestamp).getTime() / 1000,
      type: l.line_type,
      text: l.text,
      source: l.source,
    }));

    return new Response(JSON.stringify({
      lines,
      source: 'database',
      timestamp: Date.now(),
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Server console error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
