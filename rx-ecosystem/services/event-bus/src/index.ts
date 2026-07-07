import { EventEmitter } from 'events';
import { WebSocketServer, WebSocket, RawData } from 'ws';
import { createServer, Server as HttpServer } from 'http';
import {
  AppEvent,
  WSMessage,
  WSSubscribeMessage,
  WSUnsubscribeMessage,
  WSAuthMessage,
  WSEventMessage,
  WSErrorMessage,
  EventType,
} from '@rx/shared-types';

interface ClientConnection {
  ws: WebSocket;
  subscriptions: Set<string>;
  authenticated: boolean;
  userId?: string;
  userRole?: string;
}

export class EventBus extends EventEmitter {
  private httpServer: HttpServer | null = null;
  private wss: WebSocketServer | null = null;
  private clients: Map<string, ClientConnection> = new Map();
  private clientIdCounter = 0;

  constructor() {
    super();
    this.setMaxListeners(1000);
  }

  start(port: number = 3002): Promise<void> {
    return new Promise((resolve, reject) => {
      this.httpServer = createServer();
      this.wss = new WebSocketServer({ server: this.httpServer });

      this.wss.on('connection', (ws: WebSocket, req) => {
        this.handleConnection(ws, req);
      });

      this.wss.on('error', (error) => {
        console.error('WebSocket server error:', error);
      });

      this.httpServer.listen(port, () => {
        console.log(`Event bus WebSocket server listening on port ${port}`);
        resolve();
      });

      this.httpServer.on('error', (error) => {
        reject(error);
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.wss) {
        this.wss.close(() => {
          if (this.httpServer) {
            this.httpServer.close(() => {
              resolve();
            });
          } else {
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }

  private handleConnection(ws: WebSocket, req: any): void {
    const clientId = `client_${++this.clientIdCounter}_${Date.now()}`;
    const client: ClientConnection = {
      ws,
      subscriptions: new Set(['global']),
      authenticated: false,
    };

    this.clients.set(clientId, client);

    ws.on('message', (data: RawData) => {
      this.handleMessage(clientId, data);
    });

    ws.on('close', () => {
      this.clients.delete(clientId);
    });

    ws.on('error', (error) => {
      console.error(`Client ${clientId} error:`, error);
      this.clients.delete(clientId);
    });

    this.sendToClient(clientId, {
      type: 'event',
      payload: { type: 'connected', clientId, timestamp: new Date() },
    });
  }

  private handleMessage(clientId: string, data: RawData): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    try {
      const message: WSMessage = JSON.parse(data.toString());

      switch (message.type) {
        case 'subscribe':
          this.handleSubscribe(clientId, message as WSSubscribeMessage);
          break;
        case 'unsubscribe':
          this.handleUnsubscribe(clientId, message as WSUnsubscribeMessage);
          break;
        case 'auth':
          this.handleAuth(clientId, message as WSAuthMessage);
          break;
        default:
          this.sendError(clientId, 'UNKNOWN_MESSAGE_TYPE', `Unknown message type: ${message.type}`);
      }
    } catch (error) {
      this.sendError(clientId, 'INVALID_JSON', 'Invalid JSON message');
    }
  }

  private handleSubscribe(clientId: string, message: WSSubscribeMessage): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    if (message.channel) {
      client.subscriptions.add(message.channel);
      this.sendToClient(clientId, {
        type: 'event',
        payload: { type: 'subscribed', channel: message.channel, timestamp: new Date() },
      });
    }
  }

  private handleUnsubscribe(clientId: string, message: WSUnsubscribeMessage): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    if (message.channel) {
      client.subscriptions.delete(message.channel);
      this.sendToClient(clientId, {
        type: 'event',
        payload: { type: 'unsubscribed', channel: message.channel, timestamp: new Date() },
      });
    }
  }

  private handleAuth(clientId: string, message: WSAuthMessage): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    // In a real implementation, validate JWT token here
    // For now, accept any token
    if (message.token) {
      client.authenticated = true;
      client.userId = 'user_from_token';
      client.userRole = 'admin';
      client.subscriptions.add('global');

      this.sendToClient(clientId, {
        type: 'event',
        payload: { type: 'authenticated', userId: client.userId, timestamp: new Date() },
      });
    } else {
      this.sendError(clientId, 'AUTH_FAILED', 'Invalid token');
    }
  }

  private sendToClient(clientId: string, message: WSMessage): void {
    const client = this.clients.get(clientId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) return;

    try {
      client.ws.send(JSON.stringify(message));
    } catch (error) {
      console.error(`Failed to send to client ${clientId}:`, error);
    }
  }

  private sendError(clientId: string, code: string, message: string): void {
    this.sendToClient(clientId, {
      type: 'error',
      payload: { code, message },
    });
  }

  emit(event: AppEvent): void {
    super.emit(event.type, event);

    const eventMessage: WSEventMessage = {
      type: 'event',
      payload: event,
    };

    const eventType = event.type;
    const serverId = event.serverId;

    for (const [clientId, client] of this.clients.entries()) {
      if (!client.authenticated && eventType !== 'connected') continue;

      const shouldReceive =
        client.subscriptions.has('global') ||
        (serverId && client.subscriptions.has(`server:${serverId}`)) ||
        client.subscriptions.has(eventType);

      if (shouldReceive) {
        this.sendToClient(clientId, eventMessage);
      }
    }
  }

  subscribeToServer(clientId: string, serverId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.subscriptions.add(`server:${serverId}`);
    }
  }

  unsubscribeFromServer(clientId: string, serverId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.subscriptions.delete(`server:${serverId}`);
    }
  }

  getConnectedClients(): number {
    return this.clients.size;
  }

  getClientInfo(clientId: string): ClientConnection | undefined {
    return this.clients.get(clientId);
  }
}

export const eventBus = new EventBus();