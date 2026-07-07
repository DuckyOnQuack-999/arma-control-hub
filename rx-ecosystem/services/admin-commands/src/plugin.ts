import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { AdminCommandService, createAdminCommandService } from './service.js';
import { ProcessManagerInterface, EventBusInterface } from '../index.js';
import { adminCommandRoutes } from './routes.js';

export interface AdminCommandsPluginOptions {
  processManager: ProcessManagerInterface;
  eventBus: EventBusInterface;
}

export async function adminCommandsPlugin(
  fastify: FastifyInstance,
  options: AdminCommandsPluginOptions
): Promise<void> {
  const service = createAdminCommandService(options.processManager, options.eventBus);

  fastify.decorate('adminCommands', service);

  await fastify.register(adminCommandRoutes, { service });

  fastify.addHook('onClose', async () => {
    service.removeAllListeners();
  });
}

export { AdminCommandService, createAdminCommandService } from './service.js';
export { adminCommandRoutes } from './routes.js';