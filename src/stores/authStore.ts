import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import type { AuthUser, UserRole } from '@/data/types';

interface AuthStore {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>()((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  initialize: async () => {
    // Safety timeout — force loading to resolve after 5s
    const timeout = setTimeout(() => {
      if (get().isLoading) {
        set({ isLoading: false });
      }
    }, 5000);

    supabase.auth.onAuthStateChange(async (event, session) => {
      clearTimeout(timeout);
      if (session?.user) {
        let role: UserRole = 'viewer';
        try {
          const { data } = await supabase.rpc('get_user_role', { _user_id: session.user.id });
          if (data) role = data as UserRole;
        } catch {}
        set({
          user: { id: session.user.id, email: session.user.email || '', role },
          isAuthenticated: true,
          isLoading: false,
        });
      } else {
        set({ user: null, isAuthenticated: false, isLoading: false });
      }
    });
  },

  login: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    // Auth state change listener handles the rest
  },

  register: async (email, password) => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  },

  logout: async () => {
    await supabase.auth.signOut();
    set({ user: null, isAuthenticated: false });
  },
}));
