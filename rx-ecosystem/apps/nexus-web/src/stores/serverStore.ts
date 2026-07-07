import { create } from 'zustand';
import { ServerInstance, ServerConfig, Player, Match, LogEvent, ResourceUsage } from '../types';

interface ServerState {
  servers: ServerInstance[];
  selectedServer: ServerInstance | null;
  logs: Map<string, LogEvent[]>;
  players: Map<string, Player[]>;
  matches: Map<string, Match[]>;
  resources: Map<string, ResourceUsage>;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchServers: () => Promise<void>;
  createServer: (config: ServerConfig) => Promise<ServerInstance>;
  startServer: (id: string) => Promise<void>;
  stopServer: (id: string) => Promise<void>;
  restartServer: (id: string) => Promise<void>;
  deleteServer: (id: string) => Promise<void>;
  selectServer: (server: ServerInstance | null) => void;
  updateServer: (id: string, updates: Partial<ServerInstance>) => void;
  addLog: (serverId: string, log: LogEvent) => void;
  addPlayer: (serverId: string, player: Player) => void;
  removePlayer: (serverId: string, playerName: string) => void;
  updateResources: (serverId: string, resources: ResourceUsage) => void;
  setMatch: (serverId: string, match: Match) => void;
  setError: (error: string | null) => void;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const getAuthHeaders = () => {
  const token = localStorage.getItem('rx-nexus-auth') 
    ? JSON.parse(localStorage.getItem('rx-nexus-auth')!).state.token 
    : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const useServerStore = create<ServerState>((set, get) => ({
  servers: [],
  selectedServer: null,
  logs: new Map(),
  players: new Map(),
  matches: new Map(),
  resources: new Map(),
  isLoading: false,
  error: null,

  fetchServers: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch(`${API_URL}/api/servers`, {
        headers: getAuthHeaders(),
      });
      if (!response.ok) throw new Error('Failed to fetch servers');
      const data = await response.json();
      set({ servers: data.servers || data, isLoading: false });
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
    }
  },

  createServer: async (config: ServerConfig) => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch(`${API_URL}/api/servers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ config }),
      });
      if (!response.ok) throw new Error('Failed to create server');
      const server = await response.json();
      set((state) => ({
        servers: [...state.servers, server],
        isLoading: false,
      }));
      return server;
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
      throw error;
    }
  },

  startServer: async (id: string) => {
    try {
      const response = await fetch(`${API_URL}/api/servers/${id}/start`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      if (!response.ok) throw new Error('Failed to start server');
      set((state) => ({
        servers: state.servers.map((s) =>
          s.id === id ? { ...s, state: 'starting' as const } : s
        ),
      }));
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },

  stopServer: async (id: string) => {
    try {
      const response = await fetch(`${API_URL}/api/servers/${id}/stop`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      if (!response.ok) throw new Error('Failed to stop server');
      set((state) => ({
        servers: state.servers.map((s) =>
          s.id === id ? { ...s, state: 'stopping' as const } : s
        ),
      }));
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },

  restartServer: async (id: string) => {
    try {
      const response = await fetch(`${API_URL}/api/servers/${id}/restart`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      if (!response.ok) throw new Error('Failed to restart server');
      set((state) => ({
        servers: state.servers.map((s) =>
          s.id === id ? { ...s, state: 'starting' as const } : s
        ),
      }));
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },

  deleteServer: async (id: string) => {
    try {
      const response = await fetch(`${API_URL}/api/servers/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!response.ok) throw new Error('Failed to delete server');
      set((state) => ({
        servers: state.servers.filter((s) => s.id !== id),
        selectedServer: state.selectedServer?.id === id ? null : state.selectedServer,
      }));
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },

  selectServer: (server: ServerInstance | null) => {
    set({ selectedServer: server });
  },

  updateServer: (id: string, updates: Partial<ServerInstance>) => {
    set((state) => ({
      servers: state.servers.map((s) =>
        s.id === id ? { ...s, ...updates } : s
      ),
      selectedServer:
        state.selectedServer?.id === id
          ? { ...state.selectedServer, ...updates }
          : state.selectedServer,
    }));
  },

  addLog: (serverId: string, log: LogEvent) => {
    set((state) => {
      const newLogs = new Map(state.logs);
      const serverLogs = newLogs.get(serverId) || [];
      newLogs.set(serverId, [...serverLogs.slice(-999), log]);
      return { logs: newLogs };
    });
  },

  addPlayer: (serverId: string, player: Player) => {
    set((state) => {
      const newPlayers = new Map(state.players);
      const serverPlayers = newPlayers.get(serverId) || [];
      if (!serverPlayers.find((p) => p.name === player.name)) {
        newPlayers.set(serverId, [...serverPlayers, player]);
      }
      return { players: newPlayers };
    });
  },

  removePlayer: (serverId: string, playerName: string) => {
    set((state) => {
      const newPlayers = new Map(state.players);
      const serverPlayers = newPlayers.get(serverId) || [];
      newPlayers.set(serverId, serverPlayers.filter((p) => p.name !== playerName));
      return { players: newPlayers };
    });
  },

  updateResources: (serverId: string, resources: ResourceUsage) => {
    set((state) => {
      const newResources = new Map(state.resources);
      newResources.set(serverId, resources);
      return { resources: newResources };
    });
  },

  setMatch: (serverId: string, match: Match) => {
    set((state) => {
      const newMatches = new Map(state.matches);
      newMatches.set(serverId, match);
      return { matches: newMatches };
    });
  },

  setError: (error: string | null) => {
    set({ error });
  },

  executeCommand: async (id: string, command: string) => {
    try {
      const response = await fetch(`${API_URL}/api/servers/${id}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ command }),
      });
      if (!response.ok) throw new Error('Failed to execute command');
      return await response.json();
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },
}));

export const ServerProvider = ({ children }: { children: React.ReactNode }) => {
  return children;
};