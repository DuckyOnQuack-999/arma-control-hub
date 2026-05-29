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

let authSubscription: { unsubscribe: () => void } | null = null;

const fetchRole = async (userId: string, set: any, attempt = 1) => {
  try {
    const { data } = await supabase.rpc('get_user_role', { _user_id: userId });
    if (data) {
      set((s: any) => ({
        user: s.user ? { ...s.user, role: data as UserRole } : s.user,
      }));
    }
  } catch (err) {
    if (attempt < 3) {
      console.warn(`fetchRole attempt ${attempt} failed, retrying...`, err);
      setTimeout(() => fetchRole(userId, set, attempt + 1), 1000 * attempt);
    } else {
      console.error('fetchRole failed after 3 attempts — user retains default viewer role', err);
    }
  }
};

export const useAuthStore = create<AuthStore>()((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  initialize: async () => {
    // Unsubscribe previous listener to prevent double-subscription
    if (authSubscription) {
      authSubscription.unsubscribe();
      authSubscription = null;
    }

    // Set up listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Skip role fetch on sign-out or token refresh
      if (event === 'SIGNED_OUT') {
        set({ user: null, isAuthenticated: false, isLoading: false });
        return;
      }
      if (event === 'TOKEN_REFRESHED') return;

      if (session?.user) {
        set({
          user: { id: session.user.id, email: session.user.email || '', role: 'viewer' },
          isAuthenticated: true,
          isLoading: false,
        });
        fetchRole(session.user.id, set);
      } else {
        set({ user: null, isAuthenticated: false, isLoading: false });
      }
    });
    authSubscription = subscription;

    // Resolve initial state with error handling
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        set({
          user: { id: session.user.id, email: session.user.email || '', role: 'viewer' },
          isAuthenticated: true,
          isLoading: false,
        });
        fetchRole(session.user.id, set);
      } else {
        set({ user: null, isAuthenticated: false, isLoading: false });
      }
    } catch {
      // On network error, unblock UI
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  login: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
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
