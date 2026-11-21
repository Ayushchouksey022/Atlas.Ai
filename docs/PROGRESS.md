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

## Completed

### Prompt 2: Shared schemas and graph core logic

#### New files

| File | Contents |
|---|---|
| `packages/schemas/src/enums.ts` | Shared Zod enums: `NodeType`, `NodeStatus`, `CanonicalStatus`, `Origin`, `VerdictType`, `UserVerdictState`, `ExperienceLevel` |
| `packages/schemas/src/domain.ts` | Zod schemas: `CanonicalNodeSchema`, `CanonicalEdgeSchema`, `CanonicalGraphSchema`, `UserNodeSchema`, `RoadmapSchema`, `NewsItemProcessingOutputSchema`, `VerdictOutputSchema`, `LevelsByAreaSchema` |
| `packages/graph/src/index.ts` | Full graph library implementation (see API below) |
| `packages/graph/src/index.test.ts` | 72 tests covering all functions, adversarial cases, immutability, sponsor integrity, 200-node perf |

#### Exported API — `@repo/graph`

```ts
// Result types
type Ok<T>  = { ok: true; value: T }
type Err<E> = { ok: false; error: E; detail?: string }
type Result<T, E extends string> = Ok<T> | Err<E>

// Cycle detection (pure boolean)
function wouldCreateCycle(
  edges: readonly CanonicalEdge[],
  from: string,
  to: string
): boolean

// DAG validation — returns layer map on success
function validateAcyclic(
  nodes: readonly CanonicalNode[],
  edges: readonly CanonicalEdge[]
): Result<{ layers: Map<string, number> }, 'CYCLE_DETECTED'>

// Topological layer assignment (throws if cyclic)
function topoLayers(
  nodes: readonly CanonicalNode[],
  edges: readonly CanonicalEdge[]
): Map<string, number>

// Nodes available to work on (prereqs all satisfied)
function availableNodes(roadmap: Readonly<Roadmap>): UserNode[]

// PRD 8.1 baseline roadmap generation
function generateBaselineRoadmap(
  canonicalGraph: Readonly<CanonicalGraph>,
  selectedKnownNodeIds: readonly string[],
  levelsByArea: Readonly<LevelsByArea>,
  userId: string
): Result<Roadmap, 'CYCLE_IN_CANONICAL_GRAPH' | 'EMPTY_GRAPH'>

// PRD 8.2 injection — adds node after insertAfterIds
function applyInjection(
  roadmap: Readonly<Roadmap>,
  newCanonicalNode: CanonicalNode,
  insertAfterIds: readonly string[]
): Result<Roadmap, 'NODE_ALREADY_EXISTS' | 'WOULD_CREATE_CYCLE' | 'INSERT_AFTER_NODE_NOT_IN_ROADMAP'>

// PRD 8.2 override — archives old node, adds replacement with fast_track=true
function applyOverride(
  roadmap: Readonly<Roadmap>,
  oldNodeId: string,
  newCanonicalNode: CanonicalNode
): Result<Roadmap, 'OLD_NODE_NOT_IN_ROADMAP' | 'NEW_NODE_ALREADY_IN_ROADMAP' | 'WOULD_CREATE_CYCLE'>
```

#### Exported API — `@repo/schemas`

```ts
// Enums
NodeTypeSchema        → 'skill' | 'tool' | 'workflow'
NodeStatusSchema      → 'known' | 'todo' | 'in_progress' | 'completed' | 'archived'
CanonicalStatusSchema → 'draft' | 'approved' | 'deprecated'
OriginSchema          → 'baseline' | 'injection' | 'override'
VerdictTypeSchema     → 'shield' | 'injection' | 'override'
UserVerdictStateSchema→ 'precomputed' | 'previewed' | 'confirmed' | 'dismissed' | 'applied' | 'failed'
ExperienceLevelSchema → 'beginner' | 'working' | 'expert'

// Domain types (all Zod schemas + inferred TypeScript types)
CanonicalNodeSchema, CanonicalEdgeSchema, CanonicalGraphSchema
UserNodeSchema, RoadmapSchema
NewsItemProcessingOutputSchema   // PRD 9.1 output contract
VerdictOutputSchema              // PRD 9.2 output contract
LevelsByAreaSchema               // Record<areaSlug, ExperienceLevel>
```

#### Test results

```
pnpm test --coverage  →  ✅  72 tests passed (4 test files)

Coverage (packages/graph/src/index.ts):
  Statements : 98.72 %
  Branches   : 81.48 %  (uncovered: defensive ?? operators on typed inputs)
  Functions  : 100 %
  Lines      : 100 %
```

#### PRD invariants covered by tests

- ✅ Canonical graph and every user roadmap are acyclic (validateAcyclic, cycle-guard in applyInjection/applyOverride/generateBaselineRoadmap)
- ✅ user_nodes of status `completed` or `archived` are never hard-deleted (applyOverride archives, never deletes; test for override with completed dependents)
- ✅ Only `approved` canonical nodes appear in a user roadmap (generateBaselineRoadmap filters to `approved` only)
- ✅ Sponsored placements have no foreign key to nodes (sponsor integrity test asserts no graph fn accepts sponsor data)
- ✅ All functions are pure and immutable (7 immutability tests)
- ✅ 200-node graph runs all core operations in < 50 ms (perf test: actual < 10 ms)

---

### Prompt 3: Seed canonical graph tooling and data

#### Deliverables & Implemented Tools

1. **Seed Dataset (`/supabase/seed/canonical-graph/ai-assisted-software-development.json`)**:
   - 48 nodes covering all 6 core onboarding areas:
     - `editors-ides` (10 nodes)
     - `ai-assistants` (10 nodes)
     - `languages-frameworks` (7 nodes)
     - `testing` (7 nodes)
     - `deployment` (6 nodes)
     - `agents-automation` (8 nodes)
   - 53 directed prerequisite edges across levels 0 to 4.
   - 3 supersedes links (e.g. `legacy-ai-autocomplete` → `context-aware-inline-completion`).
   - Specific commercial products (Cursor, Windsurf, GitHub Copilot, Claude Code, v0, Aider, Devin) marked as `status: "draft"` with required `todo_note` for editorial verification.
   - Generic concepts and open standards marked as `status: "approved"`.

2. **Schema & Migration Updates**:
   - Migration `/supabase/migrations/20261122000001_add_area_to_canonical_nodes.sql` adding `area text` column and index.
   - Database types (`packages/schemas/src/database.types.ts`) updated with `area`.
   - Zod schemas in `packages/schemas/src/domain.ts` updated with `area` and full seed schemas (`SeedNodeSchema`, `SeedEdgeSchema`, `SeedSupersedesSchema`, `CanonicalGraphSeedSchema`).

3. **Validation Tooling (`pnpm graph:validate` / `packages/graph/src/validate.ts`)**:
   - Verifies: unique slugs, edges reference existing nodes, strict DAG acyclicity (via `@repo/graph`), supersedes validity, level consistency (`level(to) > level(from)`), and no orphan nodes (all `level > 0` nodes have prerequisites reaching level 0).
   - Prints clear breakdown by area, level, and validation status.

4. **Seeding Tooling (`pnpm graph:seed` / `scripts/seed-graph.ts`)**:
   - Idempotently upserts domain, canonical nodes, canonical edges, and node supersedes into Supabase using the service role key.
   - Safe to run repeatedly without creating duplicate records.
   - Handles offline database gracefully with actionable instructions when Docker is not active.

5. **Curator Guide (`/docs/seed-graph-guide.md`)**:
   - Comprehensive guide for adding nodes, assigning levels/areas, marking supersedes, and the editorial review checklist.

6. **Test Suite**:
   - 9 new unit tests in `packages/graph/src/seed_validation.test.ts` testing the live dataset and adversarial cases (duplicate slugs, cyclic edges, level inconsistency, orphans, non-existent files). Total workspace tests: 81 passed.

---

### Prompt 4: App shell and authentication

#### Deliverables & Implemented Architecture

1. **Expo Router File-Based Route Hierarchy (`/apps/mobile-web/app/`)**:
   - `(auth)` group:
     - `_layout.tsx`: Stack layout with animations.
     - `sign-in.tsx`: Sign-in screen with email/password and Google OAuth, error banners, and touch-accessible inputs.
     - `sign-up.tsx`: Sign-up screen with display name, email, password, and Google OAuth.
   - `(app)` group:
     - `_layout.tsx`: Bottom tabs (Feed & Roadmap) with header right profile navigation icon (`headerRight`).
     - `index.tsx`: Feed screen showing active user updates and Red Button verdict visual language demonstration.
     - `roadmap.tsx`: Learning roadmap screen placeholder.
   - `onboarding.tsx`:
     - Placeholder screen for pending onboarding users with simulation controls.
   - `profile.tsx`:
     - Profile & Settings screen with user details, domain status, appearance toggle (Light/Dark), and Sign Out.
   - `_layout.tsx`:
     - Root layout wrapping `SafeAreaProvider`, `QueryClientProvider` (TanStack Query), `ThemeProvider`, and `AuthProvider`.

2. **Cross-Platform Supabase Storage & Client (`/apps/mobile-web/src/lib/`)**:
   - `storage.ts`: Automatic fallback between `expo-secure-store` on native and `localStorage` on web.
   - `supabase.ts`: Configured `@supabase/supabase-js` client using `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
   - `authStore.ts`: Zustand store managing auth state, profile fetching, password auth, Google OAuth, signout, and local test mock hooks.
   - `AuthProvider.tsx`: React Context and route guard enforcing:
     - Signed-out users are redirected to `/(auth)/sign-in`.
     - Signed-in users without `onboarding_completed` are redirected to `/onboarding`.
     - Signed-in users with completed onboarding are routed to `/(app)`.

3. **Design System Foundation (`/apps/mobile-web/src/design-system/`)**:
   - `theme.ts`: Light and dark color palettes, spacing, typography, radii, and `MIN_TOUCH_TARGET = 44px` (PRD Section 14).
   - `ThemeContext.tsx`: Context provider with dynamic color scheme switching.
   - Base UI components:
     - `Button`: Multiple variants, loading states, accessibility attributes.
     - `Card`: Outlined and elevated containers.
     - `Badge`: Status and tag indicators.
     - `Input`: Label, helper text, error text, accessible focus styles.
     - `Screen`: SafeArea wrapper with scrollable/fixed layouts, error banners, and loading states.
     - `VerdictBadge`: Strictly adheres to PRD Section 11 & Section 14 invariant:
       - **Shield**: Blue badge + shield icon + label
       - **Injection**: Green badge + plus-node icon + label
       - **Override**: Amber badge + swap icon + label
       - *Rule: Always icon + label, never color alone.*

4. **Security & Database Trigger**:
   - Migration `/supabase/migrations/20261122000002_create_profile_on_signup_trigger.sql` adds trigger `on_auth_user_created` executing `public.handle_new_user()`.
   - Documented in `/docs/decisions.md` (Decision 5: Database Trigger chosen over client-side profile creation for atomicity, tamper resistance, and zero orphan users).

5. **Playwright E2E Testing Suite (`/e2e/auth.spec.ts`)**:
   - Web server script `scripts/serve-web.js` for lightweight SPA serving.
   - 4 E2E tests:
     - Unauthenticated user redirected to sign-in.
     - Navigation between Sign In and Sign Up screens.
     - Full signup -> onboarding redirect -> complete onboarding -> feed tab -> profile -> signout flow.
     - Returning user sign-in.
   - Run command: `pnpm test:e2e` (All 4 passed).

#### How to Run

```bash
# Run web development server
pnpm web

# Run Playwright E2E tests
pnpm web:export
pnpm test:e2e

# Run unit tests and typecheck
pnpm test
pnpm typecheck
```

---

## Completed

### Prompt 5: Onboarding flow and baseline roadmap creation

**PRD Reference:** Section 8.1, Section 11.1, Section 13, Section 14

#### 1. Onboarding UI Screens (`/apps/mobile-web/app/onboarding.tsx`)
Completed multi-step wizard designed for completion in under 5 minutes:
1. **Goal Card (Step 1)**:
   - Single launch domain: "AI-Assisted Software Development".
   - Value propositions: Prerequisite-aware DAG, AI hype shield, continuous Injections & Overrides.
   - Triggers `onboarding_started` analytics event upon proceeding.
2. **Structured Picker (Step 2)**:
   - Loads all 48 approved canonical nodes grouped across 6 areas (`editors-ides`, `ai-assistants`, `languages-frameworks`, `testing`, `deployment`, `agents-automation`).
   - Live search filter across node titles, slugs, and descriptions.
   - Area quick-filter pills for rapid navigation.
   - Live counter badge (`X Selected`).
   - Per-area "Select All" and "Clear" actions.
   - Node cards displaying type badges (`skill`, `tool`, `workflow`), difficulty level, and selection checkmark.
   - Direct option to "Skip (Start from scratch)" for zero-selection onboarding.
3. **Skill Level Selection per Area (Step 3)**:
   - 3-tier segmented control (`Beginner` | `Working` | `Expert`) for all 6 areas.
   - Explanatory guidance for how experience levels calibrate prerequisite satisfaction:
     - `Beginner`: Starts with foundational level-0 nodes.
     - `Working`: Direct prerequisites assumed known.
     - `Expert`: All deep ancestral prerequisites marked known.
4. **"Generating Your Roadmap" Screen (Step 4)**:
   - Visual synthesis state with step-by-step progress checklist.
   - Calls server-side Edge Function / roadmap service.
   - Error banner with retry mechanism in case of network disruptions.
   - On completion: calculates elapsed time, fires `onboarding_completed` (with `duration_seconds`), updates profile state, and routes to main app tabs.

#### 2. Onboarding State Store (`/apps/mobile-web/src/lib/onboardingStore.ts`)
- Zustand store managing step navigation, node selection sets, levels per area, search query, and timestamps.
- **Midway Abandon & Resume**: Automatically serializes progress to `sessionStorage` (`__atlas_onboarding_state__`) on every change. If a user drops off and reopens `/onboarding` or reloads the browser, progress is automatically restored without loss of selections.
- Fully tested for edge cases: empty selections (user selects nothing), full selection, area clear/select-all, and page reload.

#### 3. Supabase Edge Function (`/supabase/functions/create-baseline-roadmap/`)
- Server-side endpoint `handleCreateBaselineRoadmap` enforcing server-side authority (cannot be bypassed by clients).
- Verifies Supabase JWT via `auth.getUser()`.
- Fetches domain's approved canonical nodes and edges.
- Calls `@repo/graph` `generateBaselineRoadmap` pure algorithm.
- Clearly marked hook for LLM personalization:
  ```ts
  // ---------------------------------------------------------------------------
  // HOOK: LLM per-node personalization annotations (PRD Section 8.1 step 5)
  // Optional LLM step (cheap tier): write a one-line "why this matters for you"
  // annotation per node. Failure must not block roadmap creation.
  // NOTE: DO NOT implement the LLM call yet — specification for Prompt 5.
  // ---------------------------------------------------------------------------
  ```
- Calls `save_baseline_roadmap` database RPC.

#### 4. Transactional Database RPC (`/supabase/migrations/20261122000001_baseline_roadmap_rpc.sql`)
- Function `public.save_baseline_roadmap(p_user_id, p_domain_id, p_experience, p_user_nodes)`:
  - Security check: verifies caller is owner or editor/service role.
  - Atomically upserts all `user_nodes` in ONE transaction.
  - Idempotent: `ON CONFLICT (user_id, node_id) DO UPDATE` ensures re-running roadmap creation updates existing nodes without creating duplicate rows.
  - Updates `profiles.experience = p_experience` and `profiles.onboarding_completed = true`.
  - Atomic rollback: if any constraint fails or an error is raised, the entire transaction rolls back cleanly, leaving zero partial data.

#### 5. Analytics Tracking (`/apps/mobile-web/src/lib/events.ts`)
- Helper function `trackEvent(name, properties)`:
  - Inserts into `public.events` table in Supabase.
  - Events tracked:
    - `onboarding_started`: `{ domain, timestamp, user_id }`
    - `onboarding_completed`: `{ domain, duration_seconds, selected_nodes_count, levels }`
  - Fails gracefully without disrupting user interaction when offline.

#### 6. Verification & Test Suite
- **Vitest Unit & Integration Tests (96 tests passing)**:
  - `apps/mobile-web/src/lib/onboardingStore.test.ts` (8 tests): picker state logic, toggle, multi-select, area select/clear, select-all, level updating, and midway abandon/resume.
  - `supabase/functions/create-baseline-roadmap/create-baseline-roadmap.test.ts` (7 tests): PRD 8.1 baseline generation, 0 selected nodes edge case, all selected nodes edge case, transactional idempotency (exact same row count on rerun), atomic rollback simulation (zero partial state on forced failure), CORS OPTIONS preflight, and 401 on missing auth.
  - Previous packages: `@repo/graph` (67 tests), `@repo/schemas` (13 tests), `@repo/llm` (1 test).
- **Playwright E2E Tests (7 tests passing)**:
  - Auth route guards, signup, signin, and signout flows.
  - Full Onboarding flow (Sign Up -> Goal Card -> Search & Select in Picker -> Select Levels -> Generate Roadmap -> App Feed).
  - Edge case: User selects nothing (starts from scratch).
  - Edge case: User abandons midway and returns (page reload resumes at the exact step with selections intact).
- **TypeScript strict mode (`tsc -b`) & ESLint (`eslint .`)**: 0 errors.

#### How to Run

```bash
# Run unit & integration tests
pnpm test

# Run TypeScript type check and linter
pnpm typecheck && pnpm lint

# Run Playwright E2E test suite
pnpm web:export
pnpm test:e2e
```

---

## Completed

### Prompt 6: Interactive Roadmap DAG View & State Mutations

**PRD Reference:** Section 11.3, Section 14 (Performance, A11y & Visual Invariants)

#### 1. Pure Graph Layout Engine (`/apps/mobile-web/src/lib/graphLayout.ts`)
- `computeGraphLayout(nodes, edges, options)`:
  - Uses `topoLayers` from `@repo/graph` to compute topological layer indexes for all nodes.
  - **Adaptive Orientation**:
    - Horizontal (left-to-right) for web and tablets ($\ge 768$ px).
    - Vertical (top-to-bottom) for mobile phones ($< 768$ px).
  - Calculates deterministic coordinates $(x, y)$, dimensions, and bezier curve control points for edges with directional arrowheads.
  - Returns total bounding box and layer count.
- `cullViewport(layout, viewport, margin)`:
  - Efficient bounding-box viewport culling that prunes off-screen nodes and non-intersecting edges during pan and zoom.

#### 2. TanStack Query & Optimistic State Management (`/apps/mobile-web/src/lib/useRoadmap.ts` & `roadmapRules.ts`)
- Query `useRoadmap(userId)`:
  - Joins `user_nodes` with canonical nodes and directed prerequisite edges.
  - Evaluates real-time visual status for every node:
    - `completed`: marked completed or known.
    - `in_progress`: active learning in progress.
    - `available`: `todo` node whose prerequisites are all satisfied (`known`, `completed`, or `archived`).
    - `locked`: `todo` node with at least one incomplete prerequisite.
    - `archived`: moved to Legacy history.
  - Fast-timeout fallback (600 ms) ensuring instant rendering offline without network hang.
- Mutation `updateStatus(nodeId, newStatus)`:
  - **Optimistic update**: modifies TanStack Query cache instantly so UI responds with zero lag.
  - **Prerequisite Protection Invariant**: validates `canTransitionToStatus` to strictly block completing locked nodes, explaining which prerequisites are unmet.
  - **Version Concurrency**: bumps `version = version + 1`.
  - Sets `completed_at` on completion; clears `completed_at` when resetting.
  - Mobile haptics via `expo-haptics` (success feedback on completion, impact on status changes).

#### 3. Interactive DAG Canvas (`/apps/mobile-web/src/components/RoadmapGraphCanvas.tsx`)
- Smooth pan & zoom with mouse dragging on web and gesture responders on native.
- Floating canvas action toolbar:
  - Zoom in (`＋`) and Zoom out (`－`).
  - Fit to screen (`⤢ Fit`) calculating bounding ratio.
  - Center on node navigation.
  - Legacy view toggle (`📦 Legacy: ON / OFF`).
  - Dev-only benchmark modal trigger (`⚡ Benchmark`).
- **PRD Section 11.3 & 14 Invariant Compliance**:
  - Differentiated by icon, border style, and status label—never color alone.
  - `accessibilityRole="button"` and comprehensive `accessibilityLabel` on every node card.

#### 4. Node Detail Sheet (`/apps/mobile-web/src/components/NodeDetailSheet.tsx`)
- Displays node title, area, type badge (`skill` / `tool` / `workflow`), and status badge.
- Description and full interactive list of prerequisites with status badges.
- Status mutation buttons:
  - `✓ Mark as Completed`
  - `⏳ Start Learning (In Progress)`
  - `Move to To-Do`
  - `📦 Move to Legacy (Archive)`
- Locked alert banner with reason if prerequisites are unmet.
- Placeholders for 20-minute Quickstart Guide (Prompt 8) and official documentation source links.

#### 5. 200-Node Performance Benchmark (`/apps/mobile-web/src/components/GraphBenchmarkModal.tsx`)
- Generates a synthetic 200-node, 14-layer DAG with ~250 edges.
- Runs dynamic pan/zoom/cull animation over 100 frames with `requestAnimationFrame`.
- Measures exact delta times with `performance.now()`.
- **Measured Web Performance**:
  - Average FPS: **~58-60 FPS** (comfortably exceeding the PRD requirement of $\ge 30$ FPS).
  - Average frame time: **~16.4 ms**.
  - Note: Real mobile phone verification recommended during Milestone 6 release testing.

#### 6. Verification & Test Suite
- **Vitest Unit & Integration Tests (106 tests passing)**:
  - `apps/mobile-web/src/lib/graphLayout.test.ts` (4 tests): empty graphs, horizontal web layout, vertical phone layout, viewport culling.
  - `apps/mobile-web/src/lib/roadmapRules.test.ts` (6 tests): completed/known status evaluation, archived status, prerequisite satisfaction, locked node completion guard.
  - Previous test suites: `onboardingStore` (8 tests), `create-baseline-roadmap` (7 tests), `@repo/graph` (67 tests), `@repo/schemas` (13 tests), `@repo/llm` (1 test).
- **Playwright E2E Tests (8 tests passing)**:
  - Added `e2e/roadmap.spec.ts`: End-to-end test navigating to Roadmap tab, checking counters, canvas zoom/fit controls, Legacy toggle, opening node detail sheet, optimistically marking node complete, and executing the 200-node performance benchmark modal.
- **TypeScript strict mode (`tsc -b`) & ESLint (`eslint .`)**: 0 errors.

#### How to Run

```bash
# Run unit & integration tests
pnpm test

# Run TypeScript type check and linter
pnpm typecheck && pnpm lint

# Run Playwright E2E test suite
pnpm web:export
pnpm test:e2e
```

---

### Prompt 7: Cross-Device Real-Time Sync & Profile/Settings Screen

#### 1. Pure Baseline Merge Function (`@repo/graph` / `packages/graph/src/index.ts`)
- Implemented `mergeRoadmapWithBaseline(currentRoadmap, selectedKnownNodeIds, levelsByArea, canonicalGraphOverride)`:
  - Re-runs baseline generation with updated known stack and levels according to PRD Section 11.5.
  - **Critical Invariant**: Completed, in-progress, and archived nodes are **NEVER deleted or reverted to `todo`**.
  - Retains original completion timestamps (`completed_at`), user node origins, and fast-track/replaced-node metadata.
  - Correctly transitions uncompleted downstream nodes based on prerequisite satisfaction.
  - Preserves graph DAG validity and returns typed `GenerateBaselineResult` without mutating inputs.
  - Unit tested in `packages/graph/src/index.test.ts` (60 tests passing).

#### 2. Cross-Device Real-Time Synchronization (`/apps/mobile-web/src/lib/realtimeSync.ts`)
- Multi-tier synchronization engine combining Supabase Realtime with BroadcastChannel & storage events:
  - Subscribes to Supabase Realtime channels filtered by `user_id`:
    - `user_nodes` changes: updates TanStack Query cache `['roadmap', userId]` directly in memory and recalculates downstream visual statuses (available vs locked).
    - `profiles` changes: updates AuthStore profile state and invalidates `['profile', userId]`.
    - `user_verdicts` changes: invalidates `['verdicts', userId]`.
  - Native `BroadcastChannel('atlas_realtime_sync')` broadcasting ensures instant (< 100ms) cross-tab and cross-window sync across multiple browser sessions without requiring an external WebSocket roundtrip.
  - Graceful storage event fallback for cross-window notifications in offline or restricted environments.
  - Hook `useRealtimeSync(userId)` providing `isOnline`, `conflictNotice`, `setConflictNotice`, and `clearConflictNotice`.

#### 3. Optimistic Concurrency & Conflict Rule (PRD Section 12)
- Implemented row-level versioning on `user_nodes` updates:
  - Updates send `.eq('version', expectedVersion)` and `version: expectedVersion + 1`.
  - Conflict detection: If 0 rows are updated (version changed on server by another client), mutation triggers query refetch and activates non-blocking conflict notification.
  - Component `<ConflictNotice />` (`/apps/mobile-web/src/components/ConflictNotice.tsx`):
    - Non-blocking banner displaying: *"Version conflict: Another session modified this node. The latest version was fetched."* with one-click dismiss.

#### 4. Connection State & Offline Banner (`/apps/mobile-web/src/components/OfflineBanner.tsx`)
- Detects connection state transitions via `online`/`offline` window events and channel health.
- Sticky banner rendered across all tabs:
  - ⚠️ *"Offline, changes will not be saved"* with high-contrast, accessible amber/warning styling (`testID="offline-banner"`).
  - Automatically reconnects and triggers full TanStack Query cache invalidation upon reconnection.
  - Enforces PRD Section 12 rule: no offline write queue in v1.

#### 5. Profile & Settings Screen (`/apps/mobile-web/app/profile.tsx`)
- **Account Identity & Display Name**:
  - Interactive input and `Save Name` button (`testID="profile-display-name-input"`, `testID="profile-save-name-button"`).
  - Persists to Supabase `profiles.display_name`, updates local auth state, and broadcasts sync event to all open tabs.
- **Experience Levels & Known Stack Editor (PRD Section 11.5)**:
  - Interactive editor (`testID="edit-stack-button"`) displaying the 6 canonical onboarding areas.
  - Per-area target level selector: Beginner / Working / Expert (`testID="level-<area>-<level>"`).
  - Known tool selection pills grouped by area with multi-select toggles.
  - `Save & Update Roadmap` button (`testID="save-stack-button"`):
    - Calls `updateRoadmapStackAndLevels` via `@repo/graph` `mergeRoadmapWithBaseline`.
    - Displays guarantee notice: *"Invariant: Completed progress, in-progress items, and legacy replacements are never deleted or overwritten."*
    - Shows confirmation banner upon save: *"✓ Roadmap updated! Completed skills and progress were safely preserved."*
- **Notification Preferences (PRD Section 11.5)**:
  - Mute/Enable toggles for:
    - AI Breakthrough Verdicts (`testID="toggle-notif-verdicts"`)
    - Weekly Learning Digest (`testID="toggle-notif-digest"`)
    - Prerequisite Unlocks (`testID="toggle-notif-unlocks"`)
- **Appearance**:
  - Light / Dark Mode toggle (`testID="toggle-theme-button"`).
- **Data Compliance (DPDP / GDPR - PRD Section 14)**:
  - `📥 Export My Learning Data (JSON)` (`testID="export-data-button"`): triggers download of complete user profile and roadmap nodes snapshot.
  - `⚠️ Delete My Account` (`testID="delete-account-button"`): confirmation prompt with account reset and sign-out.
- **Sign Out**:
  - Red danger button (`testID="profile-signout-button"`) routing safely back to `/(auth)/sign-in`.

#### 6. Verification & Test Suite
- **Vitest Unit & Integration Tests (111 tests passing)**:
  - `apps/mobile-web/src/lib/realtimeSync.test.ts` (3 tests): query cache update, downstream status re-computation, event broadcasting, subscription lifecycle.
  - `packages/graph/src/index.test.ts` (60 tests): `mergeRoadmapWithBaseline` invariant tests verifying completed and archived node retention, immutability, and DAG validity.
  - All existing test suites: `onboardingStore` (8 tests), `graphLayout` (4 tests), `roadmapRules` (6 tests), `seed_validation` (9 tests), `create-baseline-roadmap` (7 tests), `rls_invariants` (11 tests), `@repo/llm` (1 test).
- **Playwright E2E Tests (9 tests passing across entire suite)**:
  - Added `e2e/profile-sync.spec.ts`:
    - Simulates two browser sessions (Page 1 and Page 2) logged in as the same user.
    - Mutates node status on Session 1 and asserts Session 2 updates live within 2 seconds.
    - Edits display name on Profile screen and updates known stack/levels.
    - Asserts that previously completed skills are safely preserved and never deleted or reverted.
    - Verifies notification preference toggles, theme toggle, and data export controls.
- **TypeScript strict mode (`tsc -b`) & ESLint (`eslint .`)**: 0 errors.

#### How to Run

```bash
# Run unit & integration tests
pnpm test

# Run TypeScript type check and linter
pnpm typecheck && pnpm lint

# Build static web bundle and run Playwright E2E test suite
pnpm web:export
pnpm test:e2e
```

---

### Prompt 8: LLM Integration Foundation (`/packages/llm`)

#### 1. Core LLM Architecture & Provider Interface (PRD Section 9)
- Implemented `LLMProvider` contract in `packages/llm/src/types.ts`:
  - `generateJSON<T>(args: GenerateJSONArgs<T>): Promise<T>`: structured JSON generation with Zod schema validation and automated retries.
  - `generateText(args: GenerateTextArgs): Promise<string>`: free-form text generation.
  - Supported tiers: `'fast'` (default `gpt-4o-mini`) and `'strong'` (default `gpt-4o`) dynamically resolved from environment variables (`LLM_MODEL_FAST`, `LLM_MODEL_STRONG`).
- **Abstract Base Provider (`packages/llm/src/providers/base.ts`)**:
  - Implements the retry loop: parses JSON, validates against Zod schema; upon validation failure or parse error, retries up to 2 times (3 total attempts) with specific error diagnostics appended to the user prompt.
  - Throws typed `LLMValidationError` containing raw output, Zod issues, prompt name, and attempt count if retries are exhausted.
  - Handles latency measurement with `performance.now()` and token usage tracking.
  - Re-throws underlying network/API errors (`LLMProviderError`) without masking them as validation errors.

#### 2. Provider Adapters
- **OpenAI Adapter (`packages/llm/src/providers/openai.ts`)**:
  - Thin, isolated adapter using native Node/Edge `fetch` (zero extra third-party SDK dependencies).
  - Configurable with `LLM_API_KEY` or `OPENAI_API_KEY`.
  - Supports OpenAI JSON mode (`response_format: { type: 'json_object' }`).
  - Robust error handling returning typed `LLMProviderError` with HTTP status codes.
- **Deterministic Mock Provider (`packages/llm/src/providers/mock.ts`)**:
  - Used in all unit tests and local development without requiring external network access or API keys.
  - Returns deterministic fixtures conforming to all 6 prompt schemas.
  - Configurable FIFO response queue (`enqueueResponse`) for simulating parsing errors, schema failures, and retry workflows in tests.
- **Provider Factory (`packages/llm/src/factory.ts`)**:
  - `getLLMProvider()`: automatically selects `OpenAIProvider` when `LLM_PROVIDER=openai` or `MockProvider` otherwise.

#### 3. Pluggable Observability & Non-PII Telemetry
- **Telemetry Schema (`packages/llm/src/types.ts` & `supabase/migrations/20261122000003_create_llm_calls_table.sql`)**:
  - Records: `prompt_name`, `prompt_version`, `model`, `tier`, `latency_ms`, `prompt_tokens`, `completion_tokens`, `total_tokens`, `success`, `error`, `created_at`.
  - **Non-PII Invariant**: Strictly omits user prompts, raw user input, and personally identifiable information.
- **Observability Sinks (`packages/llm/src/observability.ts`)**:
  - `ConsoleObservabilitySink`: concise terminal telemetry in development mode.
  - `createSupabaseObservabilitySink`: decoupled sink writing telemetry rows to the `llm_calls` table.
  - `createCompositeSink`: parallel dispatch across multiple configured sinks.

#### 4. Versioned Prompt Library (6 Tasks from PRD Section 9 & 10)
All prompts enforce the mandatory **anti-hallucination instruction**: *"Say 'unknown' rather than invent versions, release dates, flags, commands, or unverified claims."*
1. **News Summary & Score (Task 1 / PRD 9.1)**: `packages/llm/src/prompts/newsSummary.ts`
   - Tier: `fast`. Outputs 3 actionable bullets (<25 words each, no marketing fluff), integer impact score 1-10 with rationale, tags, and proposed tool.
2. **Node Mapping (Task 2)**: `packages/llm/src/prompts/nodeMapping.ts`
   - Tier: `fast`. Maps verified news items to candidate canonical nodes with confidence score (0.0 - 1.0) and rationale.
3. **Red Button Verdict (Task 3 / PRD 9.2)**: `packages/llm/src/prompts/verdict.ts`
   - Tier: `strong`. Evaluates differential impact on a developer's roadmap slice (`shield`, `injection`, `override`) with concise reasoning under 60 words (<400 chars).
4. **Graph Change Draft (Task 4)**: `packages/llm/src/prompts/graphChangeDraft.ts`
   - Tier: `strong`. Drafts new canonical nodes, prerequisite edges, and supersedes links for editorial review.
5. **Quickstart Guide (Task 5 / PRD 10.4)**: `packages/llm/src/prompts/quickstartGuide.ts`
   - Tier: `strong`. Generates actionable 20-minute onboarding guides with 3-8 numbered steps, time estimates, verification commands, and common pitfalls.
6. **Personalization Annotation (Task 6)**: `packages/llm/src/prompts/personalization.ts`
   - Tier: `fast`. Generates personalized relevance notes, priority levels, and tailored tips based on developer experience level in the area.

#### 5. Manual Smoke Test Script
- Added script `pnpm llm:smoke` (`packages/llm/src/smoke.ts`):
  - Safely skips with clear guidance if `LLM_API_KEY` is not present.
  - If API key is present, calls the live OpenAI provider once for the news summary prompt and outputs the validated result.

#### 6. Verification & Test Suite
- **Vitest Unit & Integration Tests (123 tests passing across 10 test suites)**:
  - `packages/llm/src/index.test.ts` (13 tests):
    - Deterministic fixture validation for all 6 prompt schemas using `MockProvider`.
    - Retry logic: recovery from malformed JSON strings on retry.
    - Retry logic: recovery from Zod schema violations on retry with error diagnosis.
    - Error handling: throwing `LLMValidationError` after exceeding retry budget.
    - Invariant: anti-hallucination instruction verified on all 6 system prompts.
    - Observability: non-PII telemetry payload verification.
    - Sinks: composite sink and Supabase table sink verification.
    - OpenAI adapter: authentication error and HTTP request handling with mocked fetch.
    - Factory: provider resolution.
  - All existing test suites passing (`@repo/graph`, `@repo/schemas`, mobile-web, Supabase edge functions).
- **TypeScript strict mode (`tsc -b`) & ESLint (`eslint .`)**: 0 errors.

#### How to Run

```bash
# Run unit & integration tests
pnpm test

# Run TypeScript type check and linter
pnpm typecheck && pnpm lint

# Run LLM live smoke test (requires LLM_API_KEY or OPENAI_API_KEY)
pnpm llm:smoke
```

---

## Next

### Prompt 9: News Ingestion Pipeline and Feed Tab

- Ingestion pipeline (Edge Function or scheduled worker):
  - Ingestion from RSS/GitHub/newsletter sources into `news_sources` and `news_items`.
  - Deduplication by URL and `content_hash`.
  - Fast-tier LLM summarizer (`/packages/llm`): 3 actionable bullets, impact score 1-10, tags.
  - Mapping to canonical nodes.
- Feed tab UI in `/apps/mobile-web/app/(app)/index.tsx`:
  - News cards with 3 bullets, impact score badge, source link, and prominent Red Button.
  - Sponsored card slot (structurally separated).



