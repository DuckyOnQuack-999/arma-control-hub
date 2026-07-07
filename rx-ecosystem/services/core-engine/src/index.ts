import { EventEmitter } from 'events';
import {
  ServerConfig,
  ServerInstance,
  ServerState,
  ServerProcess,
  AppEvent,
  ServerEvent,
  Match,
  MatchStatus,
} from '@rx/shared-types';
import {
  createInstance,
  deleteInstance,
  generateSettings,
  getInstanceConfig,
  listInstances,
  instanceExists,
  getInstanceBasePath,
  allocatedPorts,
  createInstanceFactory,
} from '@rx/instance-factory';
import { ProcessManager, createProcessManager } from '@rx/process-manager';
import { EventBus, eventBus, createEventBus } from '@rx/event-bus';
import { MatchEngine } from '@rx/match-engine';

export interface CoreEngineOptions {
  eventBus?: EventBus;
  instancesPath?: string;
  armagetronBinary?: string;
}

export class CoreEngine extends EventEmitter {
  private servers: Map<string, ServerInstance> = new Map();
  private processManager: ProcessManager;
  private matchEngine: MatchEngine;
  private eventBus: EventBus;
  private initialized: boolean = false;

  constructor(options?: CoreEngineOptions) {
    super();
    this.eventBus = options?.eventBus || eventBus;
    this.processManager = createProcessManager({
      eventBus: this.eventBus,
      instancesPath: options?.instancesPath,
      armagetronBinary: options?.armagetronBinary,
    });
    this.matchEngine = new MatchEngine(this.eventBus);
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.processManager.on('server:start', (instanceId: string) => {
      this.handleServerStart(instanceId);
    });

    this.processManager.on('server:stop', (instanceId: string) => {
      this.handleServerStop(instanceId);
    });

    this.processManager.on('server:crash', (instanceId: string) => {
      this.handleServerCrash(instanceId);
    });

    this.processManager.on('log', (data: { serverId: string; line: string }) => {
      this.emit('log', data);
    });

    this.eventBus.on('player:join', (event: any) => {
      this.handlePlayerJoin(event.serverId, event.data.playerName);
    });

    this.eventBus.on('player:leave', (event: any) => {
      this.handlePlayerLeave(event.serverId, event.data.playerName);
    });

    this.eventBus.on('map:change', (event: any) => {
      this.handleMapChange(event.serverId, event.data.mapName);
    });

    this.eventBus.on('match:start', (event: any) => {
      this.handleMatchStart(event.serverId);
    });

    this.eventBus.on('match:end', (event: any) => {
      this.handleMatchEnd(event.serverId);
    });
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Discover existing instances on disk
    const instances = listInstances();
    for (const instanceId of instances) {
      const config = getInstanceConfig(instanceId);
      if (config) {
        const port = this.getPortForInstance(instanceId);
        const server: ServerInstance = {
          id: instanceId,
          name: config.name || `Server ${instanceId.slice(0, 8)}`,
          port,
          state: 'idle',
          players: [],
          currentMap: '',
          basePath: getInstanceBasePath(instanceId),
          gameMode: config.gameMode || 'SUMO',
          maxPlayers: config.maxPlayers || 16,
          autoRestart: config.autoRestart ?? true,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        this.servers.set(instanceId, server);
      }
    }

    this.initialized = true;
  }

  private getPortForInstance(instanceId: string): number {
    for (const [port, id] of allocatedPorts.entries()) {
      if (id === instanceId) return port;
    }
    return 4534; // default
  }

  async createServer(config: ServerConfig): Promise<ServerInstance> {
    const instanceId = createInstance(config);
    const basePath = getInstanceBasePath(instanceId);
    const port = this.getPortForInstance(instanceId);

    const server: ServerInstance = {
      id: instanceId,
      name: config.name,
      port,
      state: 'idle',
      players: [],
      currentMap: '',
      basePath,
      gameMode: config.gameMode,
      maxPlayers: config.maxPlayers,
      autoRestart: config.autoRestart ?? true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.servers.set(instanceId, server);
    this.emitServerEvent('server:create', server);

    return server;
  }

  async startServer(instanceId: string): Promise<void> {
    const server = this.servers.get(instanceId);
    if (!server) {
      throw new Error(`Server ${instanceId} not found`);
    }

    if (server.state === 'running' || server.state === 'starting') {
      throw new Error(`Server ${instanceId} is already ${server.state}`);
    }

    const config = getInstanceConfig(instanceId);
    if (!config) {
      throw new Error(`Config not found for instance ${instanceId}`);
    }

    server.state = 'starting';
    server.updatedAt = new Date();
    this.emitServerEvent('server:start', server);

    try {
      await this.processManager.start(instanceId, { ...config, port: server.port });
      server.state = 'running';
      server.updatedAt = new Date();
      this.emitServerEvent('server:start', server);
    } catch (error) {
      server.state = 'crashed';
      server.updatedAt = new Date();
      this.emitServerEvent('server:crash', server);
      throw error;
    }
  }

  async stopServer(instanceId: string): Promise<void> {
    const server = this.servers.get(instanceId);
    if (!server) {
      throw new Error(`Server ${instanceId} not found`);
    }

    if (server.state === 'idle' || server.state === 'stopping') {
      return;
    }

    server.state = 'stopping';
    server.updatedAt = new Date();

    await this.processManager.stop(instanceId);
    server.state = 'idle';
    server.updatedAt = new Date();
    this.emitServerEvent('server:stop', server);
  }

  async restartServer(instanceId: string): Promise<void> {
    const server = this.servers.get(instanceId);
    if (!server) {
      throw new Error(`Server ${instanceId} not found`);
    }

    await this.stopServer(instanceId);
    await new Promise(resolve => setTimeout(resolve, 1000));
    await this.startServer(instanceId);
  }

  async deleteServer(instanceId: string): Promise<void> {
    const server = this.servers.get(instanceId);
    if (!server) {
      throw new Error(`Server ${instanceId} not found`);
    }

    if (server.state === 'running' || server.state === 'starting') {
      await this.stopServer(instanceId);
    }

    deleteInstance(instanceId);
    this.servers.delete(instanceId);
    this.emitServerEvent('server:stop', server);
  }

  getServer(instanceId: string): ServerInstance | undefined {
    return this.servers.get(instanceId);
  }

  listServers(): ServerInstance[] {
    return Array.from(this.servers.values());
  }

  getServerProcess(instanceId: string): ServerProcess | undefined {
    return this.processManager.getStatus(instanceId);
  }

  async sendAdminCommand(instanceId: string, command: string): Promise<{ success: boolean; output?: string; error?: string }> {
    return this.processManager.sendCommand(instanceId, command);
  }

  async getServerLogs(instanceId: string, limit: number = 100, offset: number = 0): Promise<string[]> {
    const server = this.servers.get(instanceId);
    if (!server) return [];

    // Read logs from file
    const fs = await import('fs');
    const path = await import('path');
    const logsPath = path.join(server.basePath, 'logs', 'stdout.log');

    if (!fs.existsSync(logsPath)) return [];

    const content = fs.readFileSync(logsPath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());

    return lines.slice(offset, offset + limit);
  }

  private handleServerStart(instanceId: string): void {
    const server = this.servers.get(instanceId);
    if (!server) return;

    server.state = 'running';
    server.updatedAt = new Date();
  }

  private handleServerStop(instanceId: string): void {
    const server = this.servers.get(instanceId);
    if (!server) return;

    server.state = 'idle';
    server.updatedAt = new Date();
  }

  private handleServerCrash(instanceId: string): void {
    const server = this.servers.get(instanceId);
    if (!server) return;

    server.state = 'crashed';
    server.updatedAt = new Date();
    this.emitServerEvent('server:crash', server);

    if (server.autoRestart) {
      setTimeout(() => {
        this.startServer(instanceId).catch(console.error);
      }, 5000);
    }
  }

  private handlePlayerJoin(instanceId: string, playerName: string): void {
    const server = this.servers.get(instanceId);
    if (!server) return;

    const player = {
      name: playerName,
      joinedAt: new Date(),
    };

    server.players.push(player as any);
    server.updatedAt = new Date();
  }

  private handlePlayerLeave(instanceId: string, playerName: string): void {
    const server = this.servers.get(instanceId);
    if (!server) return;

    server.players = server.players.filter(p => p.name !== playerName);
    server.updatedAt = new Date();
  }

  private handleMapChange(instanceId: string, mapName: string): void {
    const server = this.servers.get(instanceId);
    if (!server) return;

    server.currentMap = mapName;
    server.updatedAt = new Date();
  }

  private handleMatchStart(instanceId: string): void {
    const server = this.servers.get(instanceId);
    if (!server) return;

    // Match engine handles this
    this.matchEngine.startMatch(instanceId, server.gameMode);
  }

  private handleMatchEnd(instanceId: string): void {
    this.matchEngine.endMatch(instanceId);
  }

  private emitServerEvent(type: 'server:create' | 'server:start' | 'server:stop' | 'server:crash', server: ServerInstance): void {
    const event: ServerEvent = {
      type,
      timestamp: new Date(),
      serverId: server.id,
      data: server,
    };
    this.eventBus.emit(event);
    this.emit(type, server);
  }

  async shutdown(): Promise<void> {
    // Stop all servers
    const stopPromises = Array.from(this.servers.entries())
      .filter(([_, server]) => server.state === 'running' || server.state === 'starting')
      .map(([id]) => this.stopServer(id).catch(console.error));

    await Promise.all(stopPromises);
    await this.processManager.shutdown();
  }
}

// Singleton instance
export const coreEngine = new CoreEngine();

// Factory function
export function createCoreEngine(options?: CoreEngineOptions): CoreEngine {
  return new CoreEngine(options);
}

// Export types
export type { ServerConfig, ServerInstance, ServerState, ServerProcess };
