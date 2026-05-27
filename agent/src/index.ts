/**
 * RetroCycles/Armagetron Advanced - Host Agent
 *
 * This agent runs on the same machine as the game servers and handles:
 * - Process management via PTY (start/stop/restart/kill)
 * - Real-time console output streaming
 * - File system operations
 * - Status and metrics collection
 *
 * The panel communicates with this agent via HTTP.
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import * as pty from 'node-pty';
import * as fs from 'fs';
import * as path from 'path';
import pidusage from 'pidusage';
import { v4 as uuidv4 } from 'uuid';

const app = express();
const PORT = process.env.AGENT_PORT ? parseInt(process.env.AGENT_PORT) : 8080;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Types
interface ServerProcess {
  id: string;
  ptyProcess: pty.IPty;
  config: ServerConfig;
  status: 'online' | 'offline' | 'starting' | 'stopping' | 'crashed';
  startTime: number;
  consoleBuffer: ConsoleLine[];
  pid?: number;
}

interface ServerConfig {
  id: number;
  name: string;
  executablePath: string;
  dataDir: string;
  configDir: string;
  port: number;
  maxPlayers: number;
  autoRestart: boolean;
}

interface ConsoleLine {
  type: 'system' | 'info' | 'warning' | 'error' | 'chat' | 'player';
  text: string;
  timestamp: number;
}

interface ProcessInfo {
  status: string;
  player_count: number;
  cpu_percent: number;
  memory_mb: number;
  uptime: number;
  current_map: string;
}

// State
const processes = new Map<string, ServerProcess>();
const MAX_CONSOLE_BUFFER = 500;

// Helper: Parse console output
function parseConsoleLine(text: string): ConsoleLine {
  const lower = text.toLowerCase();

  if (lower.includes('error') || lower.includes('failed') || lower.includes('fatal')) {
    return { type: 'error', text, timestamp: Date.now() };
  }
  if (lower.includes('warning') || lower.includes('warn')) {
    return { type: 'warning', text, timestamp: Date.now() };
  }
  if (lower.includes('player') && (lower.includes('joined') || lower.includes('left'))) {
    return { type: 'player', text, timestamp: Date.now() };
  }
  if (lower.includes('chat') || text.includes(': ')) {
    return { type: 'chat', text, timestamp: Date.now() };
  }

  return { type: 'info', text, timestamp: Date.now() };
}

// Helper: Strip ANSI codes
function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

// Helper: Write config files
function writeConfigFiles(configDir: string, configs: Record<string, string>): void {
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  // Group by filename
  const files: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(configs)) {
    // Default to settings_custom.cfg
    const filename = 'settings_custom.cfg';
    if (!files[filename]) files[filename] = [];
    files[filename].push(`${key} ${value}`);
  }

  // Write each file
  for (const [filename, lines] of Object.entries(files)) {
    const filepath = path.join(configDir, filename);
    fs.writeFileSync(filepath, lines.join('\n') + '\n', 'utf-8');
  }
}

// Start a server process
function startServer(config: ServerConfig, configs?: Record<string, string>): ServerProcess {
  const id = uuidv4();

  // Write config files if provided
  if (configs) {
    writeConfigFiles(config.configDir, configs);
  }

  // Build command arguments
  const args = [
    '--datadir', config.dataDir,
    '--configdir', config.configDir,
    '--port', String(config.port),
  ];

  console.log(`Starting server: ${config.executablePath} ${args.join(' ')}`);

  // Spawn PTY process
  const ptyProcess = pty.spawn(config.executablePath, args, {
    name: 'xterm-256color',
    cols: 120,
    rows: 40,
    cwd: config.dataDir,
    env: process.env as Record<string, string>,
  });

  const serverProcess: ServerProcess = {
    id,
    ptyProcess,
    config,
    status: 'starting',
    startTime: Date.now(),
    consoleBuffer: [],
  };

  // Handle PTY output
  ptyProcess.onData((data: string) => {
    const cleanData = stripAnsi(data);
    const lines = cleanData.split('\n').filter(l => l.trim());

    for (const line of lines) {
      const consoleLine = parseConsoleLine(line.trim());
      serverProcess.consoleBuffer.push(consoleLine);

      // Trim buffer
      if (serverProcess.consoleBuffer.length > MAX_CONSOLE_BUFFER) {
        serverProcess.consoleBuffer.shift();
      }
    }

    // Detect successful start
    if (serverProcess.status === 'starting') {
      if (cleanData.toLowerCase().includes('listening') ||
          cleanData.toLowerCase().includes('bound to port') ||
          cleanData.toLowerCase().includes('server started')) {
        serverProcess.status = 'online';
      }
    }

    // Log to console
    process.stdout.write(`[${config.name}] ${cleanData}`);
  });

  // Handle process exit
  ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
    console.log(`Server ${config.name} exited with code ${exitCode}`);
    serverProcess.status = exitCode === 0 ? 'offline' : 'crashed';
    serverProcess.pid = undefined;

    // Auto-restart if enabled
    if (config.autoRestart && serverProcess.status === 'crashed') {
      console.log(`Auto-restarting ${config.name} in 5 seconds...`);
      setTimeout(() => {
        startServer(config);
      }, 5000);
    }
  });

  // Get PID
  serverProcess.pid = ptyProcess.pid;

  // Store process
  processes.set(id, serverProcess);

  // Set status to online after brief delay if no startup message detected
  setTimeout(() => {
    if (serverProcess.status === 'starting') {
      serverProcess.status = 'online';
    }
  }, 3000);

  return serverProcess;
}

// Stop a server process
async function stopServer(serverProcess: ServerProcess): Promise<void> {
  if (serverProcess.status === 'offline') return;

  serverProcess.status = 'stopping';

  // Send QUIT command
  serverProcess.ptyProcess.write('QUIT\n');

  // Wait for graceful shutdown
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      // Force kill after 10 seconds
      if (serverProcess.pid) {
        try {
          process.kill(serverProcess.pid, 'SIGTERM');
        } catch {}
      }
      resolve();
    }, 10000);

    serverProcess.ptyProcess.onExit(() => {
      clearTimeout(timeout);
      resolve();
    });
  });

  serverProcess.status = 'offline';
}

// API Routes

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', version: '1.0.0', uptime: process.uptime() });
});

// Server control - start
app.post('/control', async (req: Request, res: Response) => {
  const { serverId, action, command, config, configs } = req.body;

  try {
    switch (action) {
      case 'start': {
        // Find existing or create new
        let existingProcess: ServerProcess | undefined;
        for (const proc of processes.values()) {
          if (proc.config.id === serverId) {
            existingProcess = proc;
            break;
          }
        }

        if (existingProcess && existingProcess.status !== 'offline' && existingProcess.status !== 'crashed') {
          return res.status(400).json({ error: `Server is already ${existingProcess.status}` });
        }

        if (existingProcess) {
          // Restart existing
          processes.delete(existingProcess.id);
        }

        const serverConfig: ServerConfig = config || {
          id: serverId,
          name: `Server ${serverId}`,
          executablePath: '/usr/bin/armagetronad-dedicated',
          dataDir: '/usr/share/armagetronad',
          configDir: `/etc/armagetronad/${serverId}`,
          port: 4534,
          maxPlayers: 16,
          autoRestart: true,
        };

        const proc = startServer(serverConfig, configs);
        return res.json({
          success: true,
          status: proc.status,
          message: `Server started with PID ${proc.pid}`,
          processId: proc.id,
        });
      }

      case 'stop': {
        let serverProcess: ServerProcess | undefined;
        for (const proc of processes.values()) {
          if (proc.config.id === serverId) {
            serverProcess = proc;
            break;
          }
        }

        if (!serverProcess) {
          return res.status(404).json({ error: 'Server process not found' });
        }

        await stopServer(serverProcess);
        return res.json({
          success: true,
          status: serverProcess.status,
          message: 'Server stopped',
        });
      }

      case 'restart': {
        let serverProcess: ServerProcess | undefined;
        for (const proc of processes.values()) {
          if (proc.config.id === serverId) {
            serverProcess = proc;
            break;
          }
        }

        if (!serverProcess) {
          return res.status(404).json({ error: 'Server process not found' });
        }

        const oldConfig = serverProcess.config;
        await stopServer(serverProcess);

        // Wait a moment
        await new Promise(r => setTimeout(r, 1000));

        const newProc = startServer(oldConfig);
        return res.json({
          success: true,
          status: newProc.status,
          message: 'Server restarted',
          processId: newProc.id,
        });
      }

      case 'kill': {
        let serverProcess: ServerProcess | undefined;
        for (const proc of processes.values()) {
          if (proc.config.id === serverId) {
            serverProcess = proc;
            break;
          }
        }

        if (!serverProcess) {
          return res.status(404).json({ error: 'Server process not found' });
        }

        if (serverProcess.pid) {
          try {
            process.kill(serverProcess.pid, 'SIGKILL');
          } catch {}
        }

        serverProcess.status = 'offline';
        return res.json({
          success: true,
          status: 'offline',
          message: 'Server killed',
        });
      }

      case 'command': {
        if (!command) {
          return res.status(400).json({ error: 'command required for command action' });
        }

        let serverProcess: ServerProcess | undefined;
        for (const proc of processes.values()) {
          if (proc.config.id === serverId) {
            serverProcess = proc;
            break;
          }
        }

        if (!serverProcess || serverProcess.status !== 'online') {
          return res.status(400).json({ error: 'Server not online' });
        }

        serverProcess.ptyProcess.write(command + '\n');
        return res.json({
          success: true,
          message: `Command sent: ${command}`,
        });
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (error: any) {
    console.error('Control error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Server status
app.get('/status', async (req: Request, res: Response) => {
  const serverId = parseInt(req.query.serverId as string);

  try {
    let serverProcess: ServerProcess | undefined;
    for (const proc of processes.values()) {
      if (proc.config.id === serverId) {
        serverProcess = proc;
        break;
      }
    }

    if (!serverProcess) {
      return res.json({
        status: 'offline',
        player_count: 0,
        cpu_percent: 0,
        memory_mb: 0,
        uptime: 0,
        current_map: '',
      });
    }

    let cpuPercent = 0;
    let memoryMb = 0;

    if (serverProcess.pid && serverProcess.status === 'online') {
      try {
        const stats = await pidusage(serverProcess.pid);
        cpuPercent = stats.cpu;
        memoryMb = stats.memory / (1024 * 1024);
      } catch {
        // Process might have just exited
      }
    }

    const uptime = serverProcess.status === 'online'
      ? Math.floor((Date.now() - serverProcess.startTime) / 1000)
      : 0;

    // Count players from console buffer (simplified)
    const playerCount = 0; // Would need proper parsing

    return res.json({
      status: serverProcess.status,
      player_count: playerCount,
      cpu_percent: Math.round(cpuPercent * 10) / 10,
      memory_mb: Math.round(memoryMb * 10) / 10,
      uptime,
      current_map: '',
      agent_version: '1.0.0',
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Console output
app.get('/console', (req: Request, res: Response) => {
  const serverId = parseInt(req.query.serverId as string);
  const since = parseInt(req.query.since as string) || 0;

  let serverProcess: ServerProcess | undefined;
  for (const proc of processes.values()) {
    if (proc.config.id === serverId) {
      serverProcess = proc;
      break;
    }
  }

  if (!serverProcess) {
    return res.json({ lines: [] });
  }

  const lines = serverProcess.consoleBuffer
    .filter(l => l.timestamp > since)
    .map(l => ({
      type: l.type,
      text: l.text,
      timestamp: l.timestamp,
    }));

  return res.json({ lines });
});

// File operations
app.get('/files', (req: Request, res: Response) => {
  const dirPath = req.query.path as string || '/';

  try {
    if (!fs.existsSync(dirPath)) {
      return res.json({ files: [] });
    }

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const files = entries.map(entry => ({
      name: entry.name,
      type: entry.isDirectory() ? 'directory' : 'file',
      size: entry.isFile() ? fs.statSync(path.join(dirPath, entry.name)).size : 0,
      modified: fs.statSync(path.join(dirPath, entry.name)).mtime.toISOString(),
    }));

    // Sort: directories first, then by name
    files.sort((a, b) => {
      if (a.type === 'directory' && b.type !== 'directory') return -1;
      if (a.type !== 'directory' && b.type === 'directory') return 1;
      return a.name.localeCompare(b.name);
    });

    return res.json({ files });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/files/read', (req: Request, res: Response) => {
  const filePath = req.query.path as string;

  try {
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    return res.json({ content });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/files/write', (req: Request, res: Response) => {
  const { path: filePath, content } = req.body;

  try {
    // Ensure parent directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, content, 'utf-8');
    return res.json({ success: true, message: 'File saved' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/files/rename', (req: Request, res: Response) => {
  const { oldPath, newPath } = req.body;

  try {
    fs.renameSync(oldPath, newPath);
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/files/delete', (req: Request, res: Response) => {
  const { path: filePath } = req.body;

  try {
    if (fs.statSync(filePath).isDirectory()) {
      fs.rmSync(filePath, { recursive: true });
    } else {
      fs.unlinkSync(filePath);
    }
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/files/mkdir', (req: Request, res: Response) => {
  const { path: dirPath } = req.body;

  try {
    fs.mkdirSync(dirPath, { recursive: true });
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`RetroCycles Agent running on port ${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
  console.log(`Control: POST http://localhost:${PORT}/control`);
  console.log(`Status: GET http://localhost:${PORT}/status?serverId=X`);
});
