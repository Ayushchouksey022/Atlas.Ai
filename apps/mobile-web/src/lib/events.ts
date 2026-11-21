import { supabase } from './supabase';

export interface EventProperties {
  [key: string]: unknown;
}

/**
 * Tracks an analytics event.
 * Writes to the `public.events` table in Supabase.
 * Fails gracefully and silently in case of network or offline issues.
 */
export async function trackEvent(
  name: string,
  properties: EventProperties = {},
): Promise<void> {
  const timestamp = new Date().toISOString();

  // In-memory or console logging in dev
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log(`[Atlas.AI Analytics] ${name} (${timestamp}):`, properties);
  }

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Even if no user is signed in yet, we can record the event if allowed or skip
    const userId = user?.id ?? null;

    // Record locally in sessionStorage for debug/test inspection
    if (typeof window !== 'undefined' && window.sessionStorage) {
      try {
        const existing = JSON.parse(
          window.sessionStorage.getItem('__atlas_events__') || '[]',
        );
        existing.push({ name, properties, userId, timestamp });
        window.sessionStorage.setItem('__atlas_events__', JSON.stringify(existing));
      } catch {
        // ignore
      }
    }

    if (userId) {
      const { error } = await supabase.from('events').insert([
        {
          user_id: userId,
          name,
          properties: properties as any,
        },
      ]);
      if (error) {
        // Log error in dev but do not disrupt user flow
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.warn(`[Atlas.AI Analytics] Failed to insert event ${name}:`, error);
        }
      }
    }
  } catch (err) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn(`[Atlas.AI Analytics] Error tracking event ${name}:`, err);
    }
  }
}
