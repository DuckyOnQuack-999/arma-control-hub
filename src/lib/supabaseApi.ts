// Real Supabase API layer — replaces mockApi.ts
import { supabase } from '@/integrations/supabase/client';
import type { Server, Ban, Player, ServerEvent, MetricRow, MapFile, MetricPoint, BrowserServer } from '@/data/types';

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

export async function createServer(data: Partial<Server>): Promise<Server> {
  const { data: server, error } = await supabase.from('servers').insert({
    name: data.name || 'New Server',
    executable_path: data.executable_path || '/usr/bin/armagetronad-dedicated',
    data_dir: data.data_dir || '/usr/share/armagetronad',
    config_dir: data.config_dir || '/etc/armagetronad/new',
    port: data.port || 4537,
    auto_restart: data.auto_restart ?? true,
    max_players: data.max_players || 16,
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

  // Also mark player offline
  await kickPlayer(serverId, playerName);
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
  // search is done client-side on payload

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
  // Upsert all keys
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
  // Delete from storage if exists
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
  // Upsert: update existing role row
  const { error } = await supabase.from('user_roles')
    .update({ role })
    .eq('user_id', userId);
  if (error) throw error;
}

export async function deleteUserRole(userId: string): Promise<void> {
  const { error } = await supabase.from('user_roles').delete().eq('user_id', userId);
  if (error) throw error;
}

// ─── Server Browser (static/mock for now — would come from master server) ─

export async function getBrowserServers(): Promise<BrowserServer[]> {
  // This would normally query a master server list via edge function
  // For now return empty — this data comes from UDP queries which can't run in browser
  return [];
}

// ─── Console / Commands ─────────────────────────────────
// Console commands are sent via edge functions to the actual game server agent
// For now, log to server_events

export async function sendCommand(serverId: number, command: string): Promise<string> {
  await supabase.from('server_events').insert({
    server_id: serverId,
    event_type: 'command',
    payload: { command, source: 'panel' },
  });
  return `> ${command}\nCommand queued for server ${serverId}`;
}
