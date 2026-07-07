import { create } from 'zustand';
import { AppEvent, WSMessage, WSEventMessage } from '../types';
import { useAuthStore } from './authStore';
import { useServerStore } from './serverStore';

interface WebSocketState {
  ws: WebSocket | null;
  isConnected: boolean;
  reconnectAttempts: number;
  maxReconnectAttempts: number;
  reconnectDelay: number;
  subscriptions: Set<string>;

  connect: () => void;
  disconnect: () => void;
  subscribe: (channel: string) => void;
  unsubscribe: (channel: string) => void;
  send: (message: WSMessage) => void;
  handleMessage: (event: MessageEvent) => void;
  handleEvent: (event: AppEvent) => void;
}

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001/ws';

export const useWebSocketStore = create<WebSocketState>((set, get) => ({
  ws: null,
  isConnected: false,
  reconnectAttempts: 0,
  maxReconnectAttempts: 10,
  reconnectDelay: 1000,
  subscriptions: new Set(),

  connect: () => {
    const { ws, isConnected, reconnectAttempts, maxReconnectAttempts } = get();
    if (ws && isConnected) return;

    const token = useAuthStore.getState().token;
    if (!token) return;

    try {
      const wsInstance = new WebSocket(`${WS_URL}?token=${token}`);

      wsInstance.onopen = () => {
        console.log('[WebSocket] Connected');
        set({ ws: wsInstance, isConnected: true, reconnectAttempts: 0 });

        // Resubscribe to previous channels
        const { subscriptions } = get();
        subscriptions.forEach((channel) => {
          wsInstance.send(JSON.stringify({ type: 'subscribe', channel }));
        });
      };

      wsInstance.onmessage = (event) => {
        get().handleMessage(event);
      };

      wsInstance.onclose = () => {
        console.log('[WebSocket] Disconnected');
        set({ isConnected: false, ws: null });

        // Attempt reconnection
        if (reconnectAttempts < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
          setTimeout(() => {
            set((state) => ({ reconnectAttempts: state.reconnectAttempts + 1 }));
            get().connect();
          }, delay);
        }
      };

      wsInstance.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
      };

      set({ ws: wsInstance });
    } catch (error) {
      console.error('[WebSocket] Connection failed:', error);
    }
  },

  disconnect: () => {
    const { ws } = get();
    if (ws) {
      ws.close();
      set({ ws: null, isConnected: false });
    }
  },

  subscribe: (channel: string) => {
    const { ws, isConnected, subscriptions } = get();
    const newSubscriptions = new Set(subscriptions);
    newSubscriptions.add(channel);
    set({ subscriptions: newSubscriptions });

    if (ws && isConnected) {
      ws.send(JSON.stringify({ type: 'subscribe', channel }));
    }
  },

  unsubscribe: (channel: string) => {
    const { ws, isConnected, subscriptions } = get();
    const newSubscriptions = new Set(subscriptions);
    newSubscriptions.delete(channel);
    set({ subscriptions: newSubscriptions });

    if (ws && isConnected) {
      ws.send(JSON.stringify({ type: 'unsubscribe', channel }));
    }
  },

  send: (message: WSMessage) => {
    const { ws, isConnected } = get();
    if (ws && isConnected) {
      ws.send(JSON.stringify(message));
    }
  },

  handleMessage: (event: MessageEvent) => {
    try {
      const message: WSMessage = JSON.parse(event.data);

      if (message.type === 'event') {
        get().handleEvent(message.payload as AppEvent);
      } else if (message.type === 'error') {
        console.error('[WebSocket] Server error:', message.payload);
      }
    } catch (error) {
      console.error('[WebSocket] Failed to parse message:', error);
    }
  },

  handleEvent: (event: AppEvent) => {
    const serverStore = useServerStore.getState();

    switch (event.type) {
      case 'server:create':
      case 'server:start':
      case 'server:stop':
      case 'server:crash':
      case 'server:restart': {
        if (event.data) {
          serverStore.updateServer(event.serverId, event.data as Partial<typeof serverStore.servers[0]>);
        }
        break;
      }
      case 'log': {
        serverStore.addLog(event.serverId, event as any);
        break;
      }
      case 'player:join': {
        const player = {
          name: event.data.playerName,
          ip: event.data.ip,
          joinedAt: new Date(),
          clanTag: event.data.clanTag,
        };
        serverStore.addPlayer(event.serverId, player);
        break;
      }
      case 'player:leave': {
        serverStore.removePlayer(event.serverId, event.data.playerName);
        break;
      }
      case 'map:change': {
        serverStore.updateServer(event.serverId, { currentMap: event.data.mapName });
        break;
      }
      case 'match:start':
      case 'match:end': {
        // Match events handled separately
        break;
      }
      case 'resource:update': {
        serverStore.updateResources(event.serverId, event.data);
        break;
      }
      case 'admin:command': {
        // Admin command response
        break;
      }
    }
  },
}));

export const WebSocketProvider = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated } = useAuthStore();
  const { connect, disconnect } = useWebSocketStore();

  // Auto-connect when authenticated
  // In a real app, use useEffect here
  if (isAuthenticated) {
    connect();
  }

  return children;
};