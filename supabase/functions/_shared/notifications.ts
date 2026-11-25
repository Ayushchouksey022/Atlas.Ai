import type { SupabaseClient } from '@supabase/supabase-js';

export interface PushNotificationPayload {
  to: string; // Expo push token (ExponentPushToken[xxx])
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  priority?: 'default' | 'normal' | 'high';
}

export interface NotificationDispatchResult {
  dispatched: number;
  skippedOptOut: number;
  skippedNoToken: number;
  errors: number;
}

/**
 * Dispatches push notifications for high-impact verdicts (score >= 8) only.
 * Respects user opt-out (profiles.notify_high_impact = false).
 * Enforces PRD Section 14 and Prompt 16 requirements.
 */
export async function dispatchHighImpactVerdictNotification(
  supabase: SupabaseClient,
  options: {
    newsItemId: string;
    newsTitle: string;
    impactScore: number;
    verdictType: 'shield' | 'injection' | 'override';
    targetUserIds: string[];
    affectedToolName?: string;
  },
): Promise<NotificationDispatchResult> {
  const result: NotificationDispatchResult = {
    dispatched: 0,
    skippedOptOut: 0,
    skippedNoToken: 0,
    errors: 0,
  };

  // Rule: Push notifications ONLY for high-impact verdicts (impact_score >= 8)
  if (options.impactScore < 8) {
    return result;
  }

  // Shield verdicts don't mutate roadmap, so skip unless user explicitly asks
  if (options.verdictType === 'shield') {
    return result;
  }

  if (!options.targetUserIds || options.targetUserIds.length === 0) {
    return result;
  }

  try {
    // 1. Fetch user preferences and push tokens
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, push_token, notify_high_impact')
      .in('id', options.targetUserIds);

    if (error || !profiles) {
      console.warn('[notifications] Could not fetch profiles for push notification:', error);
      return result;
    }

    const messages: PushNotificationPayload[] = [];

    for (const p of profiles) {
      // User opt-out check: default true, but if false, skip
      if (p.notify_high_impact === false) {
        result.skippedOptOut++;
        continue;
      }

      if (!p.push_token) {
        result.skippedNoToken++;
        continue;
      }

      const verdictLabel =
        options.verdictType === 'override'
          ? 'Critical Tool Superseded'
          : 'High-Impact Skill Available';

      const bodyText = options.affectedToolName
        ? `Impact ${options.impactScore}/10: ${options.newsTitle} affects ${options.affectedToolName}. Tap to view your Red Button verdict.`
        : `Impact ${options.impactScore}/10: ${options.newsTitle}. Tap to review changes to your learning roadmap.`;

      messages.push({
        to: p.push_token,
        title: `🚨 ${verdictLabel}`,
        body: bodyText,
        sound: 'default',
        priority: 'high',
        data: {
          newsItemId: options.newsItemId,
          verdictType: options.verdictType,
          impactScore: options.impactScore,
        },
      });
    }

    if (messages.length === 0) {
      return result;
    }

    // 2. Send via Expo Push Notifications API
    const expoAccessToken = process.env.EXPO_ACCESS_TOKEN;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (expoAccessToken) {
      headers['Authorization'] = `Bearer ${expoAccessToken}`;
    }

    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers,
      body: JSON.stringify(messages),
    });

    if (res.ok) {
      result.dispatched = messages.length;
    } else {
      console.warn('[notifications] Expo push service returned error status:', res.status);
      result.errors = messages.length;
    }
  } catch (err) {
    console.warn('[notifications] Failed to dispatch push notifications:', err);
    result.errors++;
  }

  return result;
}
