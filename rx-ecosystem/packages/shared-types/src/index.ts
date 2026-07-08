// Core server types
export interface ServerConfig {
  name: string;
  gameMode: 'CTF' | 'SUMO' | 'RACE' | 'DOGFIGHT' | 'CUSTOM';
  maxPlayers: number;
  port?: number;
  mapRotation?: string[];
  customCfg?: Record<string, string>;
  autoRestart?: boolean;
}

export interface ServerInstance {
  id: string;
  name: string;
  port: number;
  state: ServerState;
  players: Player[];
  currentMap: string;
  basePath: string;
  gameMode: string;
  maxPlayers: number;
  autoRestart: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type ServerState = 'idle' | 'starting' | 'running' | 'crashed' | 'stopping';

export interface Player {
  name: string;
  ip?: string;
  joinedAt: Date;
  isAuthenticated?: boolean;
  clanTag?: string;
}

export interface ServerProcess {
  id: string;
  pid: number;
  state: ServerState;
  startTime?: Date;
  resourceUsage?: ResourceUsage;
}

export interface ResourceUsage {
  cpu: number;
  memory: number;
}

// Event types
export type EventType =
  | 'server:create'
  | 'server:start'
  | 'server:stop'
  | 'server:crash'
  | 'server:restart'
  | 'log'
  | 'player:join'
  | 'player:leave'
  | 'map:change'
  | 'match:start'
  | 'match:end'
  | 'resource:update'
  | 'admin:command';

export interface BaseEvent {
  type: EventType;
  timestamp: Date;
  serverId?: string;
}

export interface ServerEvent extends BaseEvent {
  type: 'server:create' | 'server:start' | 'server:stop' | 'server:crash' | 'server:restart';
  serverId: string;
  data: ServerInstance;
}

export interface LogEvent extends BaseEvent {
  type: 'log';
  serverId: string;
  data: { line: string; level: 'info' | 'warn' | 'error' };
}

export interface PlayerEvent extends BaseEvent {
  type: 'player:join' | 'player:leave';
  serverId: string;
  data: { playerName: string; ip?: string; clanTag?: string };
}

export interface MapChangeEvent extends BaseEvent {
  type: 'map:change';
  serverId: string;
  data: { mapName: string };
}

export interface MatchEvent extends BaseEvent {
  type: 'match:start' | 'match:end';
  serverId: string;
  data: { matchId: string; mode: string };
}

export interface ResourceEvent extends BaseEvent {
  type: 'resource:update';
  serverId: string;
  data: ResourceUsage;
}

export interface AdminCommandEvent extends BaseEvent {
  type: 'admin:command';
  serverId: string;
  data: { command: string; adminId: string; result: 'success' | 'failed' };
}

export type AppEvent =
  | ServerEvent
  | LogEvent
  | PlayerEvent
  | MapChangeEvent
  | MatchEvent
  | ResourceEvent
  | AdminCommandEvent;

// WebSocket message types
export interface WSMessage {
  type: 'subscribe' | 'unsubscribe' | 'event' | 'error' | 'auth';
  channel?: string;
  payload?: unknown;
  token?: string;
}

export interface WSSubscribeMessage extends WSMessage {
  type: 'subscribe';
  channel: string;
}

export interface WSUnsubscribeMessage extends WSMessage {
  type: 'unsubscribe';
  channel: string;
}

export interface WSEventMessage extends WSMessage {
  type: 'event';
  payload: AppEvent;
}

export interface WSErrorMessage extends WSMessage {
  type: 'error';
  payload: { code: string; message: string };
}

export interface WSAuthMessage extends WSMessage {
  type: 'auth';
  token: string;
}

// Match types
export interface Match {
  id: string;
  serverId: string;
  mode: 'CTF' | 'SUMO' | 'RACE';
  status: MatchStatus;
  startedAt: number;
  endedAt?: number;
  players: MatchPlayer[];
  score?: Record<string, number>;
}

export type MatchStatus = 'lobby' | 'running' | 'ended';

export interface MatchPlayer {
  name: string;
  team?: string;
  score: number;
}

// Admin command types
export type AdminCommand =
  | { type: 'KICK'; player: string; reason?: string }
  | { type: 'BAN'; player: string; duration?: number; reason?: string }
  | { type: 'BROADCAST'; message: string }
  | { type: 'MAP'; mapName: string }
  | { type: 'RESTART_MATCH' }
  | { type: 'SHUTDOWN' }
  | { type: 'RESTART_SERVER' };

export interface AdminCommandRequest {
  serverId: string;
  command: AdminCommand;
}

export interface AdminCommandResponse {
  success: boolean;
  output?: string;
  error?: string;
}

// User and auth types
export interface User {
  id: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  clanId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type UserRole = 'admin' | 'moderator' | 'viewer';

export interface Clan {
  id: string;
  name: string;
  tag: string;
  description: string;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClanMember {
  userId: string;
  clanId: string;
  role: ClanRole;
  joinedAt: Date;
}

export type ClanRole = 'leader' | 'officer' | 'member';

export interface Post {
  id: string;
  authorId: string;
  content: string;
  imageUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Comment {
  id: string;
  postId: string;
  authorId: string;
  content: string;
  createdAt: Date;
}

export interface Like {
  userId: string;
  postId: string;
  createdAt: Date;
}

// API request/response types
export interface CreateServerRequest {
  config: ServerConfig;
}

export interface UpdateServerRequest {
  name?: string;
  gameMode?: ServerConfig['gameMode'];
  maxPlayers?: number;
  mapRotation?: string[];
  customCfg?: Record<string, string>;
  autoRestart?: boolean;
}

export interface ServerListResponse {
  servers: ServerInstance[];
  total: number;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

// Port allocation
export interface PortAllocation {
  port: number;
  instanceId: string;
  allocatedAt: Date;
}

// Log parsing
export interface ParsedLogEntry {
  type: 'player_join' | 'player_leave' | 'map_change' | 'match_start' | 'match_end' | 'chat' | 'admin' | 'unknown';
  timestamp: Date;
  playerName?: string;
  ip?: string;
  mapName?: string;
  matchId?: string;
  message?: string;
  raw: string;
}

// Cluster types
export interface NodeInfo {
  id: string;
  name: string;
  host: string;
  port: number;
  capacity: number;
  usedCapacity: number;
  status: 'online' | 'offline' | 'degraded';
  lastHeartbeat: Date;
}

export interface ClusterCommand {
  type: 'createInstance' | 'startServer' | 'stopServer' | 'deleteInstance' | 'getStatus';
  instanceId?: string;
  config?: ServerConfig;
  token: string;
}

export interface ClusterEvent {
  type: 'instanceCreated' | 'serverStarted' | 'serverStopped' | 'serverCrashed' | 'log' | 'playerJoin' | 'playerLeave' | 'resourceUpdate';
  instanceId: string;
  nodeId: string;
  data: unknown;
  timestamp: Date;
}