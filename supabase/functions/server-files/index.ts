import { corsHeaders, corsResponse, corsError } from "../_shared/cors.ts";
import { safeDbWrite, authenticateUser, requireRole, logAudit, parseJsonSafe } from "../_shared/db.ts";
import { validateAgentUrl, validatePath, normalizePath } from "../_shared/validation.ts";

// Panel-managed file operations using database storage
async function panelListFiles(supabase: any, serverId: number, path: string): Promise<{ files: any[] }> {
  const normalizedPath = normalizePath(path);
  const files: any[] = [];

  const { data, error } = await supabase
    .from('server_files')
    .select('path, is_directory, size_bytes, updated_at')
    .eq('server_id', serverId)
    .like('path', normalizedPath === '/' ? '/%' : `${normalizedPath}/%`);

  if (error) {
    console.error('Panel file list error:', error);
    return { files: [] };
  }

  const directChildren = new Set<string>();
  const prefix = normalizedPath === '/' ? '' : normalizedPath;

  for (const row of data || []) {
    const relativePath = row.path.substring(prefix.length + 1);
    const parts = relativePath.split('/').filter(Boolean);
    if (parts.length > 0) {
      directChildren.add(parts[0]);
    }
  }

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
      files.push({ name, type: 'directory', size: 0, modified: new Date().toISOString() });
    }
  }

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

  if (error) return { error: 'Database error' };
  if (!data) return { error: 'File not found' };
  if (data.is_directory) return { error: 'Cannot read directory' };
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
        .upsert({ server_id: serverId, path: parentPath, is_directory: true, size_bytes: 0 }, { onConflict: 'server_id,path' });
    }
  }

  const { error } = await supabase
    .from('server_files')
    .upsert({ server_id: serverId, path: normalizedPath, content, is_directory: false, size_bytes: sizeBytes }, { onConflict: 'server_id,path' });

  if (error) {
    console.error('Panel file write error:', error);
    return { error: 'Failed to write file' };
  }
  return { success: true };
}

async function panelDeleteFile(supabase: any, serverId: number, path: string): Promise<{ success: boolean } | { error: string }> {
  const normalizedPath = normalizePath(path);
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

  const { data: files, error: fetchError } = await supabase
    .from('server_files')
    .select('id, path, is_directory, content, size_bytes')
    .eq('server_id', serverId)
    .or(`path.eq.${normalizedOldPath},path.like.${normalizedOldPath}/%`);

  if (fetchError || !files || files.length === 0) return { error: 'File not found' };

  for (const file of files) {
    const newFilePath = file.path.replace(normalizedOldPath, normalizedNewPath);
    await supabase.from('server_files').update({ path: newFilePath }).eq('id', file.id);
  }
  return { success: true };
}

async function panelMkdir(supabase: any, serverId: number, path: string): Promise<{ success: boolean } | { error: string }> {
  const normalizedPath = normalizePath(path);
  const { error } = await supabase
    .from('server_files')
    .insert({ server_id: serverId, path: normalizedPath, is_directory: true, size_bytes: 0, content: '' });

  if (error) {
    if (error.code === '23505') return { success: true }; // Already exists
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
    const authResult = await authenticateUser(req.headers.get('Authorization'));
    if (authResult instanceof Response) return authResult;
    const { user, supabase } = authResult;

    const hasRole = await requireRole(supabase, user.id, ['admin', 'moderator']);
    if (!hasRole) return corsError('Insufficient permissions', 403);

    let body: { serverId?: number; operation?: string; path?: string; content?: string; oldPath?: string; newPath?: string };
    try {
      body = await req.json();
    } catch {
      return corsError('Invalid request body');
    }

    const { serverId, operation, path, content, oldPath, newPath } = body;

    if (!serverId || !operation) return corsError('serverId and operation required');

    const validOps = ['list', 'read', 'write', 'rename', 'delete', 'mkdir', 'upload'];
    if (!validOps.includes(operation)) return corsError(`Unknown operation: ${operation}`);

    if (operation === 'rename') {
      if (!validatePath(oldPath!) || !validatePath(newPath!)) {
        return corsError('Invalid path (traversal or null bytes not allowed)');
      }
    } else if (['list', 'read', 'write', 'delete', 'mkdir', 'upload'].includes(operation)) {
      if (!validatePath(path!)) {
        return corsError('Invalid path (traversal or null bytes not allowed)');
      }
    }

    const { data: server, error: serverErr } = await supabase
      .from('servers').select('id, name, agent_url').eq('id', serverId).maybeSingle();
    if (serverErr || !server) return corsError('Server not found', 404);

    const useAgent = server.agent_url && validateAgentUrl(server.agent_url);

    if (!useAgent) {
      let result: any;
      switch (operation) {
        case 'list': result = await panelListFiles(supabase, serverId, path!); break;
        case 'read': result = await panelReadFile(supabase, serverId, path!); break;
        case 'write': case 'upload': result = await panelWriteFile(supabase, serverId, path!, content || ''); break;
        case 'delete': result = await panelDeleteFile(supabase, serverId, path!); break;
        case 'rename': result = await panelRenameFile(supabase, serverId, oldPath!, newPath!); break;
        case 'mkdir': result = await panelMkdir(supabase, serverId, path!); break;
        default: result = { error: 'Unknown operation' };
      }

      await logAudit(supabase, user.id, `files.${operation}`, 'server', String(server.id), { path: path || oldPath, operation, mode: 'panel' });

      return corsResponse(result, 'error' in result ? 400 : 200);
    }

    // Agent mode: proxy to agent
    const agentUrl = server.agent_url.replace(/\/$/, '');
    let agentResp: Response;

    try {
      switch (operation) {
        case 'list':
          agentResp = await fetch(`${agentUrl}/files?path=${encodeURIComponent(path!)}`, { method: 'GET', signal: AbortSignal.timeout(15000) });
          break;
        case 'read':
          agentResp = await fetch(`${agentUrl}/files/read?path=${encodeURIComponent(path!)}`, { method: 'GET', signal: AbortSignal.timeout(15000) });
          break;
        case 'write':
          agentResp = await fetch(`${agentUrl}/files/write`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, content }), signal: AbortSignal.timeout(15000) });
          break;
        case 'rename':
          agentResp = await fetch(`${agentUrl}/files/rename`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ oldPath, newPath }), signal: AbortSignal.timeout(15000) });
          break;
        case 'delete':
          agentResp = await fetch(`${agentUrl}/files/delete`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }), signal: AbortSignal.timeout(15000) });
          break;
        case 'mkdir':
          agentResp = await fetch(`${agentUrl}/files/mkdir`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }), signal: AbortSignal.timeout(15000) });
          break;
        case 'upload':
          agentResp = await fetch(`${agentUrl}/files/upload`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, content }), signal: AbortSignal.timeout(30000) });
          break;
        default:
          return corsError('Unknown operation');
      }
    } catch (fetchErr) {
      console.error('Agent file proxy error:', fetchErr);
      return corsError('Agent unreachable — check host agent status', 502);
    }

    await logAudit(supabase, user.id, `files.${operation}`, 'server', String(server.id), { path: path || oldPath, operation, mode: 'agent' });

    const agentData = await parseJsonSafe(agentResp);
    return corsResponse(agentData, agentResp.ok ? 200 : agentResp.status);

  } catch (error: any) {
    console.error('Server files error:', error);
    const status = error.message === 'Unauthorized' || error.message === 'Missing authorization' ? 401
      : error.message === 'Insufficient permissions' ? 403 : 500;
    return corsError(error.message || 'Internal server error', status);
  }
});
