# Golden Set Evaluation & Release Gate

This document outlines the evaluation harness for Atlas.AI's Red Button Verdict Engine (PRD Section 2, Section 9.2, and Appendix B).

---

## 1. Overview & Closed-Beta Exit Criteria

The Red Button verdict engine operates under a strict principle:
> **"The LLM proposes; deterministic code decides."**

To maintain quality and prevent regressions as prompts or underlying models change, Atlas.AI enforces an automated evaluation suite against an editor-curated golden set.

### Release Gate Metric (PRD Section 2)
- **Minimum Overall Agreement:** `>= 90%`
- Any pull request or prompt/model change that lowers agreement below 90% **fails the release gate** (`pnpm eval:gate`) and blocks deployment.

---

## 2. Running Evaluations

### Standard Evaluation Run
Executes all golden test cases in `/evals/golden/*.json` using the configured provider (default: `mock`):

```bash
pnpm eval
```

With a specific provider:
```bash
# Evaluate against OpenAI models (requires OPENAI_API_KEY)
pnpm eval --provider=openai

# Evaluate with custom agreement threshold
pnpm eval --min=95
```

### Release Gate Execution (CI/CD)
Runs the evaluation and exits with status code `1` if overall agreement is below 90%:

```bash
pnpm eval:gate
```

---

## 3. Golden Set Format (`/evals/golden/*.json`)

Every golden test case is stored as a JSON file adhering to the PRD Appendix B schema:

```json
{
  "news_url": "https://example.com/release-notes",
  "user_profile_fixture": "senior-js-copilot-user",
  "expected_verdict": "injection",
  "expected_new_node_slug": "claude-code",
  "notes": "Major new tool release (impact 9/10). User has terminal prerequisites, node is approved and not in roadmap."
}
```

### Schema Fields

| Field | Type | Description |
|---|---|---|
| `news_url` | `string (url)` | URL linking to the news item fixture |
| `user_profile_fixture` | `string` | ID of the user profile fixture (defined in `/evals/fixtures/user-profiles.ts`) |
| `expected_verdict` | `'shield' \| 'injection' \| 'override'` | The authoritative, editor-labeled verdict |
| `expected_new_node_slug` | `string \| null` | The canonical node slug expected for injection or replacement node for override |
| `notes` | `string` | Editor rationale explaining why this verdict is expected |

---

## 4. Starter Golden Set Coverage

The starter suite includes 18 carefully crafted scenarios covering all three verdicts, specifically testing tricky edge cases:

1. **Shield Cases (9 cases):**
   - **Marketing Hype:** Low impact (3/10) with unverified claims (`case-01`).
   - **Cross-Domain Tools:** Tool for a different domain (SwiftData iOS or Embedded Rust for web developers) (`case-02`, `case-03`).
   - **Minor Non-Obsolescence Updates:** Incremental patches that do not replace a tool (Git 2.45 rebase speedup, VS Code icon refresh, Prettier patch) (`case-04`, `case-05`, `case-09`).
   - **Target Not in Roadmap:** Proposed replacement for a tool the user does not possess (`case-06`).
   - **Already Completed Tool:** Update to a tool already completed with impact < 6 (`case-07`).
   - **Unapproved Proprietary Tool:** Closed beta tool without canonical node approval (`case-08`).

2. **Injection Cases (5 cases):**
   - High-impact breakthrough tools where user has prerequisites and tool is approved and not in roadmap (`claude-code`, `promptfoo`, `browser-use`, `v0-dev`, `supermaven`) (`case-10` to `case-14`).

3. **Override Cases (4 cases):**
   - Legitimate approved `node_supersedes` links where user has active/completed old node:
     - `github-copilot` superseded by `cursor-ide` (`case-15`).
     - `aider` superseded by `claude-code` (`case-16`).
     - `prettier` superseded by `biome` (`case-17`).
     - `ripgrep` superseded by `ast-grep` (`case-18`).

---

## 5. How to Add New Golden Cases

1. **Using the Editorial Dashboard (Web UI):**
   - Navigate to `/apps/mobile-web` -> `(editor)` -> **Golden-Set Manager** tab.
   - Enter News URL, user profile fixture, expected verdict, and notes.
   - Click **Save Golden Test Case**. The file will automatically be saved to `/evals/golden/<slug>.json`.

2. **Manually:**
   - Create a new file `/evals/golden/case-<number>-<slug>.json`.
   - Ensure the `news_url` exists in `/evals/fixtures/news-items.ts` (or add it if new).
   - Ensure the `user_profile_fixture` exists in `/evals/fixtures/user-profiles.ts`.
   - Run `pnpm eval` to test the new case.

---

## 6. When to Re-Run Evaluations

**Mandatory Re-Run Triggers:**
- **Prompt changes:** Whenever `packages/llm/src/prompts/verdict.ts` is modified.
- **Model upgrades:** Whenever switching model versions (e.g. from `gpt-4o-mini` to `gpt-4o` or Claude Sonnet 3.5 to 3.7).
- **Rule changes:** Whenever deterministic decision rules in `packages/graph/src/verdict.ts` are updated.
- **CI/CD Releases:** Every pull request must pass `pnpm eval:gate` before merge.

---

## 7. Eval Run History & Reports

Every execution automatically records its parameters and results under `/evals/results/`:
- `latest.json`: The most recent eval run.
- `run-<timestamp>.json`: Immutable historical runs for regression tracking.

Each run record contains:
- Timestamp, Provider, and Model names.
- Prompt version hash.
- Overall agreement rate and per-verdict breakdown.
- 3x3 Confusion Matrix.
- Complete list of disagreements with LLM reasoning and downgrade explanations.
