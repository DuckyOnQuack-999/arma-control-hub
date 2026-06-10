import { corsHeaders, corsResponse, corsError } from "../_shared/cors.ts";
import { safeDbWrite, authenticateUser, requireRole, writeConsoleLine, logAudit, logServerEvent, parseJsonSafe } from "../_shared/db.ts";
import { validateAgentUrl, sanitizeCommand } from "../_shared/validation.ts";

interface ServerRow {
  id: number;
  name: string;
  status: string;
  executable_path: string;
  config_dir: string;
  data_dir: string;
  port: number;
  max_players: number;
  agent_url: string;
  auto_restart: boolean;
}

interface AgentResponse {
  status?: string;
  message?: string;
  player_count?: number;
  cpu_percent?: number;
  memory_mb?: number;
  console_lines?: Array<{ type?: string; text?: string }>;
  [key: string]: unknown;
}

async function prepareConfigFiles(supabase: any, serverId: number): Promise<void> {
  const { data: configs, error } = await supabase
    .from('server_configs')
    .select('filename, key, value')
    .eq('server_id', serverId);

  if (error || !configs || configs.length === 0) return;

  const files: Record<string, string[]> = {};
  for (const cfg of configs) {
    const file = cfg.filename || 'settings_custom.cfg';
    if (!files[file]) files[file] = [];
    files[file].push(`${cfg.key} ${cfg.value}`);
  }

  for (const [filename, lines] of Object.entries(files)) {
    const content = lines.join('\n') + '\n';
    const path = `/config/${filename}`;
    await safeDbWrite(
      supabase.from('server_files').upsert({
        server_id: serverId, path, content,
        is_directory: false,
        size_bytes: new TextEncoder().encode(content).length,
      }, { onConflict: 'server_id,path' }),
      `config file ${filename} write`,
    );
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authResult = await authenticateUser(req.headers.get('Authorization'));
    if (authResult instanceof Response) return authResult;
    const { user, supabase } = authResult;

    const hasRole = await requireRole(user.id, ['admin', 'operator']);
    if (hasRole instanceof Response) return hasRole;

    const body = await req.json().catch(() => ({}));
    const { serverId, action, command, config } = body;

    if (!serverId) return corsError('serverId required');
    if (!action) return corsError('action required');

    const { data: server, error: serverErr } = await supabase
      .from('servers')
      .select('*')
      .eq('id', serverId)
      .maybeSingle();

    if (serverErr || !server) return corsError('Server not found', 404);

    const validActions = ['start', 'stop', 'restart', 'kill', 'command'];
    if (!validActions.includes(action)) return corsError(`Invalid action: ${action}`);

    // Try agent first
    if (server.agent_url && validateAgentUrl(server.agent_url)) {
      try {
        const agentUrl = server.agent_url.replace(/\/$/, '');
        const agentToken = server.agent_token || 'default-agent-token';
        const serverIdStr = String(serverId);

        let agentResp: Response;
        let agentData: AgentResponse;

        if (action === 'start') {
          await prepareConfigFiles(supabase, serverId);
          agentResp = await fetch(`${agentUrl}/api/servers/${serverIdStr}/start`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${agentToken}`,
            },
            body: JSON.stringify({
              id: server.id,
              name: server.name,
              executablePath: server.executable_path,
              dataDir: server.data_dir,
              configDir: server.config_dir,
              port: server.port,
              maxPlayers: server.max_players,
              autoRestart: server.auto_restart,
            }),
            signal: AbortSignal.timeout(30000),
          });
        } else if (action === 'command') {
          const sanitized = sanitizeCommand(command || '');
          if (!sanitized) return corsError('Invalid command');

          agentResp = await fetch(`${agentUrl}/api/servers/${serverIdStr}/command`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${agentToken}`,
            },
            body: JSON.stringify({ command: sanitized }),
            signal: AbortSignal.timeout(10000),
          });
        } else {
          agentResp = await fetch(`${agentUrl}/api/servers/${serverIdStr}/${action}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${agentToken}`,
            },
            signal: AbortSignal.timeout(30000),
          });
        }

        agentData = await parseJsonSafe(agentResp);

        if (agentData.success !== false) {
          // Update DB status
          const statusMap: Record<string, string> = {
            start: 'online',
            stop: 'offline',
            restart: 'online',
            kill: 'offline',
          };

          if (statusMap[action]) {
            await safeDbWrite(
              supabase.from('servers').update({ status: statusMap[action] }).eq('id', server.id),
              `server status ${action}`,
            );
          }

          // Log event
          await logServerEvent(supabase, server.id, action, user.id);
          await logAudit(supabase, user.id, `server_${action}`, `Server ${server.name} (${server.id})`, { command: sanitized });

          // Write console line for command
          if (action === 'command') {
            await writeConsoleLine(supabase, server.id, 'command', `> ${sanitized}`);
          }

          return corsResponse({
            success: true,
            message: agentData.message || `${action} executed`,
            source: 'agent',
          });
        }
      } catch (fetchErr) {
        console.error('Agent fetch error:', fetchErr);
      }
    }

    // DB fallback
    const statusMap: Record<string, string> = {
      start: 'online',
      stop: 'offline',
      restart: 'online',
      kill: 'offline',
    };

    if (statusMap[action]) {
      await safeDbWrite(
        supabase.from('servers').update({ status: statusMap[action] }).eq('id', server.id),
        `server status ${action} fallback`,
      );
    }

    if (action === 'command') {
      const sanitized = sanitizeCommand(command || '');
      await writeConsoleLine(supabase, server.id, 'command', `> ${sanitized}`);
    }

    await logServerEvent(supabase, server.id, action, user.id);
    await logAudit(supabase, user.id, `server_${action}`, `Server ${server.name} (${server.id})`, { command: command || '' });

    return corsResponse({
      success: true,
      message: `${action} executed (fallback)`,
      source: 'database',
    });

  } catch (error) {
    console.error('Server control error:', error);
    return corsError('Internal server error', 500);
  }
});
