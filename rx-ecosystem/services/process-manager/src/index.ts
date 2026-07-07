import { spawn, ChildProcess, SpawnOptions } from 'child_process';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import {
  ServerInstance,
  ServerProcess,
  ServerState,
  ServerConfig,
  AppEvent,
  LogEvent,
  PlayerEvent,
  MapChangeEvent,
  MatchEvent,
  ResourceEvent,
  AdminCommandEvent,
  ParsedLogEntry,
} from '@rx/shared-types';
import { EventBus, eventBus } from '@rx/event-bus';

const INSTANCES_BASE_PATH = process.env.INSTANCES_PATH || path.resolve(process.cwd(), 'instances');

interface ProcessManagerOptions {
  eventBus?: EventBus;
  armagetronBinary?: string;
  instancesPath?: string;
}

export class ProcessManager extends EventEmitter {
  private processes: Map<string, ChildProcess> = new Map();
  private serverStates: Map<string, ServerProcess> = new Map();
  private logStreams: Map<string, { stdout: fs.WriteStream; stderr: fs.WriteStream }> = new Map();
  private eventBus: EventBus;
  private armagetronBinary: string;
  private instancesPath: string;
  private resourceMonitorInterval: NodeJS.Timeout | null = null;

  constructor(options: ProcessManagerOptions = {}) {
    super();
    this.eventBus = options.eventBus || eventBus;
    this.armagetronBinary = options.armagetronBinary || 'armagetronad-dedicated';
    this.instancesPath = options.instancesPath || INSTANCES_BASE_PATH;
    this.startResourceMonitoring();
  }

  private startResourceMonitoring(): void {
    this.resourceMonitorInterval = setInterval(() => {
      this.updateResourceUsage();
    }, 5000);
  }

  private async updateResourceUsage(): Promise<void> {
    for (const [instanceId, process] of this.processes.entries()) {
      if (process.pid) {
        try {
          const usage = await this.getProcessResourceUsage(process.pid);
          const serverProcess = this.serverStates.get(instanceId);
          if (serverProcess) {
            serverProcess.resourceUsage = usage;
            this.emitResourceUpdate(instanceId, usage);
          }
        } catch (error) {
          // Process might have exited
        }
      }
    }
  }

  private async getProcessResourceUsage(pid: number): Promise<{ cpu: number; memory: number }> {
    return new Promise((resolve, reject) => {
      const ps = spawn('ps', ['-p', pid.toString(), '-o', '%cpu,rss'], { stdio: 'pipe' });
      let output = '';
      ps.stdout.on('data', (data) => { output += data.toString(); });
      ps.on('close', (code) => {
        if (code === 0) {
          const lines = output.trim().split('\n');
          if (lines.length > 1) {
            const parts = lines[1].trim().split(/\s+/);
            const cpu = parseFloat(parts[0]) || 0;
            const memory = parseInt(parts[1], 10) * 1024 || 0;
            resolve({ cpu, memory });
          } else {
            resolve({ cpu: 0, memory: 0 });
          }
        } else {
          reject(new Error(`ps command failed with code ${code}`));
        }
      });
      ps.on('error', reject);
    });
  }

  private emitResourceUpdate(instanceId: string, usage: { cpu: number; memory: number }): void {
    const event: ResourceEvent = {
      type: 'resource:update',
      timestamp: new Date(),
      serverId: instanceId,
      data: usage,
    };
    this.eventBus.emit(event);
  }

  async start(instanceId: string, config: ServerConfig & { port?: number }): Promise<void> {
    if (this.processes.has(instanceId)) {
      throw new Error(`Server ${instanceId} is already running`);
    }

    const instancePath = path.join(this.instancesPath, instanceId);
    const configPath = path.join(instancePath, 'config', 'settings.cfg');
    const logsPath = path.join(instancePath, 'logs');

    if (!fs.existsSync(configPath)) {
      // Try alternate config location
      const altConfigPath = path.join(instancePath, 'config', 'settings_custom.cfg');
      if (!fs.existsSync(altConfigPath)) {
        throw new Error(`Config not found for instance ${instanceId}`);
      }
    }

    this.updateState(instanceId, 'starting');

    const stdoutPath = path.join(logsPath, 'stdout.log');
    const stderrPath = path.join(logsPath, 'stderr.log');

    fs.mkdirSync(logsPath, { recursive: true });
    const stdoutStream = fs.createWriteStream(stdoutPath, { flags: 'a' });
    const stderrStream = fs.createWriteStream(stderrPath, { flags: 'a' });

    this.logStreams.set(instanceId, { stdout: stdoutStream, stderr: stderrStream });

    const spawnOptions: SpawnOptions = {
      cwd: instancePath,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, HOME: instancePath },
    };

    const args = ['--vardir', instancePath];

    if (fs.existsSync(configPath)) {
      args.push('--config', configPath);
    }

    const childProcess = spawn(this.armagetronBinary, args, spawnOptions);

    this.processes.set(instanceId, childProcess);
    this.serverStates.set(instanceId, {
      id: instanceId,
      pid: childProcess.pid!,
      state: 'starting',
      startTime: new Date(),
    });

    this.setupProcessHandlers(instanceId, childProcess, config);

    this.emitStartEvent(instanceId);
  }

  private setupProcessHandlers(instanceId: string, childProcess: ChildProcess, config: ServerConfig): void {
    childProcess.stdout?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n').filter(line => line.trim());
      for (const line of lines) {
        this.handleLogLine(instanceId, line);
      }
    });

    childProcess.stderr?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n').filter(line => line.trim());
      for (const line of lines) {
        this.handleLogLine(instanceId, line, 'error');
      }
    });

    childProcess.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
      this.handleProcessExit(instanceId, code, signal, config);
    });

    childProcess.on('error', (error: Error) => {
      this.handleProcessError(instanceId, error);
    });
  }

  private handleLogLine(instanceId: string, line: string, level: 'info' | 'warn' | 'error' = 'info'): void {
    // Write to log file
    const streams = this.logStreams.get(instanceId);
    if (streams) {
      streams.stdout.write(`${line}\n`);
    }

    const logEvent: LogEvent = {
      type: 'log',
      timestamp: new Date(),
      serverId: instanceId,
      data: { line, level },
    };
    this.eventBus.emit(logEvent);

    const parsed = this.parseLogLine(instanceId, line);
    if (parsed) {
      this.handleParsedLogEntry(parsed);
    }
  }

  private parseLogLine(instanceId: string, line: string): ParsedLogEntry | null {
    const timestamp = new Date();

    const playerJoinMatch = line.match(/Player\s+\*([^*]+)\*\s+entered the game\./i);
    if (playerJoinMatch) {
      return {
        type: 'player_join',
        timestamp,
        serverId: instanceId,
        playerName: playerJoinMatch[1],
        raw: line,
      };
    }

    const playerLeaveMatch = line.match(/Player\s+\*([^*]+)\*\s+left the game\./i);
    if (playerLeaveMatch) {
      return {
        type: 'player_leave',
        timestamp,
        serverId: instanceId,
        playerName: playerLeaveMatch[1],
        raw: line,
      };
    }

    const mapChangeMatch = line.match(/Map changed to\s+\*([^*]+)\*/i);
    if (mapChangeMatch) {
      return {
        type: 'map_change',
        timestamp,
        serverId: instanceId,
        mapName: mapChangeMatch[1],
        raw: line,
      };
    }

    const matchStartMatch = line.match(/Match started.*/i);
    if (matchStartMatch) {
      return {
        type: 'match_start',
        timestamp,
        serverId: instanceId,
        raw: line,
      };
    }

    const matchEndMatch = line.match(/Match ended.*/i);
    if (matchEndMatch) {
      return {
        type: 'match_end',
        timestamp,
        serverId: instanceId,
        raw: line,
      };
    }

    return {
      type: 'unknown',
      timestamp,
      serverId: instanceId,
      raw: line,
    };
  }

  private handleParsedLogEntry(entry: ParsedLogEntry): void {
    switch (entry.type) {
      case 'player_join': {
        const event: PlayerEvent = {
          type: 'player:join',
          timestamp: entry.timestamp,
          serverId: entry.serverId!,
          data: { playerName: entry.playerName!, ip: entry.ip },
        };
        this.eventBus.emit(event);
        break;
      }
      case 'player_leave': {
        const event: PlayerEvent = {
          type: 'player:leave',
          timestamp: entry.timestamp,
          serverId: entry.serverId!,
          data: { playerName: entry.playerName!, ip: entry.ip },
        };
        this.eventBus.emit(event);
        break;
      }
      case 'map_change': {
        const event: MapChangeEvent = {
          type: 'map:change',
          timestamp: entry.timestamp,
          serverId: entry.serverId!,
          data: { mapName: entry.mapName! },
        };
        this.eventBus.emit(event);
        break;
      }
      case 'match_start': {
        const event: MatchEvent = {
          type: 'match:start',
          timestamp: entry.timestamp,
          serverId: entry.serverId!,
          data: { matchId: crypto.randomUUID(), mode: 'UNKNOWN' },
        };
        this.eventBus.emit(event);
        break;
      }
      case 'match_end': {
        const event: MatchEvent = {
          type: 'match:end',
          timestamp: entry.timestamp,
          serverId: entry.serverId!,
          data: { matchId: crypto.randomUUID(), mode: 'UNKNOWN' },
        };
        this.eventBus.emit(event);
        break;
      }
    }
  }

  private handleProcessExit(instanceId: string, code: number | null, signal: NodeJS.Signals | null, config: ServerConfig): void {
    this.cleanupProcess(instanceId);

    const wasRunning = this.serverStates.get(instanceId)?.state === 'running';

    if (code !== 0 || signal) {
      this.updateState(instanceId, 'crashed');
      this.emitCrashEvent(instanceId, code, signal);
    } else {
      this.updateState(instanceId, 'idle');
      this.emitStopEvent(instanceId);
    }

    if (wasRunning && config.autoRestart && code !== 0) {
      setTimeout(() => {
        this.start(instanceId, config).catch(err => {
          console.error(`Failed to auto-restart ${instanceId}:`, err);
        });
      }, 5000);
    }
  }

  private handleProcessError(instanceId: string, error: Error): void {
    console.error(`Process error for ${instanceId}:`, error);
    this.updateState(instanceId, 'crashed');
    this.cleanupProcess(instanceId);
  }

  private cleanupProcess(instanceId: string): void {
    const streams = this.logStreams.get(instanceId);
    if (streams) {
      streams.stdout.end();
      streams.stderr.end();
      this.logStreams.delete(instanceId);
    }
    this.processes.delete(instanceId);
  }

  async stop(instanceId: string, signal: 'SIGTERM' | 'SIGKILL' = 'SIGTERM'): Promise<void> {
    const childProcess = this.processes.get(instanceId);
    if (!childProcess) {
      throw new Error(`Server ${instanceId} is not running`);
    }

    this.updateState(instanceId, 'stopping');

    // Try graceful shutdown first by sending QUIT command
    try {
      childProcess.stdin?.write('QUIT\n');
    } catch {
      // stdin might be closed
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (!childProcess.killed) {
          childProcess.kill('SIGKILL');
        }
      }, 10000);

      childProcess.once('close', () => {
        clearTimeout(timeout);
        this.cleanupProcess(instanceId);
        this.updateState(instanceId, 'idle');
        this.emitStopEvent(instanceId);
        resolve();
      });

      // Give the server 5 seconds to gracefully shutdown before SIGTERM
      setTimeout(() => {
        if (!childProcess.killed) {
          childProcess.kill(signal);
        }
      }, 5000);
    });
  }

  async restart(instanceId: string, config: ServerConfig): Promise<void> {
    await this.stop(instanceId);
    await new Promise(resolve => setTimeout(resolve, 1000));
    await this.start(instanceId, config);
  }

  sendCommand(instanceId: string, command: string): Promise<{ success: boolean; output?: string; error?: string }> {
    const childProcess = this.processes.get(instanceId);
    if (!childProcess || !childProcess.stdin) {
      return Promise.resolve({ success: false, error: 'Server not running' });
    }

    try {
      childProcess.stdin.write(`${command}\n`);
      return Promise.resolve({ success: true, output: `Command sent: ${command}` });
    } catch (error) {
      return Promise.resolve({ success: false, error: String(error) });
    }
  }

  getStatus(instanceId: string): ServerProcess | undefined {
    return this.serverStates.get(instanceId);
  }

  listAll(): ServerProcess[] {
    return Array.from(this.serverStates.values());
  }

  isRunning(instanceId: string): boolean {
    const state = this.serverStates.get(instanceId);
    return state?.state === 'running';
  }

  private updateState(instanceId: string, state: ServerState): void {
    const serverProcess = this.serverStates.get(instanceId);
    if (serverProcess) {
      serverProcess.state = state;
      this.serverStates.set(instanceId, serverProcess);
    }
  }

  private emitStartEvent(instanceId: string): void {
    const serverProcess = this.serverStates.get(instanceId);
    if (serverProcess) {
      const event: AppEvent = {
        type: 'server:start',
        timestamp: new Date(),
        serverId: instanceId,
        data: serverProcess as any,
      };
      this.eventBus.emit(event);
    }
  }

  private emitStopEvent(instanceId: string): void {
    const event: AppEvent = {
      type: 'server:stop',
      timestamp: new Date(),
      serverId: instanceId,
      data: { instanceId },
    };
    this.eventBus.emit(event);
  }

  private emitCrashEvent(instanceId: string, code: number | null, signal: NodeJS.Signals | null): void {
    const event: AppEvent = {
      type: 'server:crash',
      timestamp: new Date(),
      serverId: instanceId,
      data: { instanceId, exitCode: code, signal },
    };
    this.eventBus.emit(event);
  }

  onLog(instanceId: string, callback: (line: string) => void): void {
    this.on(`log:${instanceId}`, callback);
  }

  offLog(instanceId: string, callback: (line: string) => void): void {
    this.off(`log:${instanceId}`, callback);
  }

  async shutdown(): Promise<void> {
    if (this.resourceMonitorInterval) {
      clearInterval(this.resourceMonitorInterval);
      this.resourceMonitorInterval = null;
    }

    const stopPromises = Array.from(this.processes.keys()).map(instanceId =>
      this.stop(instanceId, 'SIGTERM').catch(err => console.error(`Error stopping ${instanceId}:`, err))
    );

    await Promise.all(stopPromises);
  }
}

// Singleton instance
export const processManager = new ProcessManager();

// Factory function
export function createProcessManager(options?: ProcessManagerOptions): ProcessManager {
  return new ProcessManager(options);
}
