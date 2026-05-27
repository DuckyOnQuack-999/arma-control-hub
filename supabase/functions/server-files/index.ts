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
  // Normalize path
  if (!p.startsWith('/')) return false;
  return true;
}

function normalizePath(p: string): string {
  // Ensure path starts with / and remove duplicate slashes
  let normalized = p.replace(/\/+/g, '/');
  if (!normalized.startsWith('/')) normalized = '/' + normalized;
  return normalized;
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

// Panel-managed file operations using database storage
async function panelListFiles(supabase: any, serverId: number, path: string): Promise<{ files: any[] }> {
  const normalizedPath = normalizePath(path);
  const files: any[] = [];

  // Get direct children of this path
  const { data, error } = await supabase
    .from('server_files')
    .select('path, is_directory, size_bytes, updated_at')
    .eq('server_id', serverId)
    .like('path', normalizedPath === '/' ? '/%' : `${normalizedPath}/%`);

  if (error) {
    console.error('Panel file list error:', error);
    return { files: [] };
  }

  // Build directory listing - only direct children
  const directChildren = new Set<string>();
  const prefix = normalizedPath === '/' ? '' : normalizedPath;

  for (const row of data || []) {
    const relativePath = row.path.substring(prefix.length + 1);
    const parts = relativePath.split('/').filter(Boolean);
    if (parts.length > 0) {
      // Only add direct children (first path segment after current path)
      directChildren.add(parts[0]);
    }
  }

  // Get details for each direct child
  for (const name of directChildren) {
    const childPath = prefix ? `${prefix}/${name}` : `/${name}`;
    const { data: childData } = await supabase
      .from('server_files')
      .select('path, is_directory, size_bytes, updated_at')
      .eq('server_id', serverId)
      .eq('path', childPath)
      .maybeSingle();

    if (childData) {
      files.push({
        name,
        type: childData.is_directory ? 'directory' : 'file',
        size: childData.size_bytes || 0,
        modified: childData.updated_at,
      });
    } else {
      // Directory that exists but not tracked as file (has children)
      files.push({
        name,
        type: 'directory',
        size: 0,
        modified: new Date().toISOString(),
      });
    }
  }

  // Sort: directories first, then by name
  files.sort((a, b) => {
    if (a.type === 'directory' && b.type !== 'directory') return -1;
    if (a.type !== 'directory' && b.type === 'directory') return 1;
    return a.name.localeCompare(b.name);
  });

  return { files };
}

async function panelReadFile(supabase: any, serverId: number, path: string): Promise<{ content: string } | { error: string }> {
  const normalizedPath = normalizePath(path);

  const { data, error } = await supabase
    .from('server_files')
    .select('content, is_directory')
    .eq('server_id', serverId)
    .eq('path', normalizedPath)
    .maybeSingle();

  if (error) {
    return { error: 'Database error' };
  }

  if (!data) {
    return { error: 'File not found' };
  }

  if (data.is_directory) {
    return { error: 'Cannot read directory' };
  }

  return { content: data.content || '' };
}

async function panelWriteFile(supabase: any, serverId: number, path: string, content: string): Promise<{ success: boolean } | { error: string }> {
  const normalizedPath = normalizePath(path);
  const sizeBytes = new TextEncoder().encode(content).length;

  // Ensure parent directories exist
  const parts = normalizedPath.split('/').filter(Boolean);
  if (parts.length > 1) {
    let parentPath = '';
    for (let i = 0; i < parts.length - 1; i++) {
      parentPath += '/' + parts[i];
      await supabase
        .from('server_files')
        .upsert({
          server_id: serverId,
          path: parentPath,
          is_directory: true,
          size_bytes: 0,
        }, { onConflict: 'server_id,path' });
    }
  }

  const { error } = await supabase
    .from('server_files')
    .upsert({
      server_id: serverId,
      path: normalizedPath,
      content,
      is_directory: false,
      size_bytes: sizeBytes,
    }, { onConflict: 'server_id,path' });

  if (error) {
    console.error('Panel file write error:', error);
    return { error: 'Failed to write file' };
  }

  return { success: true };
}

async function panelDeleteFile(supabase: any, serverId: number, path: string): Promise<{ success: boolean } | { error: string }> {
  const normalizedPath = normalizePath(path);

  // Delete file and all children (for directories)
  const { error } = await supabase
    .from('server_files')
    .delete()
    .eq('server_id', serverId)
    .or(`path.eq.${normalizedPath},path.like.${normalizedPath}/%`);

  if (error) {
    console.error('Panel file delete error:', error);
    return { error: 'Failed to delete' };
  }

  return { success: true };
}

async function panelRenameFile(supabase: any, serverId: number, oldPath: string, newPath: string): Promise<{ success: boolean } | { error: string }> {
  const normalizedOldPath = normalizePath(oldPath);
  const normalizedNewPath = normalizePath(newPath);

  // Get all files under old path
  const { data: files, error: fetchError } = await supabase
    .from('server_files')
    .select('id, path, is_directory, content, size_bytes')
    .eq('server_id', serverId)
    .or(`path.eq.${normalizedOldPath},path.like.${normalizedOldPath}/%`);

  if (fetchError || !files || files.length === 0) {
    return { error: 'File not found' };
  }

  // Rename each file (update path)
  for (const file of files) {
    const newFilePath = file.path.replace(normalizedOldPath, normalizedNewPath);
    await supabase
      .from('server_files')
      .update({ path: newFilePath })
      .eq('id', file.id);
  }

  return { success: true };
}

async function panelMkdir(supabase: any, serverId: number, path: string): Promise<{ success: boolean } | { error: string }> {
  const normalizedPath = normalizePath(path);

  const { error } = await supabase
    .from('server_files')
    .insert({
      server_id: serverId,
      path: normalizedPath,
      is_directory: true,
      size_bytes: 0,
      content: '',
    });

  if (error) {
    if (error.code === '23505') {
      // Already exists
      return { success: true };
    }
    console.error('Panel mkdir error:', error);
    return { error: 'Failed to create directory' };
  }

  return { success: true };
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

    // Panel-managed mode: use database storage
    const useAgent = server.agent_url && validateAgentUrl(server.agent_url);

    if (!useAgent) {
      // Use panel-managed (database) file operations
      console.log(`Panel-managed file op: ${operation} for server ${serverId}`);

      let result: any;
      switch (operation) {
        case 'list':
          result = await panelListFiles(supabase, serverId, path);
          break;
        case 'read':
          result = await panelReadFile(supabase, serverId, path);
          break;
        case 'write':
        case 'upload':
          result = await panelWriteFile(supabase, serverId, path, content || '');
          break;
        case 'delete':
          result = await panelDeleteFile(supabase, serverId, path);
          break;
        case 'rename':
          result = await panelRenameFile(supabase, serverId, oldPath, newPath);
          break;
        case 'mkdir':
          result = await panelMkdir(supabase, serverId, path);
          break;
        default:
          result = { error: 'Unknown operation' };
      }

      await safeDbWrite(supabase.from('audit_log').insert({
        user_id: user.id,
        action: `files.${operation}`,
        target_type: 'server',
        target_id: String(server.id),
        details: { path: path || oldPath, operation, mode: 'panel' },
      }), 'audit_log insert for file op');

      return new Response(JSON.stringify(result), {
        status: result.error ? 400 : 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Agent mode: proxy to agent
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
      details: { path: path || oldPath, operation, mode: 'agent' },
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
