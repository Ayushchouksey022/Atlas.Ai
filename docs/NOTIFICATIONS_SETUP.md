# Push Notifications Architecture & Credentials Setup

## Overview

Atlas.AI implements high-signal, anti-spam notifications following **PRD Section 14**:
- **Strict High-Impact Filter**: Push notifications are dispatched **ONLY** for verdicts with an **Impact Score $\ge 8$** that propose an actionable change (`injection` or `override`). Low/medium impact items and `shield` verdicts never trigger push notifications.
- **User Opt-Out**: Users can opt out at any time from their **Profile > Notifications & Alerts** screen (`notify_high_impact = false`), which is verified server-side prior to notification dispatch.

---

## Server-Side Implementation

- **Location**: `supabase/functions/_shared/notifications.ts`
- **Trigger**: Called by `precompute-verdicts` and `compute-verdict` after verdict computation.
- **Service**: Expo Push Notification Gateway (`https://exp.host/--/api/v2/push/send`).

---

## Credential Setup for Production

To activate real device push delivery on iOS (APNs) and Android (FCM), complete the following steps:

### 1. Expo Access Token (Server Secret)
1. Navigate to your [Expo Dashboard](https://expo.dev) > **Account Settings** > **Access Tokens**.
2. Create a new token with push notification permissions: `AtlasAI-Push-Worker`.
3. Set the environment variable in your Supabase project:
   ```bash
   supabase secrets set EXPO_ACCESS_TOKEN="your_expo_token_here"
   ```

### 2. Apple Push Notification Service (iOS APNs)
1. In your [Apple Developer Account](https://developer.apple.com/account), navigate to **Certificates, Identifiers & Profiles** > **Keys**.
2. Click **+** to generate a new key and enable **Apple Push Notifications service (APNs)**.
3. Download the `.p8` key file (take note of Key ID and Team ID).
4. Run `eas credentials` in the `/apps/mobile-web` directory and upload the `.p8` key when prompted.

### 3. Firebase Cloud Messaging (Android FCM v1)
1. In the [Firebase Console](https://console.firebase.google.com), create or open your Atlas.AI project.
2. Go to **Project Settings** > **Service accounts**.
3. Click **Generate new private key** to download the Firebase Admin SDK JSON.
4. Run `eas credentials` in `/apps/mobile-web` and upload the Google Services JSON key for Android Push Notifications.

---

## Testing Push Notifications Locally

When testing without production credentials:
1. The server code gracefully handles missing push tokens or missing credentials without throwing.
2. The `dispatchHighImpactVerdictNotification` helper returns a structured report (`dispatched`, `skippedOptOut`, `skippedNoToken`, `errors`).
3. You can verify opt-out behavior with unit tests simulating `notify_high_impact = false`.
