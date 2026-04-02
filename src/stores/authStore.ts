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
    const resolveSession = async (session: any) => {
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
    };

    // Set up listener FIRST for subsequent changes
    supabase.auth.onAuthStateChange((_event, session) => {
      resolveSession(session);
    });

    // Then resolve initial state immediately
    const { data: { session } } = await supabase.auth.getSession();
    await resolveSession(session);
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
