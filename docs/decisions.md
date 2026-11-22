# Architectural & Implementation Decisions

## Decision Log

### 1. Monorepo Architecture & Package Management

- **Date:** 2026-11-19
- **Decision:** Use `pnpm` workspaces (`apps/*`, `packages/*`) with `shamefully-hoist=true` and `strict-peer-dependencies=false` in `.npmrc`.
- **Rationale:** Ensures clean separation between apps and packages while providing compatibility with Metro's module resolution for React Native and Expo.
- **pnpm v12 Build Scripts:** Approved lifecycle build scripts (`@parcel/watcher`, `esbuild`) via `pnpm approve-builds --all` in `pnpm-workspace.yaml`.

### 2. Expo SDK & React Native Version Alignment

- **Date:** 2026-11-19
- **Decision:** Use latest stable Expo SDK 58 (`~58.0.26`) with React 19.3.0 and React Native 0.88.1.
- **Rationale:** Pinned all native modules (`expo-router`, `react-native-web`, `@expo/metro-runtime`, `react-native-gesture-handler`, `react-native-reanimated`, `@shopify/react-native-skia`, `expo-haptics`, `expo-secure-store`, etc.) directly to the versions specified in `bundledNativeModules.json` for SDK 58.

### 3. Local Supabase Setup

- **Date:** 2026-11-19
- **Decision:** Initialize Supabase configuration (`config.toml`, `migrations/`, `functions/`) in `/supabase`.
- **Status on Docker:** Local Supabase containers are deferred because Docker Desktop daemon is not currently active in the execution sandbox environment. Noted for execution once Docker daemon is running (`pnpm db:start`).

### 4. TypeScript Project References and Path Aliases

- **Date:** 2026-11-19
- **Decision:** Use TypeScript project references and path aliases (`@repo/graph`, `@repo/schemas`, `@repo/llm`) pointing to `../../packages/*/src`.
- **Rationale:** Allows instant type-checking (`tsc -b`), fast test execution (`vitest run`), and direct Metro bundling in Expo without requiring intermediary build artifacts or precompilation steps.

### 5. Profile Creation on Signup: Database Trigger vs Client Call

- **Date:** 2026-11-22
- **Decision:** Implement profile creation via a database trigger (`on_auth_user_created` executing `public.handle_new_user()`) on `auth.users`, supplemented by client-side fallback query.
- **Rationale:**
  1. **Atomicity & Consistency:** A database trigger executes within the signup transaction. If the user creates an account, their `public.profiles` row is guaranteed to exist immediately with `onboarding_completed: false`.
  2. **Security & Tamper Resistance:** Client-side creation requires opening INSERT permissions on `public.profiles` to `authenticated` users without strict validation of initial fields, risking arbitrary client writes. A trigger runs as `security definer` with controlled defaults.
  3. **Fault Tolerance:** If a user closes the browser or loses network immediately after `supabase.auth.signUp()`, a client-side call could fail, leaving an orphaned auth user with no profile. The database trigger guarantees zero orphaned auth users.

### 6. Editorial Dashboard Architecture: Route Group in Mobile-Web vs Separate App

- **Date:** 2026-11-22
- **Decision:** Implement the Editorial Dashboard as an Expo Router route group `(editor)` within `/apps/mobile-web` rather than a standalone `/apps/editor` application.
- **Rationale:**
  1. **Unified Infrastructure & Tooling:** Eliminates redundant monorepo app scaffolding, separate Metro bundlers, duplicated build steps, and dual hosting pipelines.
  2. **Security & Access Control:** Enforces strict access control at both the route boundary (`(editor)/_layout.tsx` checks `user_roles.role = 'editor'`) and the database layer (Supabase RLS strictly rejects non-editor writes via `public.is_editor()`). Normal users cannot read or mutate editorial queues.
  3. **Code Reuse:** Directly leverages the shared Design System, `@repo/graph` cycle validation algorithms, `@repo/schemas` types, and TanStack Query cache.
  4. **Responsive Desktop-First Layout:** Designed for desktop web viewports with multi-column table layouts, side-by-side markdown editors, and diff modal reviews.
