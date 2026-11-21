import React, { createContext, useContext, useEffect } from 'react';
import { useRouter, useSegments } from 'expo-router';
import { useAuthStore, type AuthState } from './authStore';
import { supabase } from './supabase';

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const store = useAuthStore();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    // 1. Initialize session on startup
    void store.initialize();

    // 2. Subscribe to auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        useAuthStore.setState({ session, user: session.user });
        const profile = await store.fetchProfile(session.user.id);
        useAuthStore.setState({ profile, isLoading: false });
      } else if (event === 'SIGNED_OUT') {
        useAuthStore.setState({ session: null, user: null, profile: null, isLoading: false });
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // 3. Route Guard: Enforce access rules based on auth & onboarding status
  useEffect(() => {
    if (store.isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inOnboarding = segments[0] === 'onboarding';

    if (!store.user) {
      // Signed out: must be in (auth) group
      if (!inAuthGroup) {
        router.replace('/(auth)/sign-in');
      }
    } else {
      // Signed in
      const onboardingCompleted = store.profile?.onboarding_completed ?? false;

      if (!onboardingCompleted) {
        // Incomplete onboarding: route to onboarding placeholder
        if (!inOnboarding) {
          router.replace('/onboarding');
        }
      } else {
        // Complete onboarding: if in auth group or onboarding, route to main app tabs
        if (inAuthGroup || inOnboarding) {
          router.replace('/(app)');
        }
      }
    }
  }, [store.user, store.profile?.onboarding_completed, store.isLoading, segments]);

  return <AuthContext.Provider value={store}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    return useAuthStore.getState();
  }
  return ctx;
}
