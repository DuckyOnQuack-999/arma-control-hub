import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';
import { subscribeToConsole, getConsoleHistory } from './processManager';
import { subscribeToMetrics, getMetricsHistory } from './metricsCollector';
import { ConsoleLine, MetricPoint } from './types';

const JWT_SECRET = process.env.AGENT_JWT_SECRET || 'retrocycles-agent-secret-change-in-production';

interface ClientInfo {
  ws: WebSocket;
  serverId?: string;
  channels: Set<string>;
  isAuthenticated: boolean;
}

const clients = new Map<WebSocket, ClientInfo>();

export function setupWebSocketServer(wss: WebSocketServer): void {
  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const client: ClientInfo = {
      ws,
      channels: new Set(),
      isAuthenticated: false,
    };
    clients.set(ws, client);

    // Extract token from query params
    const url = new URL(req.url || '/', 'http://localhost');
    const token = url.searchParams.get('token');

    if (token) {
      try {
        jwt.verify(token, JWT_SECRET);
        client.isAuthenticated = true;
        ws.send(JSON.stringify({ type: 'auth', status: 'ok' }));
      } catch (e) {
        ws.send(JSON.stringify({ type: 'auth', status: 'error', message: 'Invalid token' }));
        ws.close(1008, 'Invalid token');
        return;
      }
    } else {
      ws.send(JSON.stringify({ type: 'auth', status: 'required' }));
    }

    ws.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        handleMessage(ws, msg);
      } catch (e) {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
    });

    ws.on('error', () => {
      clients.delete(ws);
    });
  });
}

function handleMessage(ws: WebSocket, msg: any): void {
  const client = clients.get(ws);
  if (!client) return;

  switch (msg.type) {
    case 'subscribe': {
      const { channel, serverId } = msg;
      if (!client.isAuthenticated) {
        ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
        return;
      }

      client.serverId = serverId;
      client.channels.add(`${channel}:${serverId}`);

      if (channel === 'console') {
        // Send history
        const history = getConsoleHistory(serverId);
        ws.send(JSON.stringify({ type: 'console_history', lines: history }));

        // Subscribe to new lines
        const unsub = subscribeToConsole(serverId, (line: ConsoleLine) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'console_line', line }));
          }
        });

        // Store unsubscribe for cleanup
        (client as any).consoleUnsub = unsub;
      }

      if (channel === 'metrics') {
        // Send current history
        const history = getMetricsHistory(serverId, 1);
        ws.send(JSON.stringify({ type: 'metrics_history', metrics: history }));

        // Subscribe to new metrics
        const unsub = subscribeToMetrics(serverId, (metric: MetricPoint) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'metric', metric }));
          }
        });

        (client as any).metricsUnsub = unsub;
      }

      ws.send(JSON.stringify({ type: 'subscribed', channel, serverId }));
      break;
    }

    case 'unsubscribe': {
      const { channel } = msg;
      if (client.serverId) {
        client.channels.delete(`${channel}:${client.serverId}`);
      }

      if (channel === 'console' && (client as any).consoleUnsub) {
        (client as any).consoleUnsub();
      }
      if (channel === 'metrics' && (client as any).metricsUnsub) {
        (client as any).metricsUnsub();
      }

      ws.send(JSON.stringify({ type: 'unsubscribed', channel }));
      break;
    }

    case 'command': {
      const { serverId, command } = msg;
      if (!client.isAuthenticated) {
        ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
        return;
      }

      // Import here to avoid circular dependency
      const { sendCommand } = require('./processManager');
      const result = sendCommand(serverId, command);
      ws.send(JSON.stringify({ type: 'command_result', result }));
      break;
    }

    default:
      ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
  }
}

export function broadcastToChannel(channel: string, serverId: string, data: any): void {
  const message = JSON.stringify(data);
  for (const [ws, client] of clients) {
    if (client.channels.has(`${channel}:${serverId}`) && ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  }
}
