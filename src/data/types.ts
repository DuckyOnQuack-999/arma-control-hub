// Types derived from Supabase schema — used across the app
import type { Tables, Enums } from '@/integrations/supabase/types';

// Re-export DB row types with friendlier names
export type Server = Tables<'servers'>;
export type Ban = Tables<'bans'>;
export type MapFile = Tables<'map_files'>;
export type MetricRow = Tables<'metrics'>;
export type Player = Tables<'players'>;
export type ServerConfig = Tables<'server_configs'>;
export type ServerEvent = Tables<'server_events'>;
export type UserRole = Enums<'app_role'>;

// Derived types for UI
export type ServerStatus = 'online' | 'offline' | 'starting' | 'stopping' | 'crashed';
export type EventType = 'start' | 'stop' | 'crash' | 'restart' | 'player_join' | 'player_leave' | 'kill' | 'ban' | 'chat' | 'round_end' | 'kick';
export type ConsoleLineType = 'error' | 'warning' | 'join' | 'leave' | 'chat' | 'system' | 'kill' | 'info';
export type ConfigValueType = 'int' | 'float' | 'string' | 'bool';
export type ConfigSection = 'gameplay' | 'network' | 'physics' | 'scoring' | 'admin' | 'misc';

export interface ConsoleLine {
  id: number;
  timestamp: number;
  type: ConsoleLineType;
  text: string;
}

export interface MetricPoint {
  time: number;
  cpu: number;
  memory: number;
  players: number;
}

export interface ConfigKeyMeta {
  key: string;
  defaultValue: string;
  description: string;
  type: ConfigValueType;
  min?: number;
  max?: number;
  section: ConfigSection;
}

export interface BrowserServer {
  id: number;
  name: string;
  host: string;
  port: number;
  map: string;
  players: number;
  maxPlayers: number;
  ping: number;
  gameType: string;
}

// User info for auth store
export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}
