# Atlas.AI Closed Beta Release & Deployment Guide

This guide details the release workflow for Atlas.AI across **iOS TestFlight**, **Android Google Play Internal Testing**, and **Web (Vercel)**, along with credential requirements.

---

## 1. Web Deployment (Vercel)

The repository root includes a ready-to-use [`vercel.json`](file:///Users/ayushchouksey/Downloads/Atlas.AI/vercel.json).

### Steps:
1. Link your repository on [Vercel](https://vercel.com).
2. Configure project settings:
   - **Root Directory**: `.`
   - **Build Command**: `pnpm --filter @atlas/mobile-web run export:web`
   - **Output Directory**: `apps/mobile-web/dist`
3. Configure Environment Variables:
   - `EXPO_PUBLIC_SUPABASE_URL` = `https://<your-project-ref>.supabase.co`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY` = `<your-supabase-anon-key>`
   - `EXPO_PUBLIC_POSTHOG_API_KEY` = `<your-posthog-key>` (optional)
   - `EXPO_PUBLIC_POSTHOG_HOST` = `https://us.i.posthog.com`
4. Click **Deploy**. Vercel will export the static Expo web app and route all client paths to `/index.html`.

---

## 2. iOS TestFlight (EAS Build)

Atlas.AI uses Expo Application Services (EAS) configured in [`apps/mobile-web/eas.json`](file:///Users/ayushchouksey/Downloads/Atlas.AI/apps/mobile-web/eas.json).

### Prerequisites:
- Apple Developer Program membership ($99/year).
- EAS CLI installed: `npm install -g eas-cli`.

### Build & Submission Steps:
1. Change directory to `/apps/mobile-web`:
   ```bash
   cd apps/mobile-web
   eas login
   ```
2. Initialize project credentials:
   ```bash
   eas credentials
   ```
   Select **iOS** > **Production**. Allow EAS to automatically manage your:
   - Apple Distribution Certificate
   - App Store Provisioning Profile
   - Bundle Identifier (`com.atlasai.app`)
3. Trigger the cloud production build:
   ```bash
   eas build --platform ios --profile production
   ```
4. Submit to Apple TestFlight:
   ```bash
   eas submit --platform ios
   ```
5. In [App Store Connect](https://appstoreconnect.apple.com), navigate to **TestFlight** > **Internal Testing**, add your beta testers, and invite them.

---

## 3. Android Google Play Internal Testing

### Prerequisites:
- Google Play Developer Account ($25 one-time).

### Build & Submission Steps:
1. In `/apps/mobile-web`:
   ```bash
   eas build --platform android --profile production
   ```
   EAS will generate a production Android App Bundle (`.aab`) signed with an upload keystore.
2. Download the `.aab` file from your Expo dashboard.
3. In [Google Play Console](https://play.google.com/console):
   - Create a new app: **Atlas.AI**.
   - Navigate to **Testing** > **Internal testing**.
   - Create a new release and upload the `.aab`.
   - Add tester email addresses (closed beta cohort of up to 300 users).
   - Copy the shareable internal test link.

---

## 4. Closed Beta Invite Codes & User Cap

- **User Cap**: In accordance with PRD Milestone M6, registration is capped at **300 learners**.
- **Invite Gate**: New registrations require a valid, unredeemed invite code verified via `validate_beta_invite` RPC.
- **Starter Codes Seeded in Database**:
  - `ATLAS-FOUNDER-2026` (10 uses)
  - `AI-LEARNER-2026` (50 uses)
  - `BETA-INVITE-001` through `BETA-INVITE-005` (1 use each)
- **Generating More Codes**:
  Editors and admins can insert new codes directly in Supabase or via the Editorial Dashboard:
  ```sql
  insert into public.beta_invites (code, max_uses) values ('COMMUNITY-WAVE-1', 100);
  ```
