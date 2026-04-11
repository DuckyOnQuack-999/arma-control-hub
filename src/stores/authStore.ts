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

const fetchRole = (userId: string, set: any) => {
  supabase.rpc('get_user_role', { _user_id: userId })
    .then(({ data }) => {
      if (data) {
        set((s: any) => ({
          user: s.user ? { ...s.user, role: data as UserRole } : s.user,
        }));
      }
    })
    .catch(() => {
      // Retry once after 1s
      setTimeout(() => {
        supabase.rpc('get_user_role', { _user_id: userId })
          .then(({ data }) => {
            if (data) {
              set((s: any) => ({
                user: s.user ? { ...s.user, role: data as UserRole } : s.user,
              }));
            }
          })
          .catch(() => {});
      }, 1000);
    });
};

export const useAuthStore = create<AuthStore>()((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  initialize: async () => {
    // Set up listener FIRST — fire-and-forget, NO await inside callback
    supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        // Set authenticated immediately with default role
        set({
          user: { id: session.user.id, email: session.user.email || '', role: 'viewer' },
          isAuthenticated: true,
          isLoading: false,
        });
        // Fetch real role in background (non-blocking)
        fetchRole(session.user.id, set);
      } else {
        set({ user: null, isAuthenticated: false, isLoading: false });
      }
    });

    // Resolve initial state
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
