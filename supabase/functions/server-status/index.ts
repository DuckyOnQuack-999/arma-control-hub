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

    // Verify user
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

    const { serverId } = await req.json();

    if (!serverId) {
      return new Response(JSON.stringify({ error: 'serverId required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: server, error: serverErr } = await supabase
      .from('servers').select('id, name, status, agent_url, port').eq('id', serverId).maybeSingle();
    if (serverErr || !server) {
      return new Response(JSON.stringify({ error: 'Server not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!server.agent_url) {
      return new Response(JSON.stringify({
        success: true,
        status: server.status,
        message: 'No agent configured — returning database status only',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Query the agent for live status
    const agentUrl = server.agent_url.replace(/\/$/, '');
    try {
      const agentResp = await fetch(`${agentUrl}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverId: server.id }),
        signal: AbortSignal.timeout(10000),
      });

      const agentData = await agentResp.json();

      // Update the servers table with live data
      const updates: Record<string, unknown> = {};
      if (agentData.status) updates.status = agentData.status;
      if (typeof agentData.player_count === 'number') updates.player_count = agentData.player_count;
      if (typeof agentData.cpu_percent === 'number') updates.cpu_percent = agentData.cpu_percent;
      if (typeof agentData.memory_mb === 'number') updates.memory_mb = agentData.memory_mb;
      if (agentData.current_map) updates.current_map = agentData.current_map;
      if (typeof agentData.uptime === 'number') updates.uptime = agentData.uptime;

      if (Object.keys(updates).length > 0) {
        await supabase.from('servers').update(updates).eq('id', server.id);
      }

      // Insert metrics snapshot
      if (typeof agentData.cpu_percent === 'number') {
        await supabase.from('metrics').insert({
          server_id: server.id,
          cpu_percent: agentData.cpu_percent || 0,
          memory_mb: agentData.memory_mb || 0,
          player_count: agentData.player_count || 0,
        });
      }

      return new Response(JSON.stringify({
        success: true,
        ...agentData,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (fetchErr) {
      return new Response(JSON.stringify({
        error: `Agent unreachable: ${fetchErr instanceof Error ? fetchErr.message : 'timeout'}`,
        status: server.status,
      }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (error) {
    console.error('Server status error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
