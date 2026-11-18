# PRD: AI Upskilling Platform ("Red Button")

**Version:** 1.1 (supersedes SRS v1.0)
**Audience:** AI coding agent (Antigravity) and the two founders
**Target:** Closed beta (100-300 users) in ~12 weeks

> **How to use this document (instructions to the coding agent)**
>
> 1. Treat this file as the single source of truth. If something is ambiguous, pick the simplest option consistent with this document and record it in `/docs/decisions.md`.
> 2. Build in the milestone order in Section 15. Do not start a milestone until the previous one meets its acceptance criteria.
> 3. Keep all LLM calls behind the provider interface in Section 9. Never call a model SDK directly from feature code.
> 4. Every database change is a versioned SQL migration in `/supabase/migrations`. Enable Row Level Security on every table.
> 5. Write tests for the graph logic (cycle detection, injection, override) before the UI that depends on it.
> 6. Do not add features listed under Non-Goals (Section 3).

---

## 1. Product Summary

A cross-platform app (iOS, Android, Web) that removes "AI overwhelm" for working developers. It has two tabs:

1. **News Feed:** real-time, domain-filtered AI-dev news. Each item is condensed into **exactly three actionable bullets** with an **impact score (1-10)**.
2. **Roadmap:** the user's learning path as an interactive **Directed Acyclic Graph (DAG)** of skills, tools and workflow steps.

Every news card has a **Red Button**. It compares that news item against the user's active roadmap and returns one of three verdicts:

| Verdict       | Meaning                                            | Effect on roadmap                                                    |
| ------------- | -------------------------------------------------- | -------------------------------------------------------------------- |
| **Shield**    | News is irrelevant to this user's roadmap          | None                                                                 |
| **Injection** | High-impact new tool/model worth learning          | New node inserted at the correct prerequisite level                  |
| **Override**  | A node the user has is made obsolete by a new tool | Old node archived as completed; replacement node added as Fast-track |

Newly injected or overridden nodes get an auto-generated **20-minute quickstart guide**. Roadmap and profile sync in real time across the user's devices.

**One-line pitch:** "Stop drowning in AI news. Keep a roadmap that updates itself."

## 2. Goals and Success Metrics

**Launch domain:** AI-assisted software development (single domain).
**Launch audience:** Domain Professionals (working developers who already have a stack).

**North-star metric:** Weekly active learners = users who, in a calendar week, complete a node OR confirm a Red Button verdict (Injection/Override).

**Closed-beta exit criteria (go-public gate):**

- Verdict agreement with editor-labeled golden set: **>= 90%**
- Share of previewed verdicts the user confirms: **>= 60%**
- Week-4 retention of beta users: **>= 30%**
- Time from signup to first visible roadmap: **<= 5 minutes**

## 3. Non-Goals (v1)

- Multiple domains (design the schema for them, ship only one)
- Beginner-first flows or courses
- Team/enterprise roadmaps, admin RBAC beyond a single `editor` role
- Offline mode, third-party LMS integrations
- Paid Pro tier (schema may leave room; do not build billing)
- Node-change animations (low priority; ship only if time remains)
- Any mechanism for sponsors to influence scores, verdicts or injections

## 4. Users

**Primary persona: "Working Dev."** 2-10 years of experience, already uses an editor and at least one AI assistant, feels behind because tools change weekly, has 10-15 minutes per day, distrusts hype and cares about accuracy and sources.

**Internal persona: "Editor"** (the founders at first). Reviews proposed graph changes and quickstart guides in the editorial dashboard.

## 5. Core Concepts

- **Canonical graph:** hand-maintained graph of nodes for the domain, with stable IDs, prerequisite edges and "supersedes" relations. This is the source of truth. User roadmaps are _views_ over it.
- **Node types:** `skill`, `tool`, `workflow`.
- **User roadmap:** per-user set of `user_nodes` referencing canonical nodes, each with a status.
- **Node status:** `known` (from onboarding), `todo`, `in_progress`, `completed`, `archived` (superseded; still counts as completed history).
- **Fast-track node:** replacement node created by an Override, with credit hint and quickstart attached.
- **Verdict cache:** verdicts depend on (news item, canonical nodes affected, user's relevant node set), so identical situations are computed once and reused.

## 6. Tech Stack (fixed)

| Layer           | Choice                                                                                                                                   |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Client          | React Native (Expo, Expo Router) + React Native Web, **TypeScript**, single codebase for iOS/Android/Web                                 |
| Graph rendering | `@shopify/react-native-skia` canvas with pan/zoom/drag (gesture handler + reanimated). Web fallback: Skia via CanvasKit or SVG if needed |
| State/data      | TanStack Query + Zustand; Supabase JS client                                                                                             |
| Backend         | Supabase (PostgreSQL, Auth, Row Level Security, Realtime, Edge Functions, Storage, Cron)                                                 |
| Server logic    | TypeScript Edge Functions / small Node service for pipelines                                                                             |
| Auth            | Supabase Auth: email+password and Google OAuth                                                                                           |
| LLM             | Provider-agnostic interface (Section 9), two model tiers via env vars                                                                    |
| Validation      | `zod` for all API and LLM JSON outputs                                                                                                   |
| Testing         | Vitest (logic), Playwright (web E2E), Jest + RN Testing Library (components)                                                             |
| Analytics       | PostHog (or equivalent) with the events in Section 13                                                                                    |

**Suggested repo layout**

```
/apps/mobile-web        # Expo app (iOS/Android/Web), Expo Router
/packages/graph         # pure TS: DAG validation, injection, override, layout (no I/O)
/packages/schemas       # zod schemas shared by client and functions
/packages/llm           # provider interface + prompts + eval harness
/supabase/migrations
/supabase/functions     # ingest-news, summarize, map-nodes, precompute-verdicts, apply-verdict, generate-guide
/apps/editor            # web-only editorial dashboard (can be a route group in the main app, role-gated)
/evals/golden           # golden-set JSON + runner
/docs
```

## 7. Data Model (PostgreSQL)

All tables have `id uuid pk default gen_random_uuid()`, `created_at`, `updated_at`. RLS is mandatory. Users read/write only their own rows; canonical content is read-only to users and writable only by role `editor`.

```sql
-- Domains (one row at launch)
domains(id, slug unique, name)

-- Canonical graph
canonical_nodes(
  id, domain_id fk, slug unique, name, description,
  node_type text check (node_type in ('skill','tool','workflow')),
  level int,                       -- topological layer hint (0 = foundation)
  status text check (status in ('draft','approved','deprecated')) default 'approved',
  external_url text, version_tag text
)
canonical_edges(                   -- prerequisite: from_node must come before to_node
  id, from_node fk, to_node fk, unique(from_node,to_node)
)
node_supersedes(                   -- new_node makes old_node obsolete
  id, old_node fk, new_node fk, note, unique(old_node,new_node)
)

-- Users
profiles(
  id uuid pk references auth.users, display_name, domain_id fk,
  experience jsonb,                -- {area_slug: 'beginner'|'working'|'expert'}
  onboarding_completed bool default false
)
user_nodes(
  id, user_id fk, node_id fk canonical_nodes,
  status text check (status in ('known','todo','in_progress','completed','archived')),
  origin text check (origin in ('baseline','injection','override')) default 'baseline',
  fast_track bool default false,
  replaced_node_id fk canonical_nodes null,   -- for override: the node this replaced
  completed_at timestamptz null,
  version int default 1,           -- optimistic concurrency / sync
  unique(user_id,node_id)
)

-- News
news_sources(id, domain_id, name, url, kind check (kind in ('rss','github_releases','api','newsletter')), active bool)
news_items(
  id, domain_id, source_id fk, url unique, title, published_at,
  raw_text text, content_hash text unique,
  bullets jsonb,                   -- array of exactly 3 strings
  impact_score int check (impact_score between 1 and 10),
  impact_rationale text,
  tags text[], mapped_node_ids uuid[],     -- canonical nodes this item touches
  proposed_new_tool jsonb null,            -- {name, category, supersedes_slugs[]}
  status text check (status in ('ingested','processed','published','rejected')) default 'ingested'
)

-- Verdicts (cache + per-user result)
verdicts(
  id, news_item_id fk, cache_key text,     -- hash(news_item_id + sorted relevant node ids + experience bucket)
  verdict text check (verdict in ('shield','injection','override')),
  target_node_id fk null,                  -- node to inject / node being replaced
  new_node_id fk null,                     -- node to add (must be approved canonical node)
  insert_after_node_ids uuid[],            -- prerequisite placement
  reasoning text, confidence numeric,
  unique(news_item_id, cache_key)
)
user_verdicts(                             -- what each user saw/did
  id, user_id fk, news_item_id fk, verdict_id fk,
  state text check (state in ('precomputed','previewed','confirmed','dismissed','applied','failed')),
  applied_at timestamptz null
)

-- Guides
guides(
  id, node_id fk unique, markdown text, source_urls text[],
  last_verified_at timestamptz,
  status text check (status in ('draft','approved')) default 'draft'
)

-- Editorial queue
proposed_graph_changes(
  id, news_item_id fk, change_type check (change_type in ('add_node','add_edge','add_supersedes','deprecate_node')),
  payload jsonb, status check (status in ('pending','approved','rejected')) default 'pending',
  reviewed_by uuid null, reviewed_at timestamptz null
)

-- Monetization (labeled sponsorship only)
sponsored_placements(
  id, title, body, cta_url, sponsor_name, domain_id, active bool, starts_at, ends_at
)

-- Limits & analytics
usage_counters(user_id, day date, on_demand_analyses int, primary key(user_id, day))
events(id, user_id, name, properties jsonb, created_at)
```

**Invariants (enforce in code and, where possible, in DB constraints/triggers):**

- The canonical graph and every user roadmap are acyclic.
- `user_nodes` of status `completed` or `archived` are never hard-deleted.
- `bullets` always has exactly 3 non-empty strings.
- Only `approved` canonical nodes may appear in a user roadmap.
- Sponsored placements have no foreign key to news_items, verdicts or nodes (structural separation).

## 8. Core Logic (`/packages/graph`, pure functions, fully unit-tested)

### 8.1 Baseline roadmap generation

Input: `profile.domain`, selected known tools/skills (node IDs), self-rated level per area.

1. Load the approved canonical subgraph for the domain.
2. Mark selected nodes `known`. Mark all ancestors (transitive prerequisites) of any `expert`-rated area's nodes as `known`; for `working`-rated areas, mark only direct prerequisites.
3. All remaining nodes whose prerequisites are all satisfied (known/completed) are `todo` and "available"; others are `todo` and "locked".
4. Prune nodes outside the user's relevant areas if the roadmap exceeds ~60 nodes (keep the target-goal path first).
5. Optional LLM step (cheap tier): write a one-line "why this matters for you" annotation per node. Failure must not block roadmap creation.
6. Persist `user_nodes` in one transaction.

### 8.2 Graph operations

- `wouldCreateCycle(edges, from, to): boolean` (DFS/topological check)
- `topoLayers(nodes, edges)`: layer assignment for layout
- `applyInjection(roadmap, newNode, insertAfterIds)`: adds node and prerequisite edges. Placement rule: after the deepest satisfied prerequisite in the user's roadmap; before any of its dependents. Reject if a cycle would result.
- `applyOverride(roadmap, oldNodeId, newNode)`: set old `user_node.status = 'archived'` (keeps completion history), add `newNode` as `todo` with `fast_track = true` and `replaced_node_id = oldNodeId`, **re-point dependents' prerequisite satisfaction so downstream nodes stay unlocked**. Never delete the old node.
- All operations run inside a DB transaction. On any error, roll back fully (no partial update).

## 9. LLM Layer (`/packages/llm`)

**Provider interface**

```ts
interface LLMProvider {
  generateJSON<T>(args: {
    tier: 'fast' | 'strong';
    system: string;
    user: string;
    schema: ZodSchema<T>;
    maxRetries?: number;
  }): Promise<T>;
  generateText(args: { tier: 'fast' | 'strong'; system: string; user: string }): Promise<string>;
}
```

Env: `LLM_PROVIDER`, `LLM_MODEL_FAST`, `LLM_MODEL_STRONG`, `LLM_API_KEY`. Implement one provider; keep others swappable.

**Tier assignment**

| Task                                                     | Tier                                          |
| -------------------------------------------------------- | --------------------------------------------- |
| 3-bullet summary, impact score, tags                     | fast                                          |
| Map news to canonical nodes (candidate retrieval + pick) | fast (with strong fallback if low confidence) |
| Verdict (differential analysis)                          | strong                                        |
| Graph-change draft (proposed new node/edges)             | strong                                        |
| Quickstart guide generation                              | strong                                        |
| Per-node personalization annotations                     | fast                                          |

**Rules for all prompts**

- Output must validate against a `zod` schema; retry up to 2 times, then mark item `failed` and surface to the editor queue.
- Ground every claim in provided source text; instruct the model to say "unknown" rather than invent versions, flags or commands.
- Log prompt version, model, latency and token counts per call.

### 9.1 News processing prompt contract (fast tier)

Output schema:

```json
{
  "bullets": ["string","string","string"],
  "impact_score": 1,
  "impact_rationale": "string",
  "tags": ["string"],
  "proposed_new_tool": {"name":"string","category":"string","supersedes_slugs":["string"]} | null
}
```

Bullets must be: exactly 3, each under ~25 words, **actionable** (what it is, why it matters, what to do), no marketing language.

**Impact score rubric (1-10):** 1-2 trivia/rumor; 3-4 minor update; 5-6 notable feature in existing tool; 7-8 significant new capability or major version of a widely used tool; 9-10 a new tool/model likely to change how developers work or make a common workflow obsolete.

### 9.2 Verdict prompt contract (strong tier)

Input: news item (title, bullets, source excerpt, tags), the **candidate canonical nodes** it maps to, the user's relevant roadmap slice (statuses only, no PII), and the approved supersedes relations.
Output schema:

```json
{
  "verdict": "shield" | "injection" | "override",
  "new_node_slug": "string | null",
  "target_node_slug": "string | null",
  "insert_after_slugs": ["string"],
  "reasoning": "string (max 60 words)",
  "confidence": 0.0
}
```

**Decision rules (enforced in code after the LLM answers; the LLM cannot override them):**

1. `shield` if the news maps to no node in the user's domain OR impact_score < 6 OR `new_node_slug` is not an approved canonical node. Roadmap unchanged.
2. `override` only if an approved `node_supersedes` row links an existing non-archived user node to the new node.
3. `injection` only if the new node is approved, not already in the user's roadmap, and `impact_score >= 7`.
4. If confidence < 0.6, downgrade to `shield` and flag the item for editor review.
5. A verdict that references a node not in the canonical graph is invalid, so default to `shield`.

## 10. Pipelines

### 10.1 News ingestion (cron every 15-30 min, Edge Function)

1. Pull active `news_sources` (RSS, GitHub releases, vendor blogs, vetted newsletters).
2. Normalize, dedupe by URL and `content_hash`.
3. Store `raw_text` (for processing only; the app shows summaries and links back to the original, never full republished text).
4. Run 9.1 to get bullets, score, tags, proposed new tool. Target: available within 5 seconds of ingestion at normal load.
5. Map to canonical nodes (embedding or keyword retrieval, then LLM pick).
6. Set `status = published` for items that pass validation.
7. If `proposed_new_tool` exists with no matching canonical node, create a `proposed_graph_changes` row (editor queue). The item is shown in the feed, but cannot trigger Injection/Override until the node is approved.

### 10.2 Verdict precomputation

- For each newly published item with `impact_score >= 5`, compute verdicts per distinct `cache_key` among active users (group users by relevant node set and experience bucket, so cost scales with cohorts and not with users).
- Store in `verdicts`, and create `user_verdicts(state='precomputed')`.
- Tapping the Red Button on a precomputed verdict is instant (target <= 3 s for the on-demand path).
- On-demand analysis (item without a precomputed verdict) is allowed within the free-tier limit (default 10 per user per day, env-configurable; show remaining count; precomputed previews never count).

### 10.3 Apply flow (preview then confirm)

1. User taps Red Button, sees a **Preview** (Section 11.4), with no mutation yet.
2. User taps **Confirm** and the `apply-verdict` function runs one DB transaction: validate (acyclic, approved node, still applicable), apply injection/override, bump `user_nodes.version`, set `user_verdicts.state = 'applied'`.
3. On any failure: roll back, set state `failed`, show a retry message. The roadmap stays consistent.
4. After applying, the new node's guide is shown (generate on demand if not cached; see 10.4).

### 10.4 Quickstart guide generation

- One guide per canonical node (not per user), cached in `guides`.
- Generated by the strong tier, grounded in the tool's official docs/release notes (fetched at generation time). Structure: Goal (1 line), Prerequisites, 20-minute steps (numbered, 5-8 steps with time estimates), Verify it worked, Common pitfalls, Source links.
- Created as `draft`; appears in the editor queue; users only see `approved` guides, with a "Last verified <date>" label. If a guide is not yet approved, show "Guide in review" plus the official docs link.

## 11. Screens and UX

Navigation: two tabs, **Feed** and **Roadmap**, plus Profile (settings icon). Clear color + icon coding for the verdicts (e.g., Shield = blue/shield icon, Injection = green/plus-node icon, Override = amber/swap icon).

### 11.1 Onboarding (<= 5 minutes)

1. Auth (email/password or Google).
2. Domain goal (single option: AI-assisted software development, displayed as a goal card; schema supports more).
3. **Structured picker** built from canonical nodes grouped by area (e.g., Editors/IDEs, AI assistants, Languages & frameworks, Testing, Deployment, Agents/automation). Multi-select what they use.
4. Self-rate level per area: Beginner / Working / Expert.
5. Generate baseline roadmap, show it immediately.

### 11.2 Feed tab

- Card: title, source, time, **3 bullets**, **impact badge (1-10)**, domain tags, prominent **Red Button**, link to the original.
- Cards with a precomputed relevant verdict show a subtle hint (e.g., "Matches your roadmap").
- Sponsored cards: clearly labeled "Sponsored", visually distinct, interleaved at a fixed cadence (e.g., 1 per 10 items), never ranked by or linked to verdict logic.
- Pull to refresh; realtime insert of new items.

### 11.3 Roadmap tab

- Interactive DAG: pan, zoom, tap node for detail, drag-and-drop to move a node between `todo` / `in_progress` / `completed`, haptic feedback on mobile, >= 30 FPS for ~200 nodes.
- Node visual states: locked, available, in progress, completed, archived (muted), fast-track (badge).
- Toggle to view **Legacy** (archived) nodes.
- Node detail sheet: description, prerequisites, status controls, quickstart guide (if present), source link.

### 11.4 Red Button preview modal

- Verdict badge + one-paragraph reasoning.
- **Shield:** "No changes to your roadmap" + why.
- **Injection:** mini-diagram showing the new node and where it connects; "Add to my roadmap" / "Dismiss".
- **Override:** shows old node → new node, with "Your progress on <old node> is kept (moved to Legacy)"; "Swap" / "Dismiss".
- Confirm applies via 10.3. Highlight the changed region on the graph afterwards (simple highlight; full animation is optional).

### 11.5 Profile/Settings

Edit goal, known stack, levels (re-runs baseline merge without losing completion state), notification preferences, **export my data** and **delete my account** (see Section 14).

### 11.6 Editorial dashboard (web only, role `editor`)

- Queue of `proposed_graph_changes` (approve/reject/edit), draft guides (approve/edit), items flagged low-confidence.
- Browse/edit canonical graph (nodes, edges, supersedes) with cycle-check on save.
- Golden-set manager: label an item's expected verdict for evals.

## 12. Real-time Sync

- Use Supabase Realtime on `user_nodes`, `profiles`, `user_verdicts` filtered by `user_id`.
- Conflict rule: last-write-wins per row using `version` (optimistic concurrency: write fails if version changed; client refetches and reapplies the user's intent).
- Degrade gracefully when offline: show last-known state with an "Offline, changes will not save" banner (no offline queue in v1).

## 13. Analytics Events

`onboarding_started`, `onboarding_completed` (with duration), `roadmap_viewed`, `node_status_changed`, `node_completed`, `news_card_viewed`, `red_button_tapped` (with precomputed flag), `verdict_previewed` (verdict type), `verdict_confirmed`, `verdict_dismissed`, `guide_opened`, `sponsored_card_viewed`, `sponsored_card_clicked`, `daily_limit_hit`.
Dashboards: weekly active learners, preview confirmation rate, week-4 retention, time to first roadmap, verdict distribution.

## 14. Non-Functional, Security, Compliance

- **Performance:** feed item summarized <= 5 s after ingestion; Red Button <= 3 s; graph interactions >= 30 FPS.
- **Reliability:** 99.5% target for feed + roadmap; scheduled DB backups; all graph mutations transactional with rollback.
- **Security:** TLS everywhere; Supabase Auth hashing; RLS on every table (users only access their own rows; only `editor` writes canonical content); secrets only in environment variables; never log full user profiles to analytics.
- **Compliance:** GDPR / India DPDP: consent at signup, in-app **export** (JSON) and **delete account** (cascade delete of user-owned rows, anonymize analytics).
- **Compatibility:** latest two versions of Chrome, Safari, Edge, Firefox; current and previous major iOS and Android.
- **Accessibility:** color is never the only verdict indicator (icons + labels); minimum touch target 44 px; screen-reader labels on graph nodes.
- **Sponsorship integrity:** sponsor data lives in a separate table with no link to scoring/verdict code; add a unit test asserting verdict functions take no sponsor input.

## 15. Milestones and Acceptance Criteria

**M0: Foundations (week 1)**
Monorepo, Expo app skeleton (web + iOS + Android run), Supabase project, auth, CI, migrations framework.
_Accept:_ user can sign up/in on web and mobile; RLS test proves a user cannot read another user's rows.

**M1: Canonical graph + data model (weeks 1-3)**
All tables in Section 7, seed script, editor role. Hand-build the seed canonical graph (target 100-150 nodes; see Appendix A for the format and starter examples). Implement `/packages/graph` core functions with tests.
_Accept:_ seed graph loads; cycle detection tests pass (including adversarial cases); baseline generation produces a valid DAG for 5 sample profiles.

**M2: Onboarding + Roadmap UI (weeks 3-6)**
Onboarding flow, baseline roadmap, interactive DAG (pan/zoom/drag/status), node detail, Legacy view, realtime sync.
_Accept:_ signup to first roadmap in <= 5 min; 200-node graph holds >= 30 FPS on a mid-range phone; status changes sync across two devices within 2 s.

**M3: News pipeline + Feed (weeks 4-7)**
Source ingestion, dedupe, summary/score/tags via LLM layer, node mapping, feed UI, sponsored card slot.
_Accept:_ items appear within 5 s of processing; every item has exactly 3 bullets (schema-enforced) and a score; invalid LLM output never reaches the feed.

**M4: Red Button engine (weeks 7-10)**
Verdict logic with code-enforced rules, precomputation, cache, preview modal, apply flow with transaction/rollback, free-tier counter, guide generation + cache.
_Accept:_ unit tests for Shield/Injection/Override paths; forced failure mid-apply leaves roadmap unchanged; Override keeps old node in Legacy and downstream nodes unlocked; verdict <= 3 s.

**M5: Editorial dashboard + evals (weeks 8-10)**
Editor queue (graph changes, guides, flagged items), golden-set labeling and eval runner producing an agreement % report.
_Accept:_ editor can approve a proposed node and it becomes injectable; eval command outputs agreement against the golden set.

**M6: Hardening + beta launch (weeks 11-12)**
Analytics, export/delete flows, error states, performance pass, TestFlight / Android internal testing builds, web deploy, waitlist invite flow.
_Accept:_ all Section 14 items implemented; beta-ready checklist passes; invite 100-300 users.

## 16. Risks and Mitigations

| Risk                                  | Mitigation                                                                                                          |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Wrong Override/Injection erodes trust | Code-enforced rules, approved nodes only, confidence threshold, preview+confirm, golden-set evals                   |
| LLM cost on a free product            | Tiered models, caching by cohort `cache_key`, precompute only for relevant items, daily limit on on-demand analysis |
| Sponsor pressure                      | Structural separation (Section 7 invariant, tested) and public "sponsors never affect verdicts" statement           |
| Editorial overload                    | Fixed queue UI, written approval guidelines, hire part-time editor when review exceeds ~1.5 h/day                   |
| Source breakage / licensing           | Primary-source feeds first, store summaries + link out, per-source health checks                                    |
| Hallucinated guides                   | Grounding in official docs, editor approval, "last verified" date                                                   |

## 17. Open Items for Founders (not blocking M0)

- Final seed node list for the canonical graph (Appendix A is a starting sample only).
- Exact starting source list (feeds/repos/newsletters).
- LLM provider and model names for each tier.
- Free-tier daily on-demand limit (default 10).
- Brand name, logo and verdict color palette.

---

## Appendix A: Canonical Graph Seed Format (starter examples, expand to ~100-150 nodes)

```json
{
  "domain": "ai-assisted-software-development",
  "nodes": [
    { "slug": "prompting-basics", "name": "Prompting for code", "type": "skill", "level": 0 },
    {
      "slug": "ai-code-completion",
      "name": "AI code completion in your editor",
      "type": "tool",
      "level": 0
    },
    {
      "slug": "chat-assisted-debugging",
      "name": "Chat-assisted debugging",
      "type": "workflow",
      "level": 1
    },
    {
      "slug": "context-management",
      "name": "Context and codebase indexing",
      "type": "skill",
      "level": 1
    },
    {
      "slug": "ai-pair-programming-workflow",
      "name": "AI pair-programming workflow",
      "type": "workflow",
      "level": 2
    },
    { "slug": "agentic-coding-tools", "name": "Agentic coding tools", "type": "tool", "level": 2 },
    {
      "slug": "ai-test-generation",
      "name": "AI-assisted test generation",
      "type": "workflow",
      "level": 2
    },
    {
      "slug": "mcp-basics",
      "name": "Model Context Protocol (MCP) basics",
      "type": "skill",
      "level": 3
    },
    {
      "slug": "multi-agent-orchestration",
      "name": "Multi-agent orchestration",
      "type": "skill",
      "level": 3
    },
    {
      "slug": "llm-evals-for-code",
      "name": "Evaluating AI-generated code",
      "type": "skill",
      "level": 3
    }
  ],
  "edges": [
    ["prompting-basics", "chat-assisted-debugging"],
    ["ai-code-completion", "ai-pair-programming-workflow"],
    ["context-management", "agentic-coding-tools"],
    ["chat-assisted-debugging", "ai-pair-programming-workflow"],
    ["ai-pair-programming-workflow", "agentic-coding-tools"],
    ["agentic-coding-tools", "multi-agent-orchestration"],
    ["agentic-coding-tools", "mcp-basics"],
    ["ai-test-generation", "llm-evals-for-code"]
  ],
  "supersedes": []
}
```

_Note: tool-specific nodes (named products) should be added as `tool` nodes with `supersedes` links when one product replaces another. Verify each named tool and its relationships against current official sources before approving._

## Appendix B: Golden Set Format (`/evals/golden/*.json`)

```json
{
  "news_url": "https://example.com/release-notes",
  "user_profile_fixture": "senior-js-copilot-user",
  "expected_verdict": "injection",
  "expected_new_node_slug": "agentic-coding-tools",
  "notes": "Editor rationale here"
}
```

Runner: for each item, compute the verdict with the current model/prompt, compare to expected, report agreement % overall and per verdict type. Re-run on every prompt or model change; block release if agreement < 90%.

## Appendix C: Environment Variables

```
SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
LLM_PROVIDER, LLM_MODEL_FAST, LLM_MODEL_STRONG, LLM_API_KEY
FREE_TIER_DAILY_ANALYSES=10
POSTHOG_KEY
```
