export interface ServerConfig {
  id: number;
  name: string;
  executablePath: string;
  dataDir: string;
  configDir: string;
  port: number;
  maxPlayers: number;
  autoRestart: boolean;
  mapRotation: string[];
  currentMap: string;
  gameMode: string;
}

export interface ConsoleLine {
  id: string;
  type: 'system' | 'info' | 'warning' | 'error' | 'chat' | 'player' | 'kill' | 'command';
  text: string;
  timestamp: number;
  serverId: string;
}

export interface PlayerEvent {
  id: string;
  serverId: string;
  type: 'join' | 'leave' | 'chat' | 'kill' | 'kick' | 'ban' | 'silence';
  playerName?: string;
  targetName?: string;
  message?: string;
  timestamp: number;
  details?: Record<string, unknown>;
}

export interface PlayerState {
  name: string;
  ip?: string;
  joinedAt: number;
  score?: number;
  isSilenced: boolean;
  isBanned: boolean;
}

export interface ProcessInfo {
  status: 'online' | 'offline' | 'starting' | 'stopping' | 'crashed';
  player_count: number;
  cpu_percent: number;
  memory_mb: number;
  uptime: number;
  current_map: string;
  pid?: number;
}

export interface MetricPoint {
  serverId: string;
  timestamp: number;
  cpu: number;
  memory: number;
  playerCount: number;
}

export interface ServerProcess {
  id: string;
  ptyProcess: import('node-pty').IPty;
  config: ServerConfig;
  status: ProcessInfo['status'];
  startTime: number;
  consoleBuffer: ConsoleLine[];
  pid?: number;
  players: Map<string, PlayerState>;
  metrics: MetricPoint[];
  lastMetricTime: number;
}

export interface ParsedConfig {
  [key: string]: string | number | boolean;
}

export interface ServerBrowserEntry {
  name: string;
  ip: string;
  port: number;
  players: number;
  maxPlayers: number;
  map: string;
  version: string;
  ping?: number;
}
