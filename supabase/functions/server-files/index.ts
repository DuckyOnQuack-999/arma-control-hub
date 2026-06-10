import { corsHeaders, corsResponse, corsError } from "../_shared/cors.ts";
import { authenticateUser, parseJsonSafe } from "../_shared/db.ts";
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
    const { serverId, path: filePath, content, dir } = body;

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

        if (req.method === 'GET') {
          // List files or read file
          if (dir !== undefined) {
            const agentResp = await fetch(`${agentUrl}/api/servers/${serverId}/files?dir=${encodeURIComponent(dir || '')}`, {
              method: 'GET',
              headers: { 'Authorization': `Bearer ${agentToken}` },
              signal: AbortSignal.timeout(5000),
            });
            const agentData = await parseJsonSafe(agentResp);
            if (Array.isArray(agentData)) {
              return corsResponse({ entries: agentData, source: 'agent' });
            }
          } else if (filePath) {
            const agentResp = await fetch(`${agentUrl}/api/servers/${serverId}/files/${encodeURIComponent(filePath)}`, {
              method: 'GET',
              headers: { 'Authorization': `Bearer ${agentToken}` },
              signal: AbortSignal.timeout(5000),
            });
            const agentData = await parseJsonSafe(agentResp);
            if (agentData.content !== undefined) {
              return corsResponse({ ...agentData, source: 'agent' });
            }
          }
        } else if (req.method === 'POST' && filePath && content !== undefined) {
          const agentResp = await fetch(`${agentUrl}/api/servers/${serverId}/files/${encodeURIComponent(filePath)}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${agentToken}`,
            },
            body: JSON.stringify({ content }),
            signal: AbortSignal.timeout(10000),
          });
          const agentData = await parseJsonSafe(agentResp);
          if (agentData.success !== false) {
            return corsResponse({ success: true, source: 'agent' });
          }
        }
      } catch (fetchErr) {
        console.error('Agent files fetch error:', fetchErr);
      }
    }

    // DB fallback
    if (req.method === 'GET') {
      if (dir !== undefined) {
        const { data: files, error } = await supabase
          .from('server_files')
          .select('*')
          .eq('server_id', serverId)
          .like('path', `${dir || ''}%`)
          .order('path');

        if (error) return corsError('Failed to list files', 500);

        const entries = (files || []).map((f: any) => ({
          name: f.path.split('/').pop(),
          type: f.is_directory ? 'directory' : 'file',
          size: f.size_bytes || 0,
          modified: f.updated_at,
        }));

        return corsResponse({ entries, source: 'database' });
      } else if (filePath) {
        const { data: file, error } = await supabase
          .from('server_files')
          .select('*')
          .eq('server_id', serverId)
          .eq('path', filePath)
          .maybeSingle();

        if (error || !file) return corsError('File not found', 404);

        return corsResponse({ content: file.content, path: file.path, source: 'database' });
      }
    } else if (req.method === 'POST' && filePath && content !== undefined) {
      const { error } = await supabase.from('server_files').upsert({
        server_id: serverId,
        path: filePath,
        content,
        is_directory: false,
        size_bytes: new TextEncoder().encode(content).length,
      }, { onConflict: 'server_id,path' });

      if (error) return corsError('Failed to write file', 500);

      return corsResponse({ success: true, source: 'database' });
    }

    return corsError('Invalid request', 400);

  } catch (error) {
    console.error('Server files error:', error);
    return corsError('Internal server error', 500);
  }
});
