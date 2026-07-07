import { z } from 'zod';
import type { AdminCommand, ServerInstance, Player, ServerConfig } from '@rx/shared-types';

// Command input schema
export const AdminCommandSchema = z.object({
  id: z.string().uuid(),
  serverId: z.string(),
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  issuedBy: z.string(),
  issuedAt: z.date().default(() => new Date()),
  status: z.enum(['pending', 'executing', 'completed', 'failed']).default('pending'),
  result: z.unknown().optional(),
  error: z.string().optional(),
});

export type AdminCommandInput = z.infer<typeof AdminCommandSchema>;

// Command result schema
export const CommandResultSchema = z.object({
  success: z.boolean(),
  output: z.string().optional(),
  error: z.string().optional(),
  data: z.unknown().optional(),
});

export type CommandResult = z.infer<typeof CommandResultSchema>;

// Interfaces
export interface CommandHandler {
  (command: AdminCommandInput, context: CommandContext): Promise<CommandResult>;
}

export interface CommandContext {
  server: ServerInstance;
  processManager: ProcessManagerInterface;
  eventBus: EventBusInterface;
}

export interface ProcessManagerInterface {
  sendCommand(serverId: string, command: string): Promise<CommandResult>;
  getProcessInfo(serverId: string): Promise<ProcessInfo | null>;
  getLogs(serverId: string, lines?: number): Promise<string[]>;
}

export interface EventBusInterface {
  publish(event: string, data: unknown): Promise<void>;
  subscribe(serverId: string, clientId: string, events: string[]): Promise<void>;
  unsubscribe(serverId: string, clientId: string): Promise<void>;
}

export interface ProcessInfo {
  pid: number;
  status: 'running' | 'stopped' | 'crashed';
  cpuUsage: number;
  memoryUsage: number;
  uptime: number;
}

// Command registry
const COMMAND_REGISTRY: Record<string, CommandHandler> = {};

export function registerCommand(name: string, handler: CommandHandler): void {
  COMMAND_REGISTRY[name.toLowerCase()] = handler;
}

export function getCommandHandler(name: string): CommandHandler | undefined {
  return COMMAND_REGISTRY[name.toLowerCase()];
}

export function listCommands(): string[] {
  return Object.keys(COMMAND_REGISTRY);
}

// Export service class and factory
export { AdminCommandService, createAdminCommandService } from './service';
export { adminCommandRoutes } from './routes';
export { adminCommandsPlugin } from './plugin';

// Register standard commands on import
import './commands/standard';
