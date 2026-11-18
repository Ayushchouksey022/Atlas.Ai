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
