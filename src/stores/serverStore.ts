import { create } from 'zustand';
import type { Server } from '@/data/types';

interface ServerStore {
  selectedServerId: number | null;
  servers: Server[];
  setSelectedServer: (id: number | null) => void;
  setServers: (servers: Server[]) => void;
}

export const useServerStore = create<ServerStore>()((set) => ({
  selectedServerId: null,
  servers: [],
  setSelectedServer: (id) => set({ selectedServerId: id }),
  setServers: (servers) => set({ servers }),
}));
