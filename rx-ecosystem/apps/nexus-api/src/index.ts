import Fastify, { FastifyInstance } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyWebsocket from '@fastify/websocket';
import { createCoreEngine, CoreEngine } from '@rx/core-engine';
import { createEventBus } from '@rx/event-bus';
import { createAdminCommandService } from '@rx/admin-commands';
import { createProcessManager } from '@rx/process-manager';
import { EventBus } from '@rx/event-bus';
import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'rx-nexus-secret-change-in-production';
const PORT = parseInt(process.env.PORT || '3001', 10);
const EVENT_BUS_PORT = parseInt(process.env.EVENT_BUS_PORT || '3002', 10);

interface JWTPayload {
  userId: string;
  username: string;
  role: 'admin' | 'moderator' | 'viewer';
}

async function main() {
  const app: FastifyInstance = Fastify({
    logger: {
      level: 'info',
      transport: {
        target: 'pino-pretty',
        options: { colorize: true },
      },
    },
  });

  // Register plugins
  await app.register(fastifyCors, {
    origin: true,
    credentials: true,
  });

  await app.register(fastifyWebsocket);

  // Initialize services
  const eventBus = createEventBus({ port: EVENT_BUS_PORT });
  const coreEngine = createCoreEngine({ eventBus });

  // Initialize core engine and discover existing instances
  await coreEngine.initialize();
  await eventBus.start(EVENT_BUS_PORT);

  // Auth middleware
  async function authenticate(request: any, reply: any) {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.substring(7);
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
      request.user = decoded;
    } catch (error) {
      return reply.status(401).send({ error: 'Invalid or expired token' });
    }
  }

  // Optional auth - doesn't fail if no token
  async function optionalAuth(request: any, reply: any) {
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
        request.user = decoded;
      } catch {
        // Ignore invalid token for optional auth
      }
    }
  }

  // Health check
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  // Auth endpoints
  app.post('/auth/login', async (request, reply) => {
    const { username, password } = request.body as { username: string; password: string };

    // In production, verify against rx-auth-server or database
    // For now, simple demo authentication
    if (username === 'admin' && password === 'admin') {
      const token = jwt.sign(
        { userId: '1', username: 'admin', role: 'admin' },
        JWT_SECRET,
        { expiresIn: '24h' }
      );
      return { token, user: { id: '1', username: 'admin', role: 'admin' } };
    }

    return reply.status(401).send({ error: 'Invalid credentials' });
  });

  app.post('/auth/register', async (request, reply) => {
    // In production, create user in database
    return reply.status(501).send({ error: 'Registration not implemented - use rx-auth-server' });
  });

  // Server management endpoints
  app.get('/api/servers', { preHandler: [optionalAuth] }, async (request, reply) => {
    const servers = coreEngine.listServers();
    return { servers, total: servers.length };
  });

  app.post('/api/servers', { preHandler: [authenticate] }, async (request, reply) => {
    const { name, gameMode, maxPlayers, mapRotation, customCfg, autoRestart } = request.body as {
      name: string;
      gameMode?: string;
      maxPlayers?: number;
      mapRotation?: string[];
      customCfg?: Record<string, string>;
      autoRestart?: boolean;
    };

    if (!name) {
      return reply.status(400).send({ error: 'Server name is required' });
    }

    const server = await coreEngine.createServer({
      name,
      gameMode: (gameMode as any) || 'SUMO',
      maxPlayers: maxPlayers || 16,
      mapRotation,
      customCfg,
      autoRestart: autoRestart ?? true,
    });

    return reply.status(201).send(server);
  });

  app.get('/api/servers/:id', { preHandler: [optionalAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const server = coreEngine.getServer(id);
    if (!server) {
      return reply.status(404).send({ error: 'Server not found' });
    }
    return server;
  });

  app.patch('/api/servers/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    // Update server config - would need to implement
    const server = coreEngine.getServer(id);
    if (!server) {
      return reply.status(404).send({ error: 'Server not found' });
    }
    return reply.status(501).send({ error: 'Server update not yet implemented' });
  });

  app.delete('/api/servers/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await coreEngine.deleteServer(id);
    return { success: true };
  });

  // Server lifecycle endpoints
  app.post('/api/servers/:id/start', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await coreEngine.startServer(id);
    return { success: true };
  });

  app.post('/api/servers/:id/stop', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await coreEngine.stopServer(id);
    return { success: true };
  });

  app.post('/api/servers/:id/restart', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await coreEngine.restartServer(id);
    return { success: true };
  });

  // Admin command endpoints
  app.post('/api/servers/:id/command', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { command } = request.body as { command: string };
    const user = (request as any).user as JWTPayload;

    const result = await coreEngine.sendAdminCommand(id, command);
    return result;
  });

  // Server logs endpoint
  app.get('/api/servers/:id/logs', { preHandler: [optionalAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { limit = 100, offset = 0 } = request.query as { limit?: string; offset?: string };
    const logs = await coreEngine.getServerLogs(id, parseInt(limit, 10), parseInt(offset, 10));
    return { logs };
  });

  // WebSocket endpoint for real-time events
  app.register(async function (fastify) {
    fastify.get('/ws', { websocket: true }, (connection, request) => {
      const url = new URL(request.url, `http://${request.headers.host}`);
      const token = url.searchParams.get('token');

      let user: JWTPayload | null = null;
      if (token) {
        try {
          user = jwt.verify(token, JWT_SECRET) as JWTPayload;
        } catch {
          // Invalid token, continue as anonymous
        }
      }

      const clientId = randomUUID();
      console.log(`WS client connected: ${clientId}, user: ${user?.username || 'anonymous'}`);

      // Subscribe to events
      const handleEvent = (event: any) => {
        if (connection.readyState === 1) { // OPEN
          connection.send(JSON.stringify({ type: 'event', payload: event }));
        }
      };

      eventBus.on('*', handleEvent);

      connection.on('message', (message) => {
        try {
          const data = JSON.parse(message.toString());
          if (data.type === 'subscribe' && data.channel) {
            eventBus.subscribe(clientId, data.channel);
          } else if (data.type === 'unsubscribe' && data.channel) {
            eventBus.unsubscribe(clientId, data.channel);
          }
        } catch (e) {
          // Ignore parse errors
        }
      });

      connection.on('close', () => {
        eventBus.off('*', handleEvent);
        eventBus.unsubscribeAll(clientId);
        console.log(`WS client disconnected: ${clientId}`);
      });

      // Send welcome message
      connection.send(JSON.stringify({ type: 'welcome', clientId, user: user?.username || null }));
    });
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('Shutting down...');
    await coreEngine.shutdown();
    await eventBus.stop();
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // Start server
  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`RX-NEXUS API server running on http://0.0.0.0:${PORT}`);
    console.log(`WebSocket available at ws://0.0.0.0:${PORT}/ws`);
    console.log(`Event bus listening on port ${EVENT_BUS_PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
