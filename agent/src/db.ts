import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

const DB_DIR = process.env.AGENT_DB_DIR || path.join(process.cwd(), 'data');
const DB_PATH = path.join(DB_DIR, 'agent.db');

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS console_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id TEXT NOT NULL,
    type TEXT NOT NULL,
    text TEXT NOT NULL,
    timestamp INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_console_server ON console_lines(server_id);
  CREATE INDEX IF NOT EXISTS idx_console_time ON console_lines(timestamp);

  CREATE TABLE IF NOT EXISTS player_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id TEXT NOT NULL,
    type TEXT NOT NULL,
    player_name TEXT,
    target_name TEXT,
    message TEXT,
    details TEXT,
    timestamp INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_events_server ON player_events(server_id);
  CREATE INDEX IF NOT EXISTS idx_events_time ON player_events(timestamp);

  CREATE TABLE IF NOT EXISTS metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    cpu REAL NOT NULL,
    memory REAL NOT NULL,
    player_count INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_metrics_server ON metrics(server_id);
  CREATE INDEX IF NOT EXISTS idx_metrics_time ON metrics(timestamp);

  CREATE TABLE IF NOT EXISTS bans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id TEXT NOT NULL,
    player_name TEXT NOT NULL,
    ip TEXT,
    reason TEXT,
    banned_by TEXT,
    timestamp INTEGER NOT NULL,
    expires_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_bans_server ON bans(server_id);
  CREATE INDEX IF NOT EXISTS idx_bans_player ON bans(player_name);
`);

export function insertConsoleLine(serverId: string, type: string, text: string, timestamp: number) {
  const stmt = db.prepare('INSERT INTO console_lines (server_id, type, text, timestamp) VALUES (?, ?, ?, ?)');
  stmt.run(serverId, type, text, timestamp);
}

export function getConsoleLines(serverId: string, limit: number = 500, before?: number) {
  if (before) {
    return db.prepare('SELECT * FROM console_lines WHERE server_id = ? AND timestamp < ? ORDER BY timestamp DESC LIMIT ?')
      .all(serverId, before, limit);
  }
  return db.prepare('SELECT * FROM console_lines WHERE server_id = ? ORDER BY timestamp DESC LIMIT ?')
    .all(serverId, limit);
}

export function insertPlayerEvent(serverId: string, type: string, playerName?: string, targetName?: string, message?: string, details?: string, timestamp?: number) {
  const stmt = db.prepare('INSERT INTO player_events (server_id, type, player_name, target_name, message, details, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)');
  stmt.run(serverId, type, playerName || null, targetName || null, message || null, details || null, timestamp || Date.now());
}

export function getPlayerEvents(serverId: string, limit: number = 100) {
  return db.prepare('SELECT * FROM player_events WHERE server_id = ? ORDER BY timestamp DESC LIMIT ?').all(serverId, limit);
}

export function insertMetric(serverId: string, timestamp: number, cpu: number, memory: number, playerCount: number) {
  const stmt = db.prepare('INSERT INTO metrics (server_id, timestamp, cpu, memory, player_count) VALUES (?, ?, ?, ?, ?)');
  stmt.run(serverId, timestamp, cpu, memory, playerCount);
}

export function getMetrics(serverId: string, hours: number = 24) {
  const cutoff = Date.now() - hours * 3600 * 1000;
  return db.prepare('SELECT * FROM metrics WHERE server_id = ? AND timestamp > ? ORDER BY timestamp ASC').all(serverId, cutoff);
}

export function pruneMetrics(serverId: string, days: number = 7) {
  const cutoff = Date.now() - days * 86400 * 1000;
  db.prepare('DELETE FROM metrics WHERE server_id = ? AND timestamp < ?').run(serverId, cutoff);
}

export function insertBan(serverId: string, playerName: string, ip?: string, reason?: string, bannedBy?: string, expiresAt?: number) {
  const stmt = db.prepare('INSERT INTO bans (server_id, player_name, ip, reason, banned_by, timestamp, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  stmt.run(serverId, playerName, ip || null, reason || null, bannedBy || null, Date.now(), expiresAt || null);
}

export function getBans(serverId: string) {
  return db.prepare('SELECT * FROM bans WHERE server_id = ? AND (expires_at IS NULL OR expires_at > ?) ORDER BY timestamp DESC').all(serverId, Date.now());
}

export function removeBan(serverId: string, playerName: string) {
  db.prepare('DELETE FROM bans WHERE server_id = ? AND player_name = ?').run(serverId, playerName);
}

export function getDb() {
  return db;
}
