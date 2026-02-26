import { mockServers, mockPlayers, mockBans, mockEvents, mockMetrics, mockConsoleLines, mockBrowserServers, mockServerConfigs, mockUsers } from './mockData';
import type { Server, Player, Ban, ServerEvent, MetricPoint, ConsoleLine, BrowserServer, User } from './types';

const delay = (ms = 300) => new Promise(r => setTimeout(r, ms));

// Mutable copies
let servers = [...mockServers];
let bans = [...mockBans];
let nextServerId = 4;
let nextBanId = 4;

// Auth
export const api = {
  async login(username: string, _password: string): Promise<{ user: User; accessToken: string; refreshToken: string }> {
    await delay(500);
    const user = mockUsers.find(u => u.username === username);
    if (!user) throw new Error('Invalid credentials');
    return { user, accessToken: 'mock-access-token', refreshToken: 'mock-refresh-token' };
  },

  async register(username: string, _password: string): Promise<{ user: User; accessToken: string; refreshToken: string }> {
    await delay(500);
    const user: User = { id: mockUsers.length + 1, username, role: 'admin', createdAt: Math.floor(Date.now() / 1000) };
    mockUsers.push(user);
    return { user, accessToken: 'mock-access-token', refreshToken: 'mock-refresh-token' };
  },

  // Servers
  async getServers(): Promise<Server[]> {
    await delay();
    return [...servers];
  },

  async getServer(id: number): Promise<Server | undefined> {
    await delay();
    return servers.find(s => s.id === id);
  },

  async createServer(data: Partial<Server>): Promise<Server> {
    await delay();
    const server: Server = {
      id: nextServerId++,
      name: data.name || 'New Server',
      executablePath: data.executablePath || '/usr/bin/armagetronad-dedicated',
      dataDir: data.dataDir || '/usr/share/armagetronad',
      configDir: data.configDir || '/etc/armagetronad/new',
      port: data.port || 4537,
      autoRestart: data.autoRestart ?? true,
      maxPlayers: data.maxPlayers || 16,
      createdAt: Math.floor(Date.now() / 1000),
      status: 'offline',
      currentMap: '',
      playerCount: 0,
      cpuPercent: 0,
      memoryMb: 0,
      uptime: 0,
    };
    servers.push(server);
    return server;
  },

  async deleteServer(id: number): Promise<void> {
    await delay();
    servers = servers.filter(s => s.id !== id);
  },

  // Control
  async startServer(id: number): Promise<void> {
    await delay(1000);
    const s = servers.find(s => s.id === id);
    if (s) { s.status = 'online'; s.cpuPercent = 15 + Math.random() * 10; s.memoryMb = 80 + Math.random() * 40; }
  },

  async stopServer(id: number): Promise<void> {
    await delay(1000);
    const s = servers.find(s => s.id === id);
    if (s) { s.status = 'offline'; s.cpuPercent = 0; s.memoryMb = 0; s.playerCount = 0; s.uptime = 0; }
  },

  async restartServer(id: number): Promise<void> {
    await delay(2000);
    const s = servers.find(s => s.id === id);
    if (s) { s.cpuPercent = 15 + Math.random() * 10; s.memoryMb = 80 + Math.random() * 40; }
  },

  async sendCommand(id: number, command: string): Promise<string> {
    await delay(100);
    return `> ${command}\nCommand executed on server ${id}`;
  },

  // Players
  async getPlayers(serverId: number): Promise<Player[]> {
    await delay();
    return mockPlayers[serverId] || [];
  },

  async kickPlayer(serverId: number, playerName: string, reason?: string): Promise<void> {
    await delay();
    const players = mockPlayers[serverId];
    if (players) {
      const idx = players.findIndex(p => p.name === playerName);
      if (idx >= 0) players.splice(idx, 1);
    }
  },

  async banPlayer(serverId: number, playerName: string, reason: string, durationMinutes?: number): Promise<void> {
    await delay();
    const now = Math.floor(Date.now() / 1000);
    bans.push({
      id: nextBanId++, serverId, playerName, ipAddress: '0.0.0.xxx', reason, bannedBy: 'admin',
      expiresAt: durationMinutes ? now + durationMinutes * 60 : null, createdAt: now,
    });
    await api.kickPlayer(serverId, playerName);
  },

  async getBans(serverId: number): Promise<Ban[]> {
    await delay();
    return bans.filter(b => b.serverId === serverId);
  },

  async unban(banId: number): Promise<void> {
    await delay();
    bans = bans.filter(b => b.id !== banId);
  },

  // Events/Logs
  async getEvents(serverId: number, filters?: { type?: string; search?: string }): Promise<ServerEvent[]> {
    await delay();
    let events = mockEvents[serverId] || [];
    if (filters?.type) events = events.filter(e => e.eventType === filters.type);
    if (filters?.search) {
      const s = filters.search.toLowerCase();
      events = events.filter(e => JSON.stringify(e.payload).toLowerCase().includes(s));
    }
    return events;
  },

  // Metrics
  async getMetrics(serverId: number, hours = 24): Promise<MetricPoint[]> {
    await delay();
    const all = mockMetrics[serverId] || [];
    const cutoff = Math.floor(Date.now() / 1000) - hours * 3600;
    return all.filter(m => m.time >= cutoff);
  },

  // Console
  getConsoleHistory(): ConsoleLine[] {
    return [...mockConsoleLines];
  },

  // Config
  async getConfig(serverId: number): Promise<Record<string, string>> {
    await delay();
    return { ...(mockServerConfigs[serverId] || {}) };
  },

  async saveConfig(serverId: number, config: Record<string, string>): Promise<void> {
    await delay();
    mockServerConfigs[serverId] = { ...config };
  },

  async getRawConfig(_serverId: number, filename: string): Promise<string> {
    await delay();
    const config = mockServerConfigs[_serverId] || {};
    return Object.entries(config).map(([k, v]) => `${k} ${v}`).join('\n');
  },

  async saveRawConfig(serverId: number, _filename: string, content: string): Promise<void> {
    await delay();
    const config: Record<string, string> = {};
    content.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const spaceIdx = trimmed.indexOf(' ');
      if (spaceIdx > 0) config[trimmed.substring(0, spaceIdx)] = trimmed.substring(spaceIdx + 1);
    });
    mockServerConfigs[serverId] = config;
  },

  // Server Browser
  async getBrowserServers(): Promise<BrowserServer[]> {
    await delay(800);
    return [...mockBrowserServers];
  },

  // Users
  async getUsers(): Promise<User[]> {
    await delay();
    return [...mockUsers];
  },
};
