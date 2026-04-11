// Real Supabase API layer — replaces mockApi.ts
import { supabase } from '@/integrations/supabase/client';
import type { Server, Ban, Player, ServerEvent, MapFile, MetricPoint, BrowserServer } from '@/data/types';

// ─── Servers ─────────────────────────────────────────────

export async function getServers(): Promise<Server[]> {
  const { data, error } = await supabase.from('servers').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getServer(id: number): Promise<Server | null> {
  const { data, error } = await supabase.from('servers').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function createServer(data: Partial<Server> & { agent_url?: string }): Promise<Server> {
  const { data: server, error } = await supabase.from('servers').insert({
    name: data.name || 'New Server',
    executable_path: data.executable_path || '/usr/bin/armagetronad-dedicated',
    data_dir: data.data_dir || '/usr/share/armagetronad',
    config_dir: data.config_dir || '/etc/armagetronad/new',
    port: data.port || 4534,
    auto_restart: data.auto_restart ?? true,
    max_players: data.max_players || 16,
    agent_url: data.agent_url || '',
  }).select().single();
  if (error) throw error;
  return server;
}

export async function deleteServer(id: number): Promise<void> {
  const { error } = await supabase.from('servers').delete().eq('id', id);
  if (error) throw error;
}

export async function updateServer(id: number, updates: Partial<Server>): Promise<void> {
  const { error } = await supabase.from('servers').update(updates).eq('id', id);
  if (error) throw error;
}

// ─── Server Control (via Edge Function) ────────────────────

export async function serverAction(serverId: number, action: 'start' | 'stop' | 'restart' | 'kill' | 'command' | 'launch', command?: string): Promise<{ success: boolean; message: string; newStatus?: string }> {
  const { data, error } = await supabase.functions.invoke('server-control', {
    body: { serverId, action, command },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

// ─── Players ─────────────────────────────────────────────

export async function getPlayers(serverId: number): Promise<Player[]> {
  const { data, error } = await supabase.from('players').select('*')
    .eq('server_id', serverId).eq('is_online', true);
  if (error) throw error;
  return data ?? [];
}

export async function kickPlayer(serverId: number, playerName: string): Promise<void> {
  const { error } = await supabase.from('players')
    .update({ is_online: false })
    .eq('server_id', serverId).eq('name', playerName);
  if (error) throw error;
  // Also send kick command via edge function
  const safeName = playerName.replace(/[\r\n\0]/g, '').slice(0, 200);
  await serverAction(serverId, 'command', `KICK ${safeName}`);
}

// ─── Bans ─────────────────────────────────────────────

export async function getBans(serverId: number): Promise<Ban[]> {
  const { data, error } = await supabase.from('bans').select('*')
    .eq('server_id', serverId).order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function banPlayer(serverId: number, playerName: string, reason: string, durationMinutes?: number): Promise<void> {
  const expiresAt = durationMinutes && durationMinutes > 0
    ? new Date(Date.now() + durationMinutes * 60 * 1000).toISOString()
    : null;

  const { error } = await supabase.from('bans').insert({
    server_id: serverId,
    player_name: playerName,
    reason,
    expires_at: expiresAt,
  });
  if (error) throw error;

  // Also mark player offline and send ban command
  await supabase.from('players').update({ is_online: false }).eq('server_id', serverId).eq('name', playerName);
  const safeName = playerName.replace(/[\r\n\0]/g, '').slice(0, 200);
  await serverAction(serverId, 'command', `BAN ${safeName}`);
}

export async function unban(banId: number): Promise<void> {
  const { error } = await supabase.from('bans').delete().eq('id', banId);
  if (error) throw error;
}

// ─── Events / Logs ─────────────────────────────────────

export async function getEvents(serverId: number, filters?: { type?: string; search?: string }): Promise<ServerEvent[]> {
  let query = supabase.from('server_events').select('*')
    .eq('server_id', serverId).order('occurred_at', { ascending: true });

  if (filters?.type) query = query.eq('event_type', filters.type);

  const { data, error } = await query;
  if (error) throw error;

  let events = data ?? [];
  if (filters?.search) {
    const s = filters.search.toLowerCase();
    events = events.filter(e => JSON.stringify(e.payload).toLowerCase().includes(s));
  }
  return events;
}

// ─── Metrics ─────────────────────────────────────────────

export async function getMetrics(serverId: number, hours = 24): Promise<MetricPoint[]> {
  const cutoff = new Date(Date.now() - hours * 3600 * 1000).toISOString();
  const { data, error } = await supabase.from('metrics').select('*')
    .eq('server_id', serverId)
    .gte('recorded_at', cutoff)
    .order('recorded_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(m => ({
    time: new Date(m.recorded_at).getTime() / 1000,
    cpu: m.cpu_percent,
    memory: m.memory_mb,
    players: m.player_count,
  }));
}

// ─── Config ─────────────────────────────────────────────

export async function getConfig(serverId: number, filename = 'settings_custom.cfg'): Promise<Record<string, string>> {
  const { data, error } = await supabase.from('server_configs').select('*')
    .eq('server_id', serverId).eq('filename', filename);
  if (error) throw error;
  const config: Record<string, string> = {};
  (data ?? []).forEach(row => { config[row.key] = row.value; });
  return config;
}

export async function saveConfig(serverId: number, config: Record<string, string>, filename = 'settings_custom.cfg'): Promise<void> {
  const rows = Object.entries(config).map(([key, value]) => ({
    server_id: serverId,
    filename,
    key,
    value,
  }));

  for (const row of rows) {
    const { error } = await supabase.from('server_configs').upsert(row, {
      onConflict: 'server_id,filename,key',
    });
    if (error) throw error;
  }
}

export async function getRawConfig(serverId: number, filename: string): Promise<string> {
  const config = await getConfig(serverId, filename);
  return Object.entries(config).map(([k, v]) => `${k} ${v}`).join('\n');
}

export async function saveRawConfig(serverId: number, filename: string, content: string): Promise<void> {
  const config: Record<string, string> = {};
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const spaceIdx = trimmed.indexOf(' ');
    if (spaceIdx > 0) config[trimmed.substring(0, spaceIdx)] = trimmed.substring(spaceIdx + 1);
  });
  await saveConfig(serverId, config, filename);
}

// ─── Maps ─────────────────────────────────────────────

export async function getMaps(serverId: number): Promise<MapFile[]> {
  const { data, error } = await supabase.from('map_files').select('*')
    .eq('server_id', serverId).order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function deleteMap(serverId: number, filename: string): Promise<void> {
  const { data: mapFile } = await supabase.from('map_files').select('storage_path')
    .eq('server_id', serverId).eq('filename', filename).maybeSingle();
  if (mapFile?.storage_path) {
    await supabase.storage.from('maps').remove([mapFile.storage_path]);
  }
  const { error } = await supabase.from('map_files').delete()
    .eq('server_id', serverId).eq('filename', filename);
  if (error) throw error;
}

export async function uploadMap(serverId: number, file: File): Promise<void> {
  const storagePath = `${serverId}/${file.name}`;
  const { error: uploadError } = await supabase.storage.from('maps').upload(storagePath, file, { upsert: true });
  if (uploadError) throw uploadError;

  const { error } = await supabase.from('map_files').upsert({
    server_id: serverId,
    filename: file.name,
    size_bytes: file.size,
    storage_path: storagePath,
  }, { onConflict: 'server_id,filename' });
  if (error) throw error;
}

// ─── User Roles (admin only) ─────────────────────────────

export async function getUserRole(userId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_user_role', { _user_id: userId });
  if (error) return null;
  return data;
}

export async function getUserRoles(): Promise<Array<{ id: string; user_id: string; role: string }>> {
  const { data, error } = await supabase.from('user_roles').select('*');
  if (error) throw error;
  return data ?? [];
}

export async function changeUserRole(userId: string, role: 'admin' | 'moderator' | 'viewer'): Promise<void> {
  const { error } = await supabase.from('user_roles')
    .update({ role })
    .eq('user_id', userId);
  if (error) throw error;
}

export async function deleteUserRole(userId: string): Promise<void> {
  const { error } = await supabase.from('user_roles').delete().eq('user_id', userId);
  if (error) throw error;
}

// ─── Profiles ─────────────────────────────────────────────

export async function getProfiles(): Promise<Array<{ id: string; email: string; display_name: string | null }>> {
  const { data, error } = await supabase.from('profiles').select('*');
  if (error) throw error;
  return (data ?? []) as any;
}

export async function getProfile(userId: string): Promise<{ id: string; email: string; display_name: string | null } | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) return null;
  return data as any;
}

export async function updateProfile(userId: string, updates: { display_name?: string }): Promise<void> {
  const { error } = await supabase.from('profiles').update(updates).eq('id', userId);
  if (error) throw error;
}

// ─── Audit Log ─────────────────────────────────────────────

export async function getAuditLog(limit = 50): Promise<Array<{ id: number; user_id: string; action: string; target_type: string; target_id: string; details: any; created_at: string }>> {
  const { data, error } = await supabase.from('audit_log').select('*')
    .order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []) as any;
}

// ─── Recent Event Count (for notifications) ────────────────

export async function getRecentEventCount(sinceHours = 1): Promise<number> {
  const cutoff = new Date(Date.now() - sinceHours * 3600 * 1000).toISOString();
  const { count, error } = await supabase.from('server_events')
    .select('*', { count: 'exact', head: true })
    .gte('occurred_at', cutoff);
  if (error) return 0;
  return count ?? 0;
}

// ─── Server Browser (via Edge Function) ─────────────────────

export async function getBrowserServers(): Promise<BrowserServer[]> {
  try {
    const { data, error } = await supabase.functions.invoke('server-browser');
    if (error) throw error;
    return data?.servers ?? [];
  } catch {
    return [];
  }
}

// ─── Console / Commands ─────────────────────────────────

export async function sendCommand(serverId: number, command: string): Promise<string> {
  try {
    const result = await serverAction(serverId, 'command', command);
    return result.message || `> ${command}\nCommand sent`;
  } catch {
    // Fallback: insert directly to server_events
    await supabase.from('server_events').insert({
      server_id: serverId,
      event_type: 'command',
      payload: { command, source: 'panel' },
    });
    return `> ${command}\nCommand queued for server ${serverId}`;
  }
}

// ─── Password Change ─────────────────────────────────────

export async function changePassword(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

// ─── Server Status (via Agent) ─────────────────────────────

export async function pollServerStatus(serverId: number): Promise<any> {
  const { data, error } = await supabase.functions.invoke('server-status', {
    body: { serverId },
  });
  if (error) throw error;
  return data;
}

// ─── Binary Downloads ─────────────────────────────────────

export function getBinaryDownloadUrl(filename: string): string {
  const { data } = supabase.storage.from('binaries').getPublicUrl(filename);
  return data.publicUrl;
}

// ─── Recent Events (all servers) ──────────────────────────

export async function getRecentEventsAll(limit = 10): Promise<Array<ServerEvent & { server_name?: string }>> {
  const { data: events, error } = await supabase.from('server_events').select('*')
    .order('occurred_at', { ascending: false }).limit(limit);
  if (error) throw error;
  if (!events || events.length === 0) return [];

  const serverIds = [...new Set(events.map(e => e.server_id))];
  const { data: servers } = await supabase.from('servers').select('id, name').in('id', serverIds);
  const nameMap = new Map((servers ?? []).map(s => [s.id, s.name]));

  return events.map(e => ({ ...e, server_name: nameMap.get(e.server_id) || `Server #${e.server_id}` }));
}

// ─── Console Streaming (via Agent) ─────────────────────────

export async function getConsoleLines(serverId: number, since?: number): Promise<{ lines: Array<{ timestamp: number; type: string; text: string }>; source: string }> {
  const { data, error } = await supabase.functions.invoke('server-console', {
    body: { serverId, since },
  });
  if (error) throw error;
  return data;
}

// ─── Server Launch (via Agent) ─────────────────────────────

export async function launchServer(serverId: number): Promise<{ success: boolean; message: string }> {
  const { data, error } = await supabase.functions.invoke('server-control', {
    body: { serverId, action: 'launch' },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

// ─── Remote File Manager (via Agent) ───────────────────────

async function fileOperation(serverId: number, operation: string, params: Record<string, unknown> = {}): Promise<any> {
  const { data, error } = await supabase.functions.invoke('server-files', {
    body: { serverId, operation, ...params },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function listFiles(serverId: number, path: string): Promise<Array<{ name: string; type: 'file' | 'directory'; size?: number; modified?: string }>> {
  const result = await fileOperation(serverId, 'list', { path });
  return result.files ?? result ?? [];
}

export async function readFile(serverId: number, path: string): Promise<{ content: string }> {
  return await fileOperation(serverId, 'read', { path });
}

export async function writeFile(serverId: number, path: string, content: string): Promise<void> {
  await fileOperation(serverId, 'write', { path, content });
}

export async function renameFile(serverId: number, oldPath: string, newPath: string): Promise<void> {
  await fileOperation(serverId, 'rename', { oldPath, newPath });
}

export async function deleteFile(serverId: number, path: string): Promise<void> {
  await fileOperation(serverId, 'delete', { path });
}

export async function uploadFile(serverId: number, path: string, content: string): Promise<void> {
  await fileOperation(serverId, 'upload', { path, content });
}

export async function createDirectory(serverId: number, path: string): Promise<void> {
  await fileOperation(serverId, 'mkdir', { path });
}

// ─── Test Agent Connection ─────────────────────────────────

export async function testAgentConnection(serverId: number): Promise<{ reachable: boolean; version?: string; message?: string }> {
  try {
    const data = await pollServerStatus(serverId);
    return { reachable: true, version: data?.agent_version, message: 'Agent is responding' };
  } catch {
    return { reachable: false, message: 'Agent unreachable' };
  }
}
