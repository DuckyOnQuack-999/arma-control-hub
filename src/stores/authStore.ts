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
    // Listen for auth state changes
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        const { data: role } = await supabase.rpc('get_user_role', { _user_id: session.user.id });
        set({
          user: {
            id: session.user.id,
            email: session.user.email || '',
            role: (role as UserRole) || 'viewer',
          },
          isAuthenticated: true,
          isLoading: false,
        });
      } else {
        set({ user: null, isAuthenticated: false, isLoading: false });
      }
    });

    // Check existing session
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const { data: role } = await supabase.rpc('get_user_role', { _user_id: session.user.id });
      set({
        user: {
          id: session.user.id,
          email: session.user.email || '',
          role: (role as UserRole) || 'viewer',
        },
        isAuthenticated: true,
        isLoading: false,
      });
    } else {
      set({ isLoading: false });
    }
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
