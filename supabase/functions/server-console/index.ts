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

    const { serverId, since } = await req.json();
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

    if (!server.agent_url) {
      return new Response(JSON.stringify({ lines: [], source: 'database' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const agentUrl = server.agent_url.replace(/\/$/, '');
    const sinceParam = since ? `?since=${since}` : '';

    try {
      const agentResp = await fetch(`${agentUrl}/console${sinceParam}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000),
      });

      const agentData = await agentResp.json();

      return new Response(JSON.stringify({
        lines: agentData.lines || [],
        source: 'agent',
        timestamp: Date.now(),
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (fetchErr) {
      console.error('Agent console fetch error:', fetchErr);
      return new Response(JSON.stringify({
        lines: [],
        source: 'agent',
        error: 'Agent unreachable',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (error) {
    console.error('Server console error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
