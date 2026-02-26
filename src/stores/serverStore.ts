import { create } from 'zustand';
import type { Server } from '@/data/types';

interface ServerStore {
  selectedServerId: number | null;
  servers: Server[];
  setSelectedServer: (id: number | null) => void;
  setServers: (servers: Server[]) => void;
  updateServer: (id: number, updates: Partial<Server>) => void;
}

export const useServerStore = create<ServerStore>()((set) => ({
  selectedServerId: null,
  servers: [],
  setSelectedServer: (id) => set({ selectedServerId: id }),
  setServers: (servers) => set({ servers }),
  updateServer: (id, updates) =>
    set((state) => ({
      servers: state.servers.map((s) => (s.id === id ? { ...s, ...updates } : s)),
    })),
}));
