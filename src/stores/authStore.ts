import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '@/data/mockApi';
import type { User } from '@/data/types';

interface AuthStore {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => void;
  setTokens: (access: string, refresh: string) => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,

      login: async (username, password) => {
        const { user, accessToken, refreshToken } = await api.login(username, password);
        set({ user, accessToken, refreshToken, isAuthenticated: true });
      },

      register: async (username, password) => {
        const { user, accessToken, refreshToken } = await api.register(username, password);
        set({ user, accessToken, refreshToken, isAuthenticated: true });
      },

      logout: () => {
        set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false });
      },

      setTokens: (access, refresh) => {
        set({ accessToken: access, refreshToken: refresh });
      },
    }),
    { name: 'retrocycles-auth' }
  )
);
