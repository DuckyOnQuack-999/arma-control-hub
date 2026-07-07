import { z } from 'zod';
import type { AdminCommand, AdminCommandResult, ServerInstance, Player } from '@rx/shared-types';

export const AdminCommandSchema = z.object({
  id: z.string().uuid(),
  serverId: z.string().uuid(),
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  issuedBy: z.string().uuid(),
  issuedAt: z.date(),
  status: z.enum(['pending', 'executing', 'completed', 'failed']),
  result: z.unknown().optional(),
  error: z.string().optional(),
});

export type AdminCommandInput = z.infer<typeof AdminCommandSchema>;

export const CommandResultSchema = z.object({
  success: z.boolean(),
  output: z.string().optional(),
  error: z.string().optional(),
  data: z.unknown().optional(),
});

export type CommandResult = z.infer<typeof CommandResultSchema>;

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

export const COMMAND_REGISTRY: Record<string, CommandHandler> = {};

export function registerCommand(name: string, handler: CommandHandler): void {
  COMMAND_REGISTRY[name] = handler;
}

export function getCommandHandler(name: string): CommandHandler | undefined {
  return COMMAND_REGISTRY[name];
}

export function listCommands(): string[] {
  return Object.keys(COMMAND_REGISTRY);
}

export { AdminCommandService, createAdminCommandService } from './service.js';
export { adminCommandRoutes } from './routes.js';
export { adminCommandsPlugin } from './plugin.js';