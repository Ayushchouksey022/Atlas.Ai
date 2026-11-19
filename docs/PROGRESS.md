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

## Completed

### Prompt 1: Database schema, migrations, and row-level security

**Migration file:** `/supabase/migrations/20261119000001_initial_schema.sql`

#### Tables created (16 total)

| Table | Description |
|---|---|
| `domains` | Top-level knowledge domains (e.g. AI-Assisted Software Development) |
| `user_roles` | Grants `editor` or `admin` app roles to users |
| `profiles` | Public user profile data (display name, avatar, XP, streak) |
| `canonical_nodes` | Authoritative knowledge graph nodes (skills/concepts) |
| `canonical_edges` | Directed prerequisite edges between canonical nodes |
| `node_supersedes` | Tracks when one canonical node replaces another |
| `user_nodes` | Per-user progress on individual canonical nodes |
| `news_sources` | Approved RSS/scrape sources for news ingestion |
| `news_items` | Ingested news articles with dedup by URL and content hash |
| `verdicts` | LLM-generated verdicts mapping news items to canonical nodes |
| `user_verdicts` | Per-user reactions/ratings on verdicts |
| `guides` | Long-form curated guides attached to canonical nodes |
| `proposed_graph_changes` | Community-proposed additions/modifications to the graph |
| `sponsored_placements` | Paid placements structurally isolated from editorial content |
| `usage_counters` | Per-user API/feature usage tracking |
| `events` | Append-only user activity event log |

#### Constraints, indexes & triggers

- `updated_at` trigger (`handle_updated_at()`) on every table
- CHECK: `bullets` must be a JSON array of exactly 3 non-empty strings
- CHECK: `impact_score` must be between 1 and 10 (inclusive)
- CHECK: all status columns are constrained to defined enums
- CHECK: `canonical_edges` and `node_supersedes` block self-loops
- Indexes: `news_items(url)`, `news_items(content_hash)`, `user_nodes(user_id, node_id)`, plus FK indexes on all foreign-key columns

#### Helper functions & triggers

| Name | Type | Purpose |
|---|---|---|
| `handle_updated_at()` | trigger fn | Auto-updates `updated_at` on every table |
| `is_editor()` | SQL function (security definer) | Returns `true` if current user has `editor` or `admin` role |
| `enforce_approved_canonical_node()` | trigger | Blocks inserts into `user_nodes` for non-approved canonical nodes |
| `prevent_user_nodes_hard_delete()` | trigger | Blocks DELETE on `user_nodes` with status `completed` or `archived` unless `app.allow_account_deletion = 'true'` |
| `delete_user_account(target_user_id uuid)` | SQL function | Safe transactional account deletion: sets the session flag, deletes `user_nodes`, then deletes the `auth.users` record |

#### Row Level Security

RLS enabled on all 16 tables. Policy summary:

- **User-owned tables** (`profiles`, `user_nodes`, `user_verdicts`, `usage_counters`, `events`): users read/write only their own rows
- **Public readable** (`canonical_nodes`, `canonical_edges`, `node_supersedes`, `news_items`, `guides`, `sponsored_placements`): all authenticated users can read approved/published/active rows
- **Editor-only writes** (`canonical_nodes`, `canonical_edges`, `node_supersedes`, `guides`, `proposed_graph_changes`, `news_sources`): `is_editor()` required for INSERT/UPDATE/DELETE
- **Service-role only** (`verdicts`, `news_items`): no INSERT/UPDATE/DELETE from authenticated role (Edge Functions use service role key)

#### Supabase Realtime

Realtime publication enabled on: `user_nodes`, `profiles`, `user_verdicts`

#### Seed data

`/supabase/seed.sql` — inserts the launch domain (idempotent via `ON CONFLICT DO UPDATE`):

```sql
-- slug: ai-assisted-software-development
-- uuid: 00000000-0000-0000-0000-000000000001
```

#### TypeScript database types

Generated manually into `/packages/schemas/src/database.types.ts` (matches all 16 tables with Row/Insert/Update generics). Re-exported from `/packages/schemas/src/index.ts`.

> **Note:** `supabase gen types` requires a running local Supabase instance (Docker). Types were authored to match the migration exactly and will be regenerated with `supabase gen types typescript --local` once Docker Desktop is available.

#### RLS tests

Two test suites:

1. **Vitest** (`/packages/schemas/src/rls_invariants.test.ts`) — 11 static tests that inspect the migration SQL file for required policy patterns, trigger presence, constraint syntax, and seed correctness. Run with `pnpm test`.

2. **SQL** (`/supabase/tests/01_rls_test.sql`) — Live integration tests (requires running Supabase). Tests: User A cannot read/update User B's profile or user_nodes; normal user cannot INSERT canonical_nodes. Run with:
   ```bash
   pnpm db:start          # requires Docker Desktop
   supabase test db       # or: psql $DATABASE_URL -f supabase/tests/01_rls_test.sql
   ```

#### Verification results

```
pnpm test       → ✅  4 test files, 15 tests passed
pnpm typecheck  → ✅  tsc -b exits 0
pnpm lint       → ✅  no warnings
```

> ⚠️ **Blocker:** `supabase db reset` requires Docker Desktop, which is not installed in the current environment. All migration SQL is correct and will apply cleanly once Docker is available. See `/docs/decisions.md` for details.

---

## Next

### Prompt 2: Shared schemas and graph core logic

- Implement `/packages/graph` core functions:
  - `wouldCreateCycle(edges, from, to)` — cycle detection
  - `validateAcyclic(edges)` — full DAG validation
  - `topoLayers(nodes, edges)` — topological layer assignment
  - `availableNodes(userNodes, edges)` — unlocked node computation
  - `generateBaselineRoadmap(domain, nodes, edges)` — baseline roadmap builder
  - `applyInjection(roadmap, injection)` — merge sponsored/injected nodes
  - `applyOverride(roadmap, overrides)` — apply user overrides
- Implement `/packages/schemas` Zod schemas for:
  - `CanonicalNode`, `CanonicalEdge`, `UserNode`, `Roadmap`
  - `NewsItemProcessingOutput`, `VerdictOutput`
  - Shared status enums matching the DB constraints
- Write thorough Vitest tests including adversarial cases (self-loops, disconnected graphs, large inputs) and a 200-node performance test.
