export type ServerStatus = 'online' | 'offline' | 'starting' | 'stopping';
export type UserRole = 'admin' | 'operator' | 'viewer';
export type EventType = 'start' | 'stop' | 'crash' | 'restart' | 'player_join' | 'player_leave' | 'kill' | 'ban' | 'chat' | 'round_end' | 'kick';
export type ConsoleLineType = 'error' | 'warning' | 'join' | 'leave' | 'chat' | 'system' | 'kill' | 'info';
export type ConfigValueType = 'int' | 'float' | 'string' | 'bool';
export type ConfigSection = 'gameplay' | 'network' | 'physics' | 'scoring' | 'admin' | 'misc';

export interface User {
  id: number;
  username: string;
  role: UserRole;
  createdAt: number;
}

export interface Server {
  id: number;
  name: string;
  executablePath: string;
  dataDir: string;
  configDir: string;
  port: number;
  autoRestart: boolean;
  maxPlayers: number;
  createdAt: number;
  status: ServerStatus;
  currentMap: string;
  playerCount: number;
  cpuPercent: number;
  memoryMb: number;
  uptime: number;
}

export interface Player {
  name: string;
  ip: string;
  score: number;
  ping: number;
  joinTime: number;
}

export interface Ban {
  id: number;
  serverId: number;
  playerName: string;
  ipAddress: string;
  reason: string;
  bannedBy: string;
  expiresAt: number | null;
  createdAt: number;
}

export interface ServerEvent {
  id: number;
  serverId: number;
  eventType: EventType;
  payload: Record<string, string>;
  occurredAt: number;
}

export interface MetricPoint {
  time: number;
  cpu: number;
  memory: number;
  players: number;
}

export interface ConsoleLine {
  id: number;
  timestamp: number;
  type: ConsoleLineType;
  text: string;
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

export interface MapFile {
  filename: string;
  sizeBytes: number;
  modifiedAt: number;
}
