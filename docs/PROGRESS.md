# Project Progress & Handoff

## Completed

### Prompt 0: Project Setup and Scaffolding

- **Monorepo Setup:**
  - Initialized `pnpm-workspace.yaml` configuring `apps/*` and `packages/*`.
  - Configured root `.npmrc` with `shamefully-hoist=true`, `strict-peer-dependencies=false`, and suppressed verbose peer-dependency warnings.
  - Approved build scripts for native modules (`@parcel/watcher`, `esbuild`) in `pnpm-workspace.yaml`.
- **Packages Created:**
  - `/packages/graph`: Pure TypeScript library with `tsconfig.json`, `package.json` (`@repo/graph`), exported function `isGraphValid`, and passing Vitest test.
  - `/packages/schemas`: Shared Zod schemas with `tsconfig.json`, `package.json` (`@repo/schemas`), exported `DummySchema` & `validateDummy`, and passing Vitest test.
  - `/packages/llm`: LLM provider interface and types with `tsconfig.json`, `package.json` (`@repo/llm`), dependency on `@repo/schemas`, exported `getLLMProviderInfo`, and passing Vitest test.
- **Expo App (`/apps/mobile-web`):**
  - Scaffolded using latest stable Expo SDK 58 (`~58.0.26`), React 19.3.0, React Native 0.88.1.
  - Installed native dependencies matching SDK 58: `expo-router`, `react-native-web`, `react-dom`, `@expo/metro-runtime`, `react-native-gesture-handler`, `react-native-reanimated`, `@shopify/react-native-skia`, `expo-haptics`, `expo-secure-store`, `react-native-screens`, `react-native-safe-area-context`.
  - Installed client libraries: `@supabase/supabase-js`, `@tanstack/react-query`, `zustand`, `zod`, `posthog-react-native`.
  - Configured Metro monorepo resolution in `metro.config.js`.
  - Configured TypeScript project references and path aliases (`@repo/graph`, `@repo/schemas`, `@repo/llm`) in `tsconfig.json`.
  - Implemented Expo Router tab navigation with root `app/_layout.tsx`, tabs layout `app/(tabs)/_layout.tsx`, Feed screen `app/(tabs)/index.tsx`, and Roadmap screen `app/(tabs)/roadmap.tsx`. Verified package imports in the Feed tab.
- **Root Tooling & Verification:**
  - TypeScript strict mode with project references at root `tsconfig.json`.
  - ESLint 9+ flat configuration (`eslint.config.mjs`) and Prettier (`.prettierrc`, `.prettierignore`).
  - Vitest test runner with workspace path aliases (`vitest.config.mts`).
  - Dev dependencies installed: `typescript`, `eslint`, `prettier`, `vitest`, `jest-expo`, `@testing-library/react-native`, `@playwright/test`, `tsx`, `supabase`.
  - Verified `pnpm install`, `pnpm typecheck`, `pnpm lint`, and `pnpm test` (all 3 packages pass).
  - Verified `pnpm web` builds and renders the two placeholder tabs ("Feed" and "Roadmap").
- **Supabase Local Setup:**
  - Initialized `supabase init` inside `/supabase` generating `config.toml`.
  - Created placeholder READMEs in `/supabase/migrations` and `/supabase/functions`.
  - Noted Docker container startup deferred until Docker daemon is active.
- **Environment Configuration & Documentation:**
  - Created `/.env.example` documenting all variables from PRD Appendix C.
  - Created `/apps/mobile-web/.env.example` documenting client-side `EXPO_PUBLIC_` variables.
  - Added secret and build ignores to `/.gitignore`.
  - Documented setup instructions in root `/README.md` and architectural choices in `/docs/decisions.md`.

---

## Next

### Prompt 1: Database schema, migrations, and row-level security

- Read `/docs/PRD.md` Sections 5, 7, and 14, and `/docs/PROGRESS.md`.
- Create versioned SQL migrations in `/supabase/migrations` for the full PRD Section 7 data model:
  - `domains`
  - `canonical_nodes`
  - `canonical_edges`
  - `node_supersedes`
  - `profiles`
  - `user_nodes`
  - `news_sources`
  - `news_items`
  - `verdicts`
  - `user_verdicts`
  - `guides`
  - `proposed_graph_changes`
  - `sponsored_placements`
  - `usage_counters`
  - `events`
- Implement constraints, indexes, `updated_at` triggers, and check constraints (exactly 3 bullets, impact_score 1-10, status enums).
- Add constraints preventing hard-deleting `user_nodes` with status `completed` or `archived`. Document safe account deletion cascade.
- Create `editor` role / `is_editor()` helper.
- Enable Row Level Security (RLS) policies on every table.
- Enable Supabase Realtime publication on `user_nodes`, `profiles`, and `user_verdicts`.
- Insert initial domain row (`ai-assisted-software-development`) via seed file.
- Write RLS isolation tests.
- Generate and export TypeScript database types into `/packages/schemas`.
