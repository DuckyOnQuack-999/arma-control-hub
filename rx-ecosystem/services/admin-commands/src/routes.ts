import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { AdminCommandService } from './service.js';
import { AdminCommandSchema, CommandResult } from '../index.js';
import { z } from 'zod';

const ExecuteCommandSchema = z.object({
  serverId: z.string().uuid(),
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  issuedBy: z.string().uuid(),
});

const BatchCommandSchema = z.object({
  commands: z.array(ExecuteCommandSchema).min(1).max(50),
});

export async function adminCommandRoutes(
  fastify: FastifyInstance,
  options: FastifyPluginOptions & { service: AdminCommandService }
): Promise<void> {
  const { service } = options;

  fastify.post<{
    Body: z.infer<typeof ExecuteCommandSchema>;
    Reply: CommandResult;
  }>(
    '/execute',
    {
      schema: {
        body: {
          type: 'object',
          required: ['serverId', 'command', 'issuedBy'],
          properties: {
            serverId: { type: 'string', format: 'uuid' },
            command: { type: 'string', minLength: 1 },
            args: { type: 'array', items: { type: 'string' }, default: [] },
            issuedBy: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              output: { type: 'string' },
              error: { type: 'string' },
              data: { type: 'object' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const validation = ExecuteCommandSchema.safeParse(request.body);
      if (!validation.success) {
        return reply.code(400).send({
          success: false,
          error: `Invalid request: ${validation.error.message}`,
        });
      }

      const { serverId, command, args, issuedBy } = validation.data;

      const adminCommand = {
        id: crypto.randomUUID(),
        serverId,
        command,
        args,
        issuedBy,
        issuedAt: new Date(),
        status: 'pending' as const,
      };

      const result = await service.executeCommand(adminCommand);
      return result;
    }
  );

  fastify.post<{
    Body: z.infer<typeof BatchCommandSchema>;
    Reply: CommandResult[];
  }>(
    '/batch',
    {
      schema: {
        body: {
          type: 'object',
          required: ['commands'],
          properties: {
            commands: {
              type: 'array',
              minItems: 1,
              maxItems: 50,
              items: {
                type: 'object',
                required: ['serverId', 'command', 'issuedBy'],
                properties: {
                  serverId: { type: 'string', format: 'uuid' },
                  command: { type: 'string', minLength: 1 },
                  args: { type: 'array', items: { type: 'string' }, default: [] },
                  issuedBy: { type: 'string', format: 'uuid' },
                },
              },
            },
          },
        },
        response: {
          200: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                output: { type: 'string' },
                error: { type: 'string' },
                data: { type: 'object' },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const validation = BatchCommandSchema.safeParse(request.body);
      if (!validation.success) {
        return reply.code(400).send([{
          success: false,
          error: `Invalid request: ${validation.error.message}`,
        }]);
      }

      const adminCommands = validation.data.commands.map(cmd => ({
        id: crypto.randomUUID(),
        serverId: cmd.serverId,
        command: cmd.command,
        args: cmd.args,
        issuedBy: cmd.issuedBy,
        issuedAt: new Date(),
        status: 'pending' as const,
      }));

      const results = await service.executeBatch(adminCommands);
      return results;
    }
  );

  fastify.get<{
    Reply: { commands: string[] };
  }>(
    '/commands',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              commands: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
    },
    async () => {
      return { commands: service.getAvailableCommands() };
    }
  );

  fastify.get<{
    Reply: { queued: number; executing: number };
  }>(
    '/status',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              queued: { type: 'number' },
              executing: { type: 'number' },
            },
          },
        },
      },
    },
    async () => {
      return {
        queued: service.getQueuedCommands().length,
        executing: service.getExecutingCommands().length,
      };
    }
  );
}