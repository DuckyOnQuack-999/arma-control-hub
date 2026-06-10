/**
 * RetroCycles/Armagetron Advanced - Host Agent v2
 *
 * Enhanced agent with:
 * - PTY process management
 * - Real-time WebSocket console streaming
 * - Log parsing for player events
 * - Metrics collection (CPU/memory/players)
 * - Config parser (KEY VALUE format)
 * - UDP server query + master browser
 * - SQLite persistence for console, events, metrics
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import * as fs from 'fs';
import * as path from 'path';
import jwt from 'jsonwebtoken';

import {
  startServer,
  stopServer,
  killServer,
  restartServer,
  sendCommand,
  getProcessInfo,
  getAllProcesses,
  getConsoleHistory,
} from './processManager';

import {
  parseConfigFile,
  writeConfigAtomic,
  getConfigFilePath,
  listConfigFiles,
} from './configParser';

import {
  startMetricsCollector,
  stopMetricsCollector,
  getMetricsHistory,
} from './metricsCollector';

import {
  queryServer,
  queryMasterServers,
  fallbackScrape,
} from './serverQuery';

import {
  getConsoleLines,
  getPlayerEvents,
  getMetrics,
  getBans,
  insertBan,
  removeBan,
} from './db';

import { setupWebSocketServer } from './websocket';

// Config
const PORT = process.env.AGENT_PORT ? parseInt(process.env.AGENT_PORT) : 8080;
const JWT_SECRET = process.env.AGENT_JWT_SECRET || 'retrocycles-agent-secret-change-in-production';
const AGENT_TOKEN = process.env.AGENT_TOKEN || 'default-agent-token';

// Express setup
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Auth middleware
function authenticate(req: Request, res: Response, next: Function) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.substring(7);
  if (token !== AGENT_TOKEN) {
    try {
      jwt.verify(token, JWT_SECRET);
    } catch (e) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  }

  next();
}

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', version: '2.0.0', timestamp: Date.now() });
});

// ========== SERVER CONTROL ==========

app.post('/api/servers/:id/start', authenticate, (req: Request, res: Response) => {
  const config = req.body;
  const result = startServer(config);
  res.status(result.success ? 200 : 400).json(result);
});

app.post('/api/servers/:id/stop', authenticate, (req: Request, res: Response) => {
  const result = stopServer(req.params.id);
  res.status(result.success ? 200 : 400).json(result);
});

app.post('/api/servers/:id/kill', authenticate, (req: Request, res: Response) => {
  const result = killServer(req.params.id);
  res.status(result.success ? 200 : 400).json(result);
});

app.post('/api/servers/:id/restart', authenticate, (req: Request, res: Response) => {
  const result = restartServer(req.params.id);
  res.status(result.success ? 200 : 400).json(result);
});

app.post('/api/servers/:id/command', authenticate, (req: Request, res: Response) => {
  const { command } = req.body;
  if (!command || command.length > 500) {
    return res.status(400).json({ error: 'Invalid command' });
  }
  const result = sendCommand(req.params.id, command);
  res.status(result.success ? 200 : 400).json(result);
});

// ========== STATUS & METRICS ==========

app.get('/api/servers/:id/status', authenticate, (req: Request, res: Response) => {
  const info = getProcessInfo(req.params.id);
  if (!info) {
    return res.json({ status: 'offline', player_count: 0, cpu_percent: 0, memory_mb: 0, uptime: 0, current_map: '' });
  }
  res.json(info);
});

app.get('/api/servers/:id/metrics', authenticate, (req: Request, res: Response) => {
  const hours = parseInt(req.query.hours as string) || 24;
  const metrics = getMetrics(req.params.id, hours);
  res.json(metrics);
});

app.get('/api/servers/:id/metrics/live', authenticate, (req: Request, res: Response) => {
  const hours = parseInt(req.query.hours as string) || 1;
  const metrics = getMetricsHistory(req.params.id, hours);
  res.json(metrics);
});

// ========== CONSOLE ==========

app.get('/api/servers/:id/console', authenticate, (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 500;
  const before = req.query.before ? parseInt(req.query.before as string) : undefined;
  const lines = getConsoleLines(req.params.id, limit, before);
  res.json(lines);
});

app.get('/api/servers/:id/console/live', authenticate, (req: Request, res: Response) => {
  const history = getConsoleHistory(req.params.id);
  res.json(history);
});

// ========== CONFIG ==========

app.get('/api/servers/:id/configs', authenticate, (req: Request, res: Response) => {
  const serverId = req.params.id;
  const proc = getAllProcesses().get(serverId);
  if (!proc) {
    return res.status(404).json({ error: 'Server not running' });
  }

  const files = listConfigFiles(proc.config.dataDir);
  res.json(files);
});

app.get('/api/servers/:id/configs/:name', authenticate, (req: Request, res: Response) => {
  const serverId = req.params.id;
  const proc = getAllProcesses().get(serverId);
  if (!proc) {
    return res.status(404).json({ error: 'Server not running' });
  }

  const filePath = getConfigFilePath(proc.config.dataDir, req.params.name);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Config not found' });
  }

  const config = parseConfigFile(filePath);
  res.json(config);
});

app.post('/api/servers/:id/configs/:name', authenticate, (req: Request, res: Response) => {
  const serverId = req.params.id;
  const proc = getAllProcesses().get(serverId);
  if (!proc) {
    return res.status(404).json({ error: 'Server not running' });
  }

  const filePath = getConfigFilePath(proc.config.dataDir, req.params.name);
  writeConfigAtomic(filePath, req.body);
  res.json({ success: true });
});

// ========== PLAYERS ==========

app.get('/api/servers/:id/players', authenticate, (req: Request, res: Response) => {
  const proc = getAllProcesses().get(req.params.id);
  if (!proc) {
    return res.json([]);
  }

  const players = Array.from(proc.players.values()).map(p => ({
    name: p.name,
    score: p.score || 0,
    is_silenced: p.isSilenced,
    is_banned: p.isBanned,
    joined_at: p.joinedAt,
  }));

  res.json(players);
});

app.get('/api/servers/:id/players/events', authenticate, (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 100;
  const events = getPlayerEvents(req.params.id, limit);
  res.json(events);
});

app.post('/api/servers/:id/players/:name/kick', authenticate, (req: Request, res: Response) => {
  const { reason } = req.body;
  const result = sendCommand(req.params.id, `KICK ${req.params.name}${reason ? ` ${reason}` : ''}`);
  res.status(result.success ? 200 : 400).json(result);
});

app.post('/api/servers/:id/players/:name/ban', authenticate, (req: Request, res: Response) => {
  const { reason, duration } = req.body;
  const serverId = req.params.id;
  const playerName = req.params.name;

  const result = sendCommand(serverId, `BAN ${playerName}${reason ? ` ${reason}` : ''}`);
  if (result.success) {
    const expiresAt = duration ? Date.now() + duration * 1000 : undefined;
    insertBan(serverId, playerName, undefined, reason, 'admin', expiresAt);
  }
  res.status(result.success ? 200 : 400).json(result);
});

app.post('/api/servers/:id/players/:name/silence', authenticate, (req: Request, res: Response) => {
  const result = sendCommand(req.params.id, `SILENCE ${req.params.name}`);
  res.status(result.success ? 200 : 400).json(result);
});

// ========== BANS ==========

app.get('/api/servers/:id/bans', authenticate, (req: Request, res: Response) => {
  const bans = getBans(req.params.id);
  res.json(bans);
});

app.delete('/api/servers/:id/bans/:name', authenticate, (req: Request, res: Response) => {
  removeBan(req.params.id, req.params.name);
  res.json({ success: true });
});

// ========== LOGS ==========

app.get('/api/servers/:id/logs', authenticate, (req: Request, res: Response) => {
  const serverId = req.params.id;
  const proc = getAllProcesses().get(serverId);
  if (!proc) {
    return res.json([]);
  }

  const logDir = path.join(proc.config.dataDir, 'logs');
  if (!fs.existsSync(logDir)) {
    return res.json([]);
  }

  const files = fs.readdirSync(logDir)
    .filter(f => f.endsWith('.log'))
    .map(f => ({
      name: f,
      size: fs.statSync(path.join(logDir, f)).size,
      modified: fs.statSync(path.join(logDir, f)).mtime,
    }));

  res.json(files);
});

app.get('/api/servers/:id/logs/:filename', authenticate, (req: Request, res: Response) => {
  const serverId = req.params.id;
  const proc = getAllProcesses().get(serverId);
  if (!proc) {
    return res.status(404).json({ error: 'Server not running' });
  }

  const logPath = path.join(proc.config.dataDir, 'logs', path.basename(req.params.filename));
  if (!fs.existsSync(logPath)) {
    return res.status(404).json({ error: 'Log not found' });
  }

  const tail = parseInt(req.query.tail as string) || 100;
  const content = fs.readFileSync(logPath, 'utf-8');
  const lines = content.split('\n').slice(-tail);

  res.json({ lines, totalLines: content.split('\n').length });
});

// ========== FILES ==========

app.get('/api/servers/:id/files', authenticate, (req: Request, res: Response) => {
  const serverId = req.params.id;
  const proc = getAllProcesses().get(serverId);
  if (!proc) {
    return res.status(404).json({ error: 'Server not running' });
  }

  const dir = req.query.dir as string || '';
  const safeDir = path.normalize(dir).replace(/^(\.\.(\/|$))+/, '');
  const fullPath = path.join(proc.config.dataDir, safeDir);

  if (!fullPath.startsWith(proc.config.dataDir)) {
    return res.status(403).json({ error: 'Path traversal detected' });
  }

  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ error: 'Directory not found' });
  }

  const entries = fs.readdirSync(fullPath, { withFileTypes: true }).map(entry => ({
    name: entry.name,
    type: entry.isDirectory() ? 'directory' : 'file',
    size: entry.isFile() ? fs.statSync(path.join(fullPath, entry.name)).size : 0,
    modified: fs.statSync(path.join(fullPath, entry.name)).mtime,
  }));

  res.json(entries);
});

app.get('/api/servers/:id/files/*', authenticate, (req: Request, res: Response) => {
  const serverId = req.params.id;
  const proc = getAllProcesses().get(serverId);
  if (!proc) {
    return res.status(404).json({ error: 'Server not running' });
  }

  const filePath = path.join(proc.config.dataDir, req.params[0]);
  if (!filePath.startsWith(proc.config.dataDir)) {
    return res.status(403).json({ error: 'Path traversal detected' });
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  res.json({ content, path: req.params[0] });
});

app.post('/api/servers/:id/files/*', authenticate, (req: Request, res: Response) => {
  const serverId = req.params.id;
  const proc = getAllProcesses().get(serverId);
  if (!proc) {
    return res.status(404).json({ error: 'Server not running' });
  }

  const filePath = path.join(proc.config.dataDir, req.params[0]);
  if (!filePath.startsWith(proc.config.dataDir)) {
    return res.status(403).json({ error: 'Path traversal detected' });
  }

  fs.writeFileSync(filePath, req.body.content, 'utf-8');
  res.json({ success: true });
});

// ========== SERVER BROWSER ==========

app.get('/api/browser', authenticate, async (_req: Request, res: Response) => {
  try {
    const servers = await queryMasterServers();
    if (servers.length === 0) {
      const fallback = await fallbackScrape();
      return res.json(fallback);
    }
    res.json(servers);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.get('/api/browser/query', authenticate, async (req: Request, res: Response) => {
  const { ip, port } = req.query;
  if (!ip || !port) {
    return res.status(400).json({ error: 'IP and port required' });
  }

  try {
    const result = await queryServer(ip as string, parseInt(port as string));
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ========== STARTUP ==========

setupWebSocketServer(wss);
startMetricsCollector();

server.listen(PORT, () => {
  console.log(`[AGENT] RetroCycles Agent v2.0.0 listening on port ${PORT}`);
  console.log(`[AGENT] WebSocket available at ws://localhost:${PORT}/ws`);
  console.log(`[AGENT] Metrics collector started (5s interval)`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[AGENT] Shutting down...');
  stopMetricsCollector();

  for (const [serverId, proc] of getAllProcesses()) {
    stopServer(serverId);
  }

  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('[AGENT] Interrupted, shutting down...');
  stopMetricsCollector();

  for (const [serverId, proc] of getAllProcesses()) {
    stopServer(serverId);
  }

  server.close(() => {
    process.exit(0);
  });
});
