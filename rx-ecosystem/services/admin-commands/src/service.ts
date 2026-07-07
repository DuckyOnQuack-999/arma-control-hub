import { EventEmitter } from 'events';
import { AdminCommandSchema, CommandResult, CommandContext, ProcessManagerInterface, EventBusInterface, getCommandHandler, listCommands } from '../index.js';
import type { AdminCommand, ServerInstance } from '@rx/shared-types';
import './commands/index.js';

export class AdminCommandService extends EventEmitter {
  private processManager: ProcessManagerInterface;
  private eventBus: EventBusInterface;
  private commandQueue: Map<string, AdminCommand> = new Map();
  private executingCommands: Set<string> = new Set();

  constructor(processManager: ProcessManagerInterface, eventBus: EventBusInterface) {
    super();
    this.processManager = processManager;
    this.eventBus = eventBus;
  }

  async executeCommand(input: AdminCommand): Promise<CommandResult> {
    const validation = AdminCommandSchema.safeParse(input);
    if (!validation.success) {
      return {
        success: false,
        error: `Invalid command: ${validation.error.message}`,
      };
    }

    const command = validation.data;

    if (this.executingCommands.has(command.id)) {
      return { success: false, error: 'Command already executing' };
    }

    this.executingCommands.add(command.id);
    this.commandQueue.set(command.id, command);

    try {
      await this.eventBus.publish('admin:command:started', {
        commandId: command.id,
        serverId: command.serverId,
        command: command.command,
        issuedBy: command.issuedBy,
      });

      const handler = getCommandHandler(command.command);
      if (!handler) {
        const available = listCommands();
        return {
          success: false,
          error: `Unknown command: ${command.command}. Available: ${available.join(', ')}`,
        };
      }

      const context: CommandContext = {
        server: await this.getServerInstance(command.serverId),
        processManager: this.processManager,
        eventBus: this.eventBus,
      };

      const result = await handler(command, context);

      await this.eventBus.publish('admin:command:completed', {
        commandId: command.id,
        serverId: command.serverId,
        command: command.command,
        success: result.success,
        issuedBy: command.issuedBy,
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.eventBus.publish('admin:command:failed', {
        commandId: command.id,
        serverId: command.serverId,
        command: command.command,
        error: errorMessage,
        issuedBy: command.issuedBy,
      });
      return { success: false, error: errorMessage };
    } finally {
      this.executingCommands.delete(command.id);
      this.commandQueue.delete(command.id);
    }
  }

  async executeBatch(commands: AdminCommand[]): Promise<CommandResult[]> {
    const results: CommandResult[] = [];
    for (const cmd of commands) {
      const result = await this.executeCommand(cmd);
      results.push(result);
      if (!result.success) {
        break;
      }
    }
    return results;
  }

  getQueuedCommands(): AdminCommand[] {
    return Array.from(this.commandQueue.values());
  }

  getExecutingCommands(): string[] {
    return Array.from(this.executingCommands);
  }

  isCommandExecuting(commandId: string): boolean {
    return this.executingCommands.has(commandId);
  }

  getAvailableCommands(): string[] {
    return listCommands();
  }

  private async getServerInstance(serverId: string): Promise<ServerInstance> {
    const info = await this.processManager.getProcessInfo(serverId);
    return {
      id: serverId,
      name: `server-${serverId}`,
      config: {} as any,
      status: info?.status === 'running' ? 'running' : 'stopped',
      port: 0,
      processId: info?.pid,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}

export function createAdminCommandService(
  processManager: ProcessManagerInterface,
  eventBus: EventBusInterface
): AdminCommandService {
  return new AdminCommandService(processManager, eventBus);
}