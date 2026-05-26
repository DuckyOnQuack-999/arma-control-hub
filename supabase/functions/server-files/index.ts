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

function validatePath(p: string): boolean {
  if (!p || typeof p !== 'string') return false;
  if (p.includes('\0')) return false;
  if (p.includes('..')) return false;
  if (p.length > 1024) return false;
  return true;
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
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
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

    const { data: hasAdmin } = await supabase.rpc('has_role', { _user_id: user.id, _role: 'admin' });
    const { data: hasMod } = await supabase.rpc('has_role', { _user_id: user.id, _role: 'moderator' });
    if (!hasAdmin && !hasMod) {
      return new Response(JSON.stringify({ error: 'Insufficient permissions' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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

    const { serverId, operation, path, content, oldPath, newPath } = body;

    if (!serverId || !operation) {
      return new Response(JSON.stringify({ error: 'serverId and operation required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const validOps = ['list', 'read', 'write', 'rename', 'delete', 'mkdir', 'upload'];
    if (!validOps.includes(operation)) {
      return new Response(JSON.stringify({ error: `Unknown operation: ${operation}` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (operation === 'rename') {
      if (!validatePath(oldPath) || !validatePath(newPath)) {
        return new Response(JSON.stringify({ error: 'Invalid path (traversal or null bytes not allowed)' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } else if (['list', 'read', 'write', 'delete', 'mkdir', 'upload'].includes(operation)) {
      if (!validatePath(path)) {
        return new Response(JSON.stringify({ error: 'Invalid path (traversal or null bytes not allowed)' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const { data: server, error: serverErr } = await supabase
      .from('servers').select('id, name, agent_url').eq('id', serverId).maybeSingle();
    if (serverErr || !server) {
      return new Response(JSON.stringify({ error: 'Server not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!server.agent_url) {
      return new Response(JSON.stringify({ error: 'No agent configured — file management requires a host agent' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!validateAgentUrl(server.agent_url)) {
      return new Response(JSON.stringify({ error: 'Invalid agent URL configuration' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const agentUrl = server.agent_url.replace(/\/$/, '');
    let agentResp: Response;

    try {
      switch (operation) {
        case 'list':
          agentResp = await fetch(`${agentUrl}/files?path=${encodeURIComponent(path)}`, {
            method: 'GET', signal: AbortSignal.timeout(15000),
          });
          break;
        case 'read':
          agentResp = await fetch(`${agentUrl}/files/read?path=${encodeURIComponent(path)}`, {
            method: 'GET', signal: AbortSignal.timeout(15000),
          });
          break;
        case 'write':
          agentResp = await fetch(`${agentUrl}/files/write`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path, content }), signal: AbortSignal.timeout(15000),
          });
          break;
        case 'rename':
          agentResp = await fetch(`${agentUrl}/files/rename`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ oldPath, newPath }), signal: AbortSignal.timeout(15000),
          });
          break;
        case 'delete':
          agentResp = await fetch(`${agentUrl}/files/delete`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path }), signal: AbortSignal.timeout(15000),
          });
          break;
        case 'mkdir':
          agentResp = await fetch(`${agentUrl}/files/mkdir`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path }), signal: AbortSignal.timeout(15000),
          });
          break;
        case 'upload':
          agentResp = await fetch(`${agentUrl}/files/upload`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path, content }), signal: AbortSignal.timeout(30000),
          });
          break;
        default:
          return new Response(JSON.stringify({ error: 'Unknown operation' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
      }
    } catch (fetchErr) {
      console.error('Agent file proxy error:', fetchErr);
      return new Response(JSON.stringify({ error: 'Agent unreachable — check host agent status' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await safeDbWrite(supabase.from('audit_log').insert({
      user_id: user.id,
      action: `files.${operation}`,
      target_type: 'server',
      target_id: String(server.id),
      details: { path: path || oldPath, operation },
    }), 'audit_log insert for file op');

    const agentData = await parseJsonSafe(agentResp);
    return new Response(JSON.stringify(agentData), {
      status: agentResp.ok ? 200 : agentResp.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Server files error:', error);
    const status = error.message === 'Unauthorized' ? 401
      : error.message === 'Missing authorization' ? 401
      : error.message === 'Insufficient permissions' ? 403
      : 500;
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
      status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
