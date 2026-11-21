# Canonical Graph Guide: Adding, Superseding, and Reviewing Nodes

This guide explains how to curate the authoritative knowledge graph for Atlas.AI domains, manage prerequisite edges, configure supersedes relationships, and follow the editorial approval checklist.

---

## 1. Architecture Overview

Atlas.AI models user learning roadmaps as views over an immutable, acyclic **Canonical Graph**:

- **Domain (`domains`)**: Top-level knowledge vertical (e.g. `ai-assisted-software-development`).
- **Canonical Node (`canonical_nodes`)**: Atomic concept, tool, or workflow with a stable unique slug.
- **Canonical Edge (`canonical_edges`)**: Directed prerequisite edge from a predecessor node (`from_node`) to a successor node (`to_node`).
- **Node Supersedes (`node_supersedes`)**: Directed relationship indicating that `new_node` renders `old_node` obsolete. In user roadmaps, this triggers the **Red Button Override** verdict.

Seed data lives in `/supabase/seed/canonical-graph/<domain-slug>.json`.

---

## 2. How to Add a Node

Add a JSON object to the `nodes` array in the corresponding domain seed file:

```json
{
  "slug": "custom-mcp-server-authoring",
  "name": "Custom MCP Server Authoring",
  "description": "Developing domain-specific Model Context Protocol servers exposing tools and resources.",
  "type": "skill",
  "level": 4,
  "area": "editors-ides",
  "status": "approved",
  "external_url": "https://modelcontextprotocol.io",
  "version_tag": null
}
```

### Field Requirements

1. **`slug`**: Kebab-case, globally unique across the domain (e.g., `prompting-basics`, `cursor-editor`). Never change a slug once released, as it anchors user progress history.
2. **`name`**: Concise title (2-6 words).
3. **`description`**: 1-2 sentence definition focusing on what the developer learns or accomplishes. Avoid marketing adjectives ("revolutionary", "game-changing").
4. **`type`**: Must be one of:
   - `'skill'`: Conceptual ability, prompting technique, architectural principle (e.g., `prompting-basics`).
   - `'tool'`: Specific software, CLI, editor, library, or provider (e.g., `github-copilot`, `aider-cli`).
   - `'workflow'`: Multi-step developer habit or interaction process (e.g., `chat-assisted-debugging`, `spec-driven-agent-workflows`).
5. **`area`**: High-level category used to group nodes during onboarding:
   - `editors-ides`: IDEs, extensions, editor protocols, AST refactoring.
   - `ai-assistants`: Prompting, chat, pair programming, context hygiene.
   - `languages-frameworks`: Scaffolding, type synthesis, API contracts, codemods.
   - `testing`: Test generation, mutation analysis, property-based tests, fuzzing.
   - `deployment`: Git summaries, CI review bots, IaC, container sandboxing.
   - `agents-automation`: CLI task runners, autonomous agents, orchestration, self-healing pipelines.
6. **`level`**: Integer indicating topological depth hint:
   - `0`: Foundation (strictly 0 prerequisites).
   - `1`: Fundamentals & first AI tools.
   - `2`: Integrated developer workflows.
   - `3`: Advanced architectures, protocols, and verification loops.
   - `4`: Multi-agent systems, autonomous execution, self-healing pipelines.
7. **`status`**:
   - `'approved'`: Standard for generic concepts, established methodologies, and verified capabilities.
   - `'draft'`: **Mandatory for any node naming a specific commercial product** (e.g., Cursor, Devin, v0). Draft nodes remain hidden from regular users until an Editor approves them.
   - `'deprecated'`: Retired node that should not appear in new baseline roadmaps.
8. **`todo_note`**: Required when `status: "draft"`. Explains what needs verification (e.g., `"TODO: verify product features, versions and relationships against official documentation before approval"`).

---

## 3. Prerequisite Edges & Rules

Add prerequisite edges to the `edges` array as `[from_slug, to_slug]`:

```json
"edges": [
  ["modern-ide-fundamentals", "in-editor-ai-extension-setup"],
  ["in-editor-ai-extension-setup", "context-aware-inline-completion"]
]
```

### Invariants Enforced by `pnpm graph:validate`:

1. **Strict DAG (No Cycles)**: The entire canonical graph must be acyclic.
2. **Level Consistency**: For every edge `[from_slug, to_slug]`, `level(to_slug) > level(from_slug)`. A node cannot depend on a node of equal or higher level.
3. **Foundation Rule**: All `level: 0` nodes must have **zero** incoming edges.
4. **No Orphans**: All nodes with `level > 0` must have **at least one** incoming edge and be reachable from a `level: 0` foundation node.

---

## 4. Marking Supersedes Links

When a new tool or workflow renders an older tool or practice obsolete, add a supersedes record:

```json
"supersedes": [
  [
    "legacy-ai-autocomplete",
    "context-aware-inline-completion",
    "Whole-codebase context-aware inline completions supersede simple single-line autocompletion."
  ]
]
```

### Impact on User Roadmaps:
- The old node is moved to **`archived`** status (never hard-deleted, preserving user learning history).
- The new node is added as **`todo`** with `fast_track: true` and `replaced_node_id` set to the old node.
- Downstream dependents of the old node stay unlocked.

---

## 5. Review Checklist for Approving a Node

Before changing a node from `status: "draft"` to `status: "approved"`:

- [ ] **Official Documentation Grounding**: Verify claims, features, and capabilities against the vendor's primary docs or release notes. No hallucinations or rumors.
- [ ] **Longevity & Relevance**: Is this a durable addition to the developer's learning path, or fleeting noise? (Fleeting news belongs in the News Feed, not the Canonical Graph).
- [ ] **Proper Area & Type**: Correctly classified as `skill`, `tool`, or `workflow`, and placed in the appropriate `area`.
- [ ] **Topological Level**: Level aligns with prerequisite depth. For every prerequisite `P -> N`, `level(N) > level(P)`.
- [ ] **Supersedes Checked**: If this replaces an existing node, verify the `node_supersedes` link is added with an explanatory note.
- [ ] **Run Validator**: Run `pnpm graph:validate` and ensure it exits with code 0 (`PASSED ✅`).

---

## 6. CLI Tooling

Validate seed files:
```bash
pnpm graph:validate
```

Idempotently load seed data into Supabase:
```bash
# Starts local Supabase containers (requires Docker Desktop)
pnpm db:start

# Loads/upserts nodes, edges, and supersedes without creating duplicates
pnpm graph:seed
```
