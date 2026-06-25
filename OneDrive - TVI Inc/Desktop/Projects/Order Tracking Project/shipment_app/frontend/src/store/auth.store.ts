import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '../types';

interface AuthState {
  accessToken: string | null;
  user: User | null;
  setToken: (token: string) => void;
  setUser: (user: User) => void;
  logout: () => void;
  isAuthenticated: () => boolean;
  can: (module: string, action: string) => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      user:        null,

      setToken: (token) => set({ accessToken: token }),
      setUser:  (user)  => set({ user }),

      logout: () => {
        set({ accessToken: null, user: null });
        // fire-and-forget
        fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' });
      },

      isAuthenticated: () => Boolean(get().accessToken && get().user),

      // Simple client-side permission check — real enforcement is server-side
      can: (_module, _action) => Boolean(get().user),
    }),
    {
      name: 'sms-auth',
      partialize: (state) => ({ accessToken: state.accessToken, user: state.user }),
    }
  )
);
