import { Platform } from 'react-native';

/**
 * Cross-platform storage adapter for Supabase Auth:
 * - Native (iOS / Android): uses expo-secure-store via dynamic import
 * - Web / SSR: uses window.localStorage with fallback
 */
export const supabaseStorage = {
  getItem: async (key: string): Promise<string | null> => {
    if (Platform.OS === 'web' || typeof window === 'undefined') {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
      return null;
    }
    try {
      const SecureStore = await import('expo-secure-store');
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (Platform.OS === 'web' || typeof window === 'undefined') {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
      }
      return;
    }
    try {
      const SecureStore = await import('expo-secure-store');
      await SecureStore.setItemAsync(key, value);
    } catch {
      // Ignored if secure storage is unavailable on device
    }
  },
  removeItem: async (key: string): Promise<void> => {
    if (Platform.OS === 'web' || typeof window === 'undefined') {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
      }
      return;
    }
    try {
      const SecureStore = await import('expo-secure-store');
      await SecureStore.deleteItemAsync(key);
    } catch {
      // Ignored
    }
  },
};
