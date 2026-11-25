import { supabase } from './supabase';
import type { AnalyticsEventName } from '@repo/schemas';

export interface EventProperties {
  [key: string]: unknown;
}

// In-memory PostHog instance or fallback wrapper
let posthogClient: any = null;

/**
 * Initializes PostHog client if API key is provided in environment.
 * If running in tests or without credentials, it falls back gracefully without throwing.
 */
export function getPostHogClient(): any {
  if (posthogClient) return posthogClient;

  const apiKey =
    process.env.EXPO_PUBLIC_POSTHOG_API_KEY ||
    (typeof process !== 'undefined' ? process.env.POSTHOG_API_KEY : '');

  const host =
    process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

  if (apiKey) {
    try {
      // Lazy load to prevent issues in SSR / non-browser test runs
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { PostHog } = require('posthog-react-native');
      posthogClient = new PostHog(apiKey, {
        host,
        flushAt: 1,
        flushInterval: 10000,
        enable: true,
      });
    } catch (err) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.warn('[Analytics] Failed to initialize PostHog client:', err);
      }
    }
  }

  return posthogClient;
}

/**
 * Sanitizes properties to ensure PRD Section 14 invariant:
 * "never log full user profiles to analytics"
 */
function sanitizeProperties(properties: EventProperties): EventProperties {
  const sanitized: EventProperties = {};
  const forbiddenKeys = ['password', 'email', 'profile', 'user_profile', 'token', 'secret'];

  for (const [key, value] of Object.entries(properties)) {
    if (forbiddenKeys.includes(key.toLowerCase())) {
      continue;
    }
    // Deep strip if object
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      sanitized[key] = sanitizeProperties(value as EventProperties);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Tracks an analytics event.
 * PRD Section 13 events:
 * - onboarding_started
 * - onboarding_completed (with duration)
 * - roadmap_viewed
 * - node_status_changed
 * - node_completed
 * - news_card_viewed
 * - red_button_tapped (with precomputed flag)
 * - verdict_previewed (verdict type)
 * - verdict_confirmed
 * - verdict_dismissed
 * - guide_opened
 * - sponsored_card_viewed
 * - sponsored_card_clicked
 * - daily_limit_hit
 */
export async function trackEvent(
  name: AnalyticsEventName | string,
  properties: EventProperties = {},
): Promise<void> {
  const timestamp = new Date().toISOString();
  const cleanProps = sanitizeProperties(properties);

  // In-memory or console logging in dev
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log(`[Atlas.AI Analytics] ${name} (${timestamp}):`, cleanProps);
  }

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const userId = user?.id ?? null;

    // 1. PostHog Capture
    const ph = getPostHogClient();
    if (ph) {
      try {
        if (userId) {
          ph.identify(userId);
        }
        ph.capture(name, {
          ...cleanProps,
          $time: timestamp,
        });
      } catch (phErr) {
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.warn('[Analytics] PostHog capture failed:', phErr);
        }
      }
    }

    // 2. Record locally in sessionStorage for test / debug inspection
    if (typeof window !== 'undefined' && window.sessionStorage) {
      try {
        const existing = JSON.parse(
          window.sessionStorage.getItem('__atlas_events__') || '[]',
        );
        existing.push({ name, properties: cleanProps, userId, timestamp });
        window.sessionStorage.setItem('__atlas_events__', JSON.stringify(existing));
      } catch {
        // ignore
      }
    }

    // 3. Supabase events table sync
    if (userId) {
      const { error } = await supabase.from('events').insert([
        {
          user_id: userId,
          name,
          properties: cleanProps as any,
        },
      ]);
      if (error && typeof __DEV__ !== 'undefined' && __DEV__) {
        console.warn(`[Atlas.AI Analytics] Failed to insert event ${name}:`, error);
      }
    }
  } catch (err) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn(`[Atlas.AI Analytics] Error tracking event ${name}:`, err);
    }
  }
}

/**
 * Anonymizes and resets analytics identification (e.g. on logout or account deletion)
 * to comply with GDPR & DPDP privacy requirements.
 */
export async function resetAnalytics(): Promise<void> {
  try {
    const ph = getPostHogClient();
    if (ph) {
      ph.reset();
    }
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.removeItem('__atlas_events__');
    }
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log('[Atlas.AI Analytics] Analytics identity reset & anonymized.');
    }
  } catch (err) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('[Atlas.AI Analytics] Error resetting analytics:', err);
    }
  }
}
