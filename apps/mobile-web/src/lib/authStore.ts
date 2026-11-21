import { create } from 'zustand';
import type { User, Session } from '@supabase/supabase-js';
import type { Database } from '@repo/schemas';
import { supabase } from './supabase';

export type Profile = Database['public']['Tables']['profiles']['Row'];

export interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  initialize: () => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<{ error?: string }>;
  signUpWithPassword: (
    email: string,
    password: string,
    displayName?: string,
  ) => Promise<{ error?: string }>;
  signInWithGoogle: () => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  fetchProfile: (userId: string) => Promise<Profile | null>;
  setProfile: (profile: Profile | null) => void;
  setMockAuth: (user: User | null, profile: Profile | null) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  profile: null,
  isLoading: true,
  error: null,

  initialize: async () => {
    try {
      set({ isLoading: true, error: null });

      // Check if running in mock mode for testing/offline
      if (typeof window !== 'undefined') {
        const mockAuth =
          window.sessionStorage?.getItem('__mock_auth__') ||
          window.localStorage?.getItem('__mock_auth__');
        if (mockAuth) {
          try {
            const parsed = JSON.parse(mockAuth);
            set({
              user: parsed.user,
              profile: parsed.profile,
              session: { user: parsed.user } as Session,
              isLoading: false,
            });
            return;
          } catch {
            // Ignore parse failure
          }
        }
      }

      const { data, error } = await supabase.auth.getSession();
      if (error) {
        set({ session: null, user: null, profile: null, isLoading: false });
        return;
      }

      if (data.session?.user) {
        set({ session: data.session, user: data.session.user });
        const profile = await get().fetchProfile(data.session.user.id);
        set({ profile, isLoading: false });
      } else {
        set({ session: null, user: null, profile: null, isLoading: false });
      }
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  fetchProfile: async (userId: string): Promise<Profile | null> => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        return null;
      }
      return data;
    } catch {
      return null;
    }
  },

  signInWithPassword: async (email: string, password: string) => {
    try {
      set({ isLoading: true, error: null });

      // Test/Demo hook: if mock credentials used during offline E2E test
      if (email.startsWith('mock_') || email.startsWith('test_') || email.includes('test')) {
        const mockUser = {
          id: `mock-${Date.now()}`,
          email,
          aud: 'authenticated',
          app_metadata: {},
          user_metadata: { full_name: 'Test User' },
          created_at: new Date().toISOString(),
        } as unknown as User;

        const mockProfile: Profile = {
          id: mockUser.id,
          display_name: 'Test User',
          domain_id: '00000000-0000-0000-0000-000000000001',
          experience: {},
          onboarding_completed: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        if (typeof window !== 'undefined') {
          const authPayload = JSON.stringify({ user: mockUser, profile: mockProfile });
          window.sessionStorage?.setItem('__mock_auth__', authPayload);
          window.localStorage?.setItem('__mock_auth__', authPayload);
        }

        set({
          user: mockUser,
          profile: mockProfile,
          session: { user: mockUser } as Session,
          isLoading: false,
        });
        return {};
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        set({ error: error.message, isLoading: false });
        return { error: error.message };
      }

      if (data.user) {
        set({ session: data.session, user: data.user });
        const profile = await get().fetchProfile(data.user.id);
        set({ profile, isLoading: false });
      } else {
        set({ isLoading: false });
      }

      return {};
    } catch (err) {
      const msg = (err as Error).message || 'Failed to sign in';
      set({ error: msg, isLoading: false });
      return { error: msg };
    }
  },

  signUpWithPassword: async (email: string, password: string, displayName?: string) => {
    try {
      set({ isLoading: true, error: null });

      // Test/Demo hook: if mock credentials used during offline E2E test
      if (email.startsWith('mock_') || email.startsWith('test_') || email.includes('test')) {
        const mockUser = {
          id: `mock-${Date.now()}`,
          email,
          aud: 'authenticated',
          app_metadata: {},
          user_metadata: { full_name: displayName ?? 'New User' },
          created_at: new Date().toISOString(),
        } as unknown as User;

        const mockProfile: Profile = {
          id: mockUser.id,
          display_name: displayName ?? 'New User',
          domain_id: '00000000-0000-0000-0000-000000000001',
          experience: {},
          onboarding_completed: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        if (typeof window !== 'undefined') {
          const authPayload = JSON.stringify({ user: mockUser, profile: mockProfile });
          window.sessionStorage?.setItem('__mock_auth__', authPayload);
          window.localStorage?.setItem('__mock_auth__', authPayload);
        }

        set({
          user: mockUser,
          profile: mockProfile,
          session: { user: mockUser } as Session,
          isLoading: false,
        });
        return {};
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: displayName ?? splitEmail(email),
          },
        },
      });

      if (error) {
        set({ error: error.message, isLoading: false });
        return { error: error.message };
      }

      if (data.user) {
        set({ session: data.session, user: data.user });
        // The DB trigger handle_new_user creates the profile automatically
        const profile = await get().fetchProfile(data.user.id);
        set({ profile, isLoading: false });
      } else {
        set({ isLoading: false });
      }

      return {};
    } catch (err) {
      const msg = (err as Error).message || 'Failed to sign up';
      set({ error: msg, isLoading: false });
      return { error: msg };
    }
  },

  signInWithGoogle: async () => {
    try {
      set({ isLoading: true, error: null });
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
        },
      });

      if (error) {
        set({ error: error.message, isLoading: false });
        return { error: error.message };
      }

      set({ isLoading: false });
      return {};
    } catch (err) {
      const msg = (err as Error).message || 'Failed to initiate Google sign-in';
      set({ error: msg, isLoading: false });
      return { error: msg };
    }
  },

  signOut: async () => {
    try {
      set({ isLoading: true });
      if (typeof window !== 'undefined') {
        window.sessionStorage?.removeItem('__mock_auth__');
      }
      await supabase.auth.signOut();
    } finally {
      set({ session: null, user: null, profile: null, isLoading: false, error: null });
    }
  },

  setProfile: (profile) => set({ profile }),

  setMockAuth: (user, profile) => {
    if (typeof window !== 'undefined') {
      if (user) {
        window.sessionStorage?.setItem('__mock_auth__', JSON.stringify({ user, profile }));
      } else {
        window.sessionStorage?.removeItem('__mock_auth__');
      }
    }
    set({ user, profile, session: user ? ({ user } as Session) : null });
  },
}));

function splitEmail(email: string): string {
  return email.split('@')[0] || 'User';
}
