import * as pty from 'node-pty';
import * as path from 'path';
import { ServerProcess, ServerConfig, ConsoleLine, ProcessInfo } from './types';
import { parseConsoleLine, parsePlayerEvents, updatePlayerState } from './logParser';
import { insertConsoleLine } from './db';
import { v4 as uuidv4 } from 'uuid';
import stripAnsi from 'strip-ansi';

const processes = new Map<string, ServerProcess>();
const MAX_CONSOLE_BUFFER = 500;
const subscribers = new Map<string, Set<(line: ConsoleLine) => void>>();

export function getProcess(serverId: string): ServerProcess | undefined {
  return processes.get(serverId);
}

export function getAllProcesses(): Map<string, ServerProcess> {
  return processes;
}

export function subscribeToConsole(serverId: string, callback: (line: ConsoleLine) => void): () => void {
  if (!subscribers.has(serverId)) {
    subscribers.set(serverId, new Set());
  }
  subscribers.get(serverId)!.add(callback);
  return () => {
    subscribers.get(serverId)?.delete(callback);
  };
}

function broadcastConsoleLine(serverId: string, line: ConsoleLine) {
  const subs = subscribers.get(serverId);
  if (subs) {
    for (const cb of subs) {
      try { cb(line); } catch (e) { /* ignore */ }
    }
  }
}

function addConsoleLine(serverId: string, line: ConsoleLine) {
  const proc = processes.get(serverId);
  if (!proc) return;

  proc.consoleBuffer.push(line);
  if (proc.consoleBuffer.length > MAX_CONSOLE_BUFFER) {
    proc.consoleBuffer.shift();
  }

  insertConsoleLine(serverId, line.type, line.text, line.timestamp);
  broadcastConsoleLine(serverId, line);
}

export function startServer(config: ServerConfig): { success: boolean; error?: string } {
  if (processes.has(String(config.id))) {
    return { success: false, error: 'Server already running' };
  }

  const serverId = String(config.id);
  const workDir = path.resolve(config.dataDir);
  const binPath = path.resolve(config.executablePath);

  if (!require('fs').existsSync(binPath)) {
    return { success: false, error: `Binary not found: ${binPath}` };
  }

  try {
    const ptyProcess = pty.spawn(binPath, ['--datadir', workDir], {
      name: 'xterm-color',
      cols: 120,
      rows: 30,
      cwd: workDir,
      env: process.env as { [key: string]: string },
    });

    const proc: ServerProcess = {
      id: serverId,
      ptyProcess,
      config,
      status: 'starting',
      startTime: Date.now(),
      consoleBuffer: [],
      pid: ptyProcess.pid,
      players: new Map(),
      metrics: [],
      lastMetricTime: 0,
    };

    processes.set(serverId, proc);

    ptyProcess.onData((data: string) => {
      const clean = stripAnsi(data);
      const lines = clean.split('\n').filter(l => l.trim());

      for (const line of lines) {
        const consoleLine = parseConsoleLine(line, serverId);
        addConsoleLine(serverId, consoleLine);

        const events = parsePlayerEvents(line, serverId);
        updatePlayerState(proc.players, events);
      }
    });

    ptyProcess.onExit(({ exitCode, signal }) => {
      proc.status = exitCode === 0 ? 'offline' : 'crashed';

      const exitLine: ConsoleLine = {
        id: `${serverId}-${Date.now()}-exit`,
        type: 'system',
        text: `Process exited with code ${exitCode}${signal ? ` (signal: ${signal})` : ''}`,
        timestamp: Date.now(),
        serverId,
      };
      addConsoleLine(serverId, exitLine);

      if (config.autoRestart && proc.status === 'crashed') {
        setTimeout(() => {
          if (processes.has(serverId)) {
            startServer(config);
          }
        }, 5000);
      }

      processes.delete(serverId);
    });

    // Give it a moment to start
    setTimeout(() => {
      if (processes.has(serverId)) {
        proc.status = 'online';
      }
    }, 2000);

    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export function stopServer(serverId: string): { success: boolean; error?: string } {
  const proc = processes.get(serverId);
  if (!proc) {
    return { success: false, error: 'Server not running' };
  }

  proc.status = 'stopping';
  proc.ptyProcess.write('QUIT\n');

  // Fallback: SIGTERM after 5s
  setTimeout(() => {
    const stillRunning = processes.get(serverId);
    if (stillRunning) {
      try {
        process.kill(stillRunning.pid!, 'SIGTERM');
      } catch (e) { /* ignore */ }
    }
  }, 5000);

  // Fallback: SIGKILL after 10s
  setTimeout(() => {
    const stillRunning = processes.get(serverId);
    if (stillRunning) {
      try {
        process.kill(stillRunning.pid!, 'SIGKILL');
      } catch (e) { /* ignore */ }
      processes.delete(serverId);
    }
  }, 10000);

  return { success: true };
}

export function killServer(serverId: string): { success: boolean; error?: string } {
  const proc = processes.get(serverId);
  if (!proc) {
    return { success: false, error: 'Server not running' };
  }

  try {
    process.kill(proc.pid!, 'SIGKILL');
    processes.delete(serverId);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export function restartServer(serverId: string): { success: boolean; error?: string } {
  const proc = processes.get(serverId);
  if (!proc) {
    return { success: false, error: 'Server not running' };
  }

  const config = proc.config;
  stopServer(serverId);

  setTimeout(() => {
    startServer(config);
  }, 3000);

  return { success: true };
}

export function sendCommand(serverId: string, command: string): { success: boolean; error?: string } {
  const proc = processes.get(serverId);
  if (!proc) {
    return { success: false, error: 'Server not running' };
  }

  proc.ptyProcess.write(command + '\n');

  const cmdLine: ConsoleLine = {
    id: `${serverId}-${Date.now()}-cmd`,
    type: 'command',
    text: `> ${command}`,
    timestamp: Date.now(),
    serverId,
  };
  addConsoleLine(serverId, cmdLine);

  return { success: true };
}

export function getProcessInfo(serverId: string): ProcessInfo | null {
  const proc = processes.get(serverId);
  if (!proc) {
    return null;
  }

  return {
    status: proc.status,
    player_count: proc.players.size,
    cpu_percent: 0,
    memory_mb: 0,
    uptime: Date.now() - proc.startTime,
    current_map: proc.config.currentMap || 'Unknown',
    pid: proc.pid,
  };
}

export function getConsoleHistory(serverId: string): ConsoleLine[] {
  const proc = processes.get(serverId);
  if (!proc) {
    return [];
  }
  return [...proc.consoleBuffer];
}
