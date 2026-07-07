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
import { createInstance, deleteInstance, generateSettings, getInstanceConfig, listInstances, instanceExists, getInstanceBasePath } from '@rx/instance-factory';
import { ProcessManager } from '@rx/process-manager';
import { eventBus, EventBus } from '@rx/event-bus';
import { MatchEngine } from '@rx/match-engine';

export class CoreEngine extends EventEmitter {
  private servers: Map<string, ServerInstance> = new Map();
  private processManager: ProcessManager;
  private matchEngine: MatchEngine;
  private eventBus: EventBus;

  constructor(eventBusInstance?: EventBus) {
    super();
    this.eventBus = eventBusInstance || eventBus;
    this.processManager = new ProcessManager({ eventBus: this.eventBus });
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

    this.eventBus.on('player:join', (event) => {
      this.handlePlayerJoin(event.serverId, event.data.playerName);
    });

    this.eventBus.on('player:leave', (event) => {
      this.handlePlayerLeave(event.serverId, event.data.playerName);
    });

    this.eventBus.on('map:change', (event) => {
      this.handleMapChange(event.serverId, event.data.mapName);
    });

    this.eventBus.on('match:start', (event) => {
      this.handleMatchStart(event.serverId);
    });

    this.eventBus.on('match:end', (event) => {
      this.handleMatchEnd(event.serverId);
    });
  }

  async createServer(config: ServerConfig): Promise<string> {
    const instanceId = createInstance(config);
    const instanceConfig = getInstanceConfig(instanceId);
    const basePath = getInstanceBasePath(instanceId);

    if (!instanceConfig) {
      throw new Error(`Failed to create instance ${instanceId}`);
    }

    const port = Array.from((await import('@rx/instance-factory')).allocatedPorts.entries())
      .find(([_, id]) => id === instanceId)?.[0] || 0;

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

    return instanceId;
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
      await this.processManager.start(instanceId, config);
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
  }

  async restartServer(instanceId: string): Promise<void> {
    const server = this.servers.get(instanceId);
    if (!server) {
      throw new Error(`Server ${instanceId} not found`);
    }

    await this.stopServer(instanceId);
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

  sendAdminCommand(instanceId: string, command: string): Promise<{ success: boolean; output?: string; error?: string }> {
    return this.processManager.sendCommand(instanceId, command);
  }

  private handleServerStart(instanceId: string): void {
    const server = this.servers.get(instanceId);
    if (!server) return;

    server.state = 'running';
    server.updatedAt = new Date();
    this.emitServerEvent('server:start', server);
  }

  private handleServerStop(instanceId: string): void {
    const server = this.servers.get(instanceId);
    if (!server) return;

    server.state = 'idle';
    server.updatedAt = new Date();
    this.emitServerEvent('server:stop', server);
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

    server.players.push(player);
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
  }
}

export const coreEngine = new CoreEngine();