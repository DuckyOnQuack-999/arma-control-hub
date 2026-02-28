import type { Server, Player, Ban, ServerEvent, MetricPoint, ConsoleLine, BrowserServer, ConfigKeyMeta, User } from './types';

const now = Math.floor(Date.now() / 1000);

export const mockUsers: User[] = [
  { id: 1, username: 'admin', role: 'admin', createdAt: now - 86400 * 30 },
  { id: 2, username: 'operator1', role: 'operator', createdAt: now - 86400 * 14 },
  { id: 3, username: 'viewer1', role: 'viewer', createdAt: now - 86400 * 3 },
];

export const mockServers: Server[] = [
  {
    id: 1, name: 'RetroCycles Fortress', executablePath: '/usr/bin/armagetronad-dedicated',
    dataDir: '/usr/share/armagetronad', configDir: '/etc/armagetronad/fortress',
    port: 4534, autoRestart: true, maxPlayers: 16, createdAt: now - 86400 * 30,
    status: 'online', currentMap: 'fortress/classic-1.0.1', playerCount: 8,
    cpuPercent: 23.5, memoryMb: 128.4, uptime: 86400 * 3 + 7200,
  },
  {
    id: 2, name: 'Sumo Arena', executablePath: '/usr/bin/armagetronad-dedicated',
    dataDir: '/usr/share/armagetronad', configDir: '/etc/armagetronad/sumo',
    port: 4535, autoRestart: true, maxPlayers: 12, createdAt: now - 86400 * 20,
    status: 'online', currentMap: 'sumo/default-1.0', playerCount: 5,
    cpuPercent: 12.1, memoryMb: 96.2, uptime: 3600 * 18,
  },
  {
    id: 3, name: 'CTF Training', executablePath: '/usr/bin/armagetronad-dedicated',
    dataDir: '/usr/share/armagetronad', configDir: '/etc/armagetronad/ctf',
    port: 4536, autoRestart: false, maxPlayers: 20, createdAt: now - 86400 * 5,
    status: 'offline', currentMap: 'ctf/two-bases', playerCount: 0,
    cpuPercent: 0, memoryMb: 0, uptime: 0,
  },
];

export const mockPlayers: Record<number, Player[]> = {
  1: [
    { name: 'CyberViper', ip: '192.168.1.xxx', score: 42, ping: 28, joinTime: now - 3600 },
    { name: 'NeonRider', ip: '10.0.0.xxx', score: 38, ping: 45, joinTime: now - 2400 },
    { name: 'GridMaster', ip: '172.16.0.xxx', score: 31, ping: 62, joinTime: now - 1800 },
    { name: 'TronLegacy', ip: '192.168.2.xxx', score: 27, ping: 15, joinTime: now - 1200 },
    { name: 'LightCycle_X', ip: '10.10.0.xxx', score: 22, ping: 88, joinTime: now - 900 },
    { name: 'WallGrinder', ip: '172.20.0.xxx', score: 19, ping: 34, joinTime: now - 600 },
    { name: 'DerezPlayer', ip: '192.168.5.xxx', score: 15, ping: 51, joinTime: now - 300 },
    { name: 'ByteRunner', ip: '10.5.0.xxx', score: 8, ping: 72, joinTime: now - 120 },
  ],
  2: [
    { name: 'SumoChamp', ip: '192.168.1.xxx', score: 55, ping: 22, joinTime: now - 5400 },
    { name: 'RingMaster', ip: '10.0.0.xxx', score: 41, ping: 38, joinTime: now - 4200 },
    { name: 'PushKing', ip: '172.16.0.xxx', score: 33, ping: 55, joinTime: now - 3000 },
    { name: 'ZoneFighter', ip: '192.168.3.xxx', score: 20, ping: 41, joinTime: now - 1500 },
    { name: 'EdgeWalker', ip: '10.20.0.xxx', score: 12, ping: 67, joinTime: now - 600 },
  ],
  3: [],
};

export const mockBans: Ban[] = [
  { id: 1, serverId: 1, playerName: 'SpamBot99', ipAddress: '45.33.12.xxx', reason: 'Spamming chat', bannedBy: 'admin', expiresAt: now + 86400, createdAt: now - 3600 },
  { id: 2, serverId: 1, playerName: 'WallHacker', ipAddress: '88.12.45.xxx', reason: 'Exploiting bugs', bannedBy: 'operator1', expiresAt: null, createdAt: now - 86400 },
  { id: 3, serverId: 2, playerName: 'Troll_X', ipAddress: '91.55.23.xxx', reason: 'Harassment', bannedBy: 'admin', expiresAt: now + 86400 * 7, createdAt: now - 7200 },
];

function generateEvents(serverId: number): ServerEvent[] {
  const events: ServerEvent[] = [];
  const types: Array<{ type: ServerEvent['eventType']; payload: Record<string, string> }> = [
    { type: 'player_join', payload: { player: 'CyberViper', ip: '192.168.1.100' } },
    { type: 'chat', payload: { player: 'NeonRider', message: 'gg everyone!' } },
    { type: 'kill', payload: { killer: 'GridMaster', victim: 'TronLegacy' } },
    { type: 'player_leave', payload: { player: 'DerezPlayer' } },
    { type: 'round_end', payload: { winner: 'Gold Team', score: '100' } },
    { type: 'player_join', payload: { player: 'ByteRunner', ip: '10.5.0.50' } },
    { type: 'chat', payload: { player: 'LightCycle_X', message: 'nice wall!' } },
    { type: 'kill', payload: { killer: 'WallGrinder', victim: 'ByteRunner' } },
    { type: 'kick', payload: { player: 'SpamBot99', reason: 'Spamming' } },
    { type: 'start', payload: {} },
  ];
  for (let i = 0; i < 50; i++) {
    const t = types[i % types.length];
    events.push({
      id: serverId * 1000 + i,
      serverId,
      eventType: t.type,
      payload: t.payload,
      occurredAt: now - (50 - i) * 120,
    });
  }
  return events;
}

export const mockEvents: Record<number, ServerEvent[]> = {
  1: generateEvents(1),
  2: generateEvents(2),
  3: [],
};

function generateMetrics(serverId: number, hours: number): MetricPoint[] {
  const points: MetricPoint[] = [];
  const interval = 60; // 1 minute
  const count = (hours * 3600) / interval;
  for (let i = 0; i < count; i++) {
    const t = now - (count - i) * interval;
    const base = serverId === 1 ? 20 : 10;
    points.push({
      time: t,
      cpu: Math.max(0, Math.min(100, base + Math.sin(i * 0.05) * 10 + Math.random() * 5)),
      memory: Math.max(50, 80 + serverId * 20 + Math.sin(i * 0.03) * 20 + Math.random() * 10),
      players: Math.max(0, Math.floor(4 + Math.sin(i * 0.02) * 4 + Math.random() * 2)),
    });
  }
  return points;
}

export const mockMetrics: Record<number, MetricPoint[]> = {
  1: generateMetrics(1, 24),
  2: generateMetrics(2, 24),
  3: [],
};

export const mockConsoleLines: ConsoleLine[] = [
  { id: 1, timestamp: now - 300, type: 'system', text: '[SERVER] Armagetron Advanced Dedicated v0.2.9.1.0 — starting up...' },
  { id: 2, timestamp: now - 295, type: 'system', text: '[SERVER] Loading configuration from settings_custom.cfg' },
  { id: 3, timestamp: now - 290, type: 'info', text: '[CONFIG] CYCLE_SPEED set to 30' },
  { id: 4, timestamp: now - 285, type: 'info', text: '[CONFIG] CYCLE_RUBBER set to 5' },
  { id: 5, timestamp: now - 280, type: 'system', text: '[SERVER] Listening on 0.0.0.0:4534' },
  { id: 6, timestamp: now - 275, type: 'system', text: '[SERVER] Talking to master server at master1.armagetronad.net:4533' },
  { id: 7, timestamp: now - 240, type: 'join', text: '[JOIN] CyberViper entered the grid from 192.168.1.100' },
  { id: 8, timestamp: now - 220, type: 'join', text: '[JOIN] NeonRider entered the grid from 10.0.0.55' },
  { id: 9, timestamp: now - 200, type: 'chat', text: '[CHAT] CyberViper: hey all, ready to ride?' },
  { id: 10, timestamp: now - 180, type: 'join', text: '[JOIN] GridMaster entered the grid from 172.16.0.22' },
  { id: 11, timestamp: now - 160, type: 'system', text: '[ROUND] New round starting — 3 players alive' },
  { id: 12, timestamp: now - 140, type: 'kill', text: '[KILL] CyberViper core-dumped NeonRider' },
  { id: 13, timestamp: now - 130, type: 'chat', text: '[CHAT] NeonRider: nice wall!' },
  { id: 14, timestamp: now - 120, type: 'kill', text: '[KILL] GridMaster core-dumped CyberViper' },
  { id: 15, timestamp: now - 110, type: 'system', text: '[ROUND] GridMaster wins the round! Score: 2' },
  { id: 16, timestamp: now - 90, type: 'join', text: '[JOIN] TronLegacy entered the grid from 192.168.2.30' },
  { id: 17, timestamp: now - 80, type: 'warning', text: '[WARN] Player TronLegacy has high ping: 180ms' },
  { id: 18, timestamp: now - 70, type: 'chat', text: '[CHAT] GridMaster: gg so far' },
  { id: 19, timestamp: now - 60, type: 'system', text: '[ROUND] New round starting — 4 players alive' },
  { id: 20, timestamp: now - 40, type: 'kill', text: '[KILL] TronLegacy core-dumped GridMaster' },
  { id: 21, timestamp: now - 35, type: 'kill', text: '[KILL] CyberViper core-dumped TronLegacy' },
  { id: 22, timestamp: now - 30, type: 'kill', text: '[KILL] NeonRider core-dumped CyberViper' },
  { id: 23, timestamp: now - 25, type: 'system', text: '[ROUND] NeonRider wins the round! Score: 3' },
  { id: 24, timestamp: now - 20, type: 'leave', text: '[LEAVE] TronLegacy left the grid' },
  { id: 25, timestamp: now - 10, type: 'error', text: '[ERROR] Failed to sync with master server — retrying in 30s' },
  { id: 26, timestamp: now - 5, type: 'join', text: '[JOIN] LightCycle_X entered the grid from 10.10.0.77' },
];

export const mockBrowserServers: BrowserServer[] = [
  { id: 1, name: '~"Wild West"~ Fortress', host: '45.33.100.12', port: 4534, map: 'fortress/classic-1.0.1', players: 12, maxPlayers: 16, ping: 32, gameType: 'Fortress' },
  { id: 2, name: 'Crazy Tronners Sumo', host: '88.99.12.55', port: 4534, map: 'sumo/default', players: 8, maxPlayers: 12, ping: 45, gameType: 'Sumo' },
  { id: 3, name: 'Durka\'s CTF Shooting', host: '91.121.88.100', port: 4534, map: 'ctf/shooting-1.0', players: 14, maxPlayers: 20, ping: 68, gameType: 'CTF Shooting' },
  { id: 4, name: 'Eclipse\'d HR Racing', host: '176.9.44.22', port: 4534, map: 'race/highspeed-2.0', players: 6, maxPlayers: 10, ping: 22, gameType: 'HR Racing' },
  { id: 5, name: '~|DS|~ Dog Fight', host: '162.55.33.88', port: 4534, map: 'df/open-arena', players: 4, maxPlayers: 8, ping: 55, gameType: 'Dog Fight' },
  { id: 6, name: 'Swampland Fortress', host: '51.77.44.123', port: 4534, map: 'fortress/swamp-1.1', players: 10, maxPlayers: 16, ping: 78, gameType: 'Fortress' },
  { id: 7, name: 'The Asteroid Server', host: '185.22.155.80', port: 4534, map: 'fortress/asteroid-3.0', players: 7, maxPlayers: 12, ping: 91, gameType: 'Fortress' },
  { id: 8, name: 'NIXDA.net Sumo', host: '213.239.192.50', port: 4534, map: 'sumo/nixda-1.0', players: 11, maxPlayers: 16, ping: 35, gameType: 'Sumo' },
  { id: 9, name: 'Ladle Practice Server', host: '78.46.88.200', port: 4534, map: 'fortress/classic-1.0.1', players: 3, maxPlayers: 16, ping: 42, gameType: 'Fortress' },
  { id: 10, name: '~nw~ Nano War Zone', host: '148.251.155.33', port: 4534, map: 'nano/warzone-2.1', players: 9, maxPlayers: 14, ping: 28, gameType: 'Nano' },
  { id: 11, name: 'FlexZone Open Sumo', host: '94.130.22.77', port: 4534, map: 'sumo/flex-1.0', players: 0, maxPlayers: 12, ping: 110, gameType: 'Sumo' },
  { id: 12, name: 'Tilt Classic Fortress', host: '195.201.44.90', port: 4534, map: 'fortress/tilt-1.2', players: 15, maxPlayers: 16, ping: 18, gameType: 'Fortress' },
  { id: 13, name: 'Speed Racer v3', host: '5.9.100.200', port: 4534, map: 'race/speed-3.0', players: 2, maxPlayers: 8, ping: 155, gameType: 'Racing' },
  { id: 14, name: 'Capture The Flag EU', host: '46.4.55.120', port: 4534, map: 'ctf/europe-1.1', players: 16, maxPlayers: 24, ping: 38, gameType: 'CTF' },
  { id: 15, name: 'Rubber Training Ground', host: '78.47.22.180', port: 4534, map: 'training/rubber-1.0', players: 1, maxPlayers: 8, ping: 62, gameType: 'Training' },
  { id: 16, name: '~*SP*~ Sty Patch Test', host: '88.198.33.44', port: 4534, map: 'sty/patch-test', players: 5, maxPlayers: 10, ping: 48, gameType: 'Sty' },
  { id: 17, name: 'Ww Clan Server', host: '176.9.88.150', port: 4534, map: 'fortress/ww-custom-2.0', players: 6, maxPlayers: 16, ping: 85, gameType: 'Fortress' },
  { id: 18, name: 'NoobZone (Beginners)', host: '134.119.22.60', port: 4534, map: 'classic/noob-1.0', players: 4, maxPlayers: 12, ping: 72, gameType: 'Classic' },
];

export const configKeys: ConfigKeyMeta[] = [
  { key: 'SERVER_NAME', defaultValue: 'Unnamed Server', description: 'Public name of the server shown in the server browser', type: 'string', section: 'network' },
  { key: 'SERVER_IP', defaultValue: '', description: 'IP address to bind to (empty = all interfaces)', type: 'string', section: 'network' },
  { key: 'SERVER_PORT', defaultValue: '4534', description: 'UDP port the server listens on', type: 'int', min: 1024, max: 65535, section: 'network' },
  { key: 'MAX_CLIENTS', defaultValue: '16', description: 'Maximum number of connected clients', type: 'int', min: 2, max: 32, section: 'network' },
  { key: 'TALK_TO_MASTER', defaultValue: '1', description: 'Register with master server for public listing', type: 'bool', section: 'network' },
  { key: 'MASTER_SERVER_NAME', defaultValue: 'master1.armagetronad.net', description: 'Hostname of the master server', type: 'string', section: 'network' },
  { key: 'MASTER_SERVER_PORT', defaultValue: '4533', description: 'Port of the master server', type: 'int', min: 1, max: 65535, section: 'network' },
  { key: 'CYCLE_SPEED', defaultValue: '30', description: 'Base speed of cycles', type: 'float', min: 1, max: 200, section: 'physics' },
  { key: 'CYCLE_SPEED_BOOST', defaultValue: '0', description: 'Speed boost gained from grinding walls', type: 'float', min: 0, max: 100, section: 'physics' },
  { key: 'CYCLE_SPEED_BOOST_DURATION', defaultValue: '2', description: 'Duration of speed boost in seconds', type: 'float', min: 0, max: 30, section: 'physics' },
  { key: 'CYCLE_ACCEL', defaultValue: '10', description: 'Acceleration rate of cycles', type: 'float', min: 0, max: 200, section: 'physics' },
  { key: 'CYCLE_BRAKE', defaultValue: '30', description: 'Braking deceleration rate', type: 'float', min: 0, max: 200, section: 'physics' },
  { key: 'CYCLE_WALL_LENGTH', defaultValue: '-1', description: 'Maximum wall length (-1 = infinite)', type: 'float', min: -1, max: 10000, section: 'gameplay' },
  { key: 'WALLS_LENGTH', defaultValue: '-1', description: 'Alternative wall length setting (-1 = infinite)', type: 'float', min: -1, max: 10000, section: 'gameplay' },
  { key: 'WALLS_STAY_UP_DELAY', defaultValue: '2', description: 'Seconds walls remain after player death', type: 'float', min: 0, max: 60, section: 'gameplay' },
  { key: 'ARENA_SIZE', defaultValue: '500', description: 'Size of the arena in game units', type: 'float', min: 50, max: 5000, section: 'gameplay' },
  { key: 'SCORE_HOLE', defaultValue: '1', description: 'Points for passing through a wall hole', type: 'int', min: 0, max: 100, section: 'scoring' },
  { key: 'SCORE_KILL', defaultValue: '3', description: 'Points awarded for killing an opponent', type: 'int', min: 0, max: 100, section: 'scoring' },
  { key: 'SCORE_WIN', defaultValue: '5', description: 'Points for winning a round', type: 'int', min: 0, max: 100, section: 'scoring' },
  { key: 'SCORE_SURVIVE', defaultValue: '1', description: 'Points per round survived', type: 'int', min: 0, max: 100, section: 'scoring' },
  { key: 'ROUND_WINNER_TEAM_OVERRIDE', defaultValue: '0', description: 'Override round winner with team winner', type: 'bool', section: 'scoring' },
  { key: 'WIN_ZONE_RANDOMNESS', defaultValue: '0.8', description: 'Randomness factor for win zone placement', type: 'float', min: 0, max: 1, section: 'gameplay' },
  { key: 'WIN_ZONE_DEATHS', defaultValue: '0', description: 'Number of deaths before win zone appears', type: 'int', min: 0, max: 32, section: 'gameplay' },
  { key: 'WIN_ZONE_EXPAND', defaultValue: '1', description: 'Rate at which the win zone expands', type: 'float', min: 0, max: 10, section: 'gameplay' },
  { key: 'MIN_PLAYERS', defaultValue: '0', description: 'Minimum players to start a round', type: 'int', min: 0, max: 32, section: 'gameplay' },
  { key: 'TEAM_MAX_PLAYERS', defaultValue: '8', description: 'Maximum players per team', type: 'int', min: 1, max: 16, section: 'gameplay' },
  { key: 'TEAM_MIN_PLAYERS', defaultValue: '1', description: 'Minimum players per team', type: 'int', min: 1, max: 16, section: 'gameplay' },
  { key: 'TEAM_MAX_IMBALANCE', defaultValue: '1', description: 'Max player count difference between teams', type: 'int', min: 0, max: 8, section: 'gameplay' },
  { key: 'SPAM_PROTECTION', defaultValue: '4', description: 'Spam protection threshold for commands', type: 'float', min: 0, max: 100, section: 'admin' },
  { key: 'SPAM_PROTECTION_CHAT', defaultValue: '2', description: 'Spam protection threshold for chat', type: 'float', min: 0, max: 100, section: 'admin' },
  { key: 'SPAM_PENALTY', defaultValue: '3', description: 'Penalty duration for spam in seconds', type: 'float', min: 0, max: 300, section: 'admin' },
  { key: 'PASSWORD_HASH', defaultValue: '', description: 'Hashed admin password for remote console', type: 'string', section: 'admin' },
  { key: 'ADMIN_PASS', defaultValue: '', description: 'Admin password (plaintext — use PASSWORD_HASH instead)', type: 'string', section: 'admin' },
  { key: 'ADMIN_IP_LIST', defaultValue: '', description: 'Comma-separated list of admin IP addresses', type: 'string', section: 'admin' },
  { key: 'NETWORK_AUTOBAN_FACTOR', defaultValue: '10', description: 'Factor for automatic network abuse banning', type: 'float', min: 0, max: 100, section: 'admin' },
  { key: 'NETWORK_AUTOBAN_OFFSET', defaultValue: '5', description: 'Offset for autoban threshold calculation', type: 'float', min: 0, max: 100, section: 'admin' },
  { key: 'DEDICATED_FPS', defaultValue: '40', description: 'Server simulation frames per second', type: 'int', min: 10, max: 120, section: 'network' },
  { key: 'CYCLE_RUBBER', defaultValue: '5', description: 'Distance a cycle can get close to walls before dying', type: 'float', min: 0, max: 100, section: 'physics' },
  { key: 'CYCLE_RUBBER_MINDISTANCE', defaultValue: '0.001', description: 'Minimum distance from wall before rubber kicks in', type: 'float', min: 0, max: 1, section: 'physics' },
  { key: 'CYCLE_RUBBER_MINADJUST', defaultValue: '0.05', description: 'Minimum rubber adjustment per frame', type: 'float', min: 0, max: 1, section: 'physics' },
  { key: 'ROUND_TIME', defaultValue: '180', description: 'Maximum round duration in seconds', type: 'int', min: 30, max: 3600, section: 'gameplay' },
  { key: 'LIMIT_TIME', defaultValue: '30', description: 'Match time limit in minutes', type: 'int', min: 1, max: 1440, section: 'gameplay' },
  { key: 'LIMIT_ROUNDS', defaultValue: '10', description: 'Number of rounds per match', type: 'int', min: 1, max: 1000, section: 'gameplay' },
  { key: 'LIMIT_SCORE', defaultValue: '100', description: 'Score limit to win the match', type: 'int', min: 1, max: 10000, section: 'scoring' },
  { key: 'ALLOW_TEAM_NAME_COLOR', defaultValue: '1', description: 'Allow colored team names', type: 'bool', section: 'misc' },
  { key: 'ALLOW_TEAM_NAME_PLAYER', defaultValue: '1', description: 'Allow player-defined team names', type: 'bool', section: 'misc' },
  { key: 'NUM_AIS', defaultValue: '0', description: 'Number of AI players to spawn', type: 'int', min: 0, max: 16, section: 'misc' },
];

export const mockServerConfigs: Record<number, Record<string, string>> = {
  1: {
    SERVER_NAME: 'RetroCycles Fortress',
    SERVER_PORT: '4534',
    MAX_CLIENTS: '16',
    TALK_TO_MASTER: '1',
    CYCLE_SPEED: '30',
    CYCLE_RUBBER: '5',
    ARENA_SIZE: '500',
    SCORE_KILL: '3',
    SCORE_WIN: '5',
    WALLS_STAY_UP_DELAY: '2',
    DEDICATED_FPS: '40',
    ROUND_TIME: '180',
    LIMIT_ROUNDS: '10',
    LIMIT_SCORE: '100',
    TEAM_MAX_PLAYERS: '8',
    NUM_AIS: '0',
  },
  2: {
    SERVER_NAME: 'Sumo Arena',
    SERVER_PORT: '4535',
    MAX_CLIENTS: '12',
    TALK_TO_MASTER: '1',
    CYCLE_SPEED: '25',
    CYCLE_RUBBER: '8',
    ARENA_SIZE: '200',
    SCORE_KILL: '1',
    SCORE_WIN: '10',
    WALLS_STAY_UP_DELAY: '0',
    DEDICATED_FPS: '40',
    ROUND_TIME: '120',
    LIMIT_ROUNDS: '15',
    LIMIT_SCORE: '50',
    TEAM_MAX_PLAYERS: '6',
    NUM_AIS: '0',
  },
  3: {
    SERVER_NAME: 'CTF Training',
    SERVER_PORT: '4536',
    MAX_CLIENTS: '20',
    TALK_TO_MASTER: '0',
    CYCLE_SPEED: '35',
    CYCLE_RUBBER: '3',
    ARENA_SIZE: '800',
    SCORE_KILL: '2',
    SCORE_WIN: '3',
    DEDICATED_FPS: '40',
    NUM_AIS: '4',
  },
};

const now2 = Math.floor(Date.now() / 1000);
export const mockMapFiles: Record<number, import('./types').MapFile[]> = {
  1: [
    { filename: 'fortress/classic-1.0.1.aamap.xml', sizeBytes: 12480, modifiedAt: now2 - 86400 * 10 },
    { filename: 'fortress/classic-1.0.1.cfg', sizeBytes: 2340, modifiedAt: now2 - 86400 * 10 },
    { filename: 'resources/cockpit.xml', sizeBytes: 8912, modifiedAt: now2 - 86400 * 5 },
  ],
  2: [
    { filename: 'sumo/default-1.0.aamap.xml', sizeBytes: 9800, modifiedAt: now2 - 86400 * 15 },
    { filename: 'sumo/default-1.0.cfg', sizeBytes: 1560, modifiedAt: now2 - 86400 * 15 },
  ],
  3: [
    { filename: 'ctf/two-bases.aamap.xml', sizeBytes: 18200, modifiedAt: now2 - 86400 * 3 },
    { filename: 'ctf/two-bases.cfg', sizeBytes: 3100, modifiedAt: now2 - 86400 * 3 },
    { filename: 'resources/team-colors.cfg', sizeBytes: 450, modifiedAt: now2 - 86400 * 1 },
  ],
};
