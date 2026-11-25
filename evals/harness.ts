import * as fs from 'fs';
import * as path from 'path';
import type {
  GoldenSetCase,
  CanonicalNode,
  UserNode,
  VerdictOutput,
} from '@repo/schemas';
import { GoldenSetCaseSchema } from '@repo/schemas';
import { decideVerdict, type VerdictContext, type DecidedVerdict } from '../packages/graph/src/index';
import type { LLMProvider } from '../packages/llm/src/types';
import { MockProvider } from '../packages/llm/src/providers/mock';
import { getLLMProvider } from '../packages/llm/src/factory';
import { verdictPrompt, type VerdictInput } from '../packages/llm/src/prompts/verdict';
import type {
  EvalOptions,
  EvalRunReport,
  EvalCaseResult,
  EvalCaseDisagreement,
  ConfusionMatrix,
} from '../packages/llm/src/evals/types';
import {
  EVAL_CANONICAL_NODES,
  EVAL_CANONICAL_EDGES,
  EVAL_SUPERSEDES_LINKS,
  USER_PROFILE_FIXTURES,
  EVAL_NEWS_ITEMS,
} from './fixtures/index';

/**
 * Loads and validates all golden cases from the golden directory.
 */
export function loadGoldenCases(
  goldenDir: string,
): Array<{ filename: string; caseData: GoldenSetCase }> {
  if (!fs.existsSync(goldenDir)) {
    throw new Error(`Golden set directory does not exist: ${goldenDir}`);
  }

  const files = fs
    .readdirSync(goldenDir)
    .filter((f) => f.endsWith('.json') && !f.startsWith('.'))
    .sort();

  const cases: Array<{ filename: string; caseData: GoldenSetCase }> = [];

  for (const file of files) {
    const fullPath = path.join(goldenDir, file);
    try {
      const raw = fs.readFileSync(fullPath, 'utf-8');
      const parsedJson = JSON.parse(raw);
      const parsed = GoldenSetCaseSchema.safeParse(parsedJson);
      if (!parsed.success) {
        console.warn(`[eval-harness] Skipping invalid golden case ${file}:`, parsed.error.format());
        continue;
      }
      cases.push({
        filename: file,
        caseData: parsed.data,
      });
    } catch (err) {
      console.warn(`[eval-harness] Error reading golden case ${file}:`, err);
    }
  }

  return cases;
}

/**
 * Executes a single golden set evaluation case through the real pipeline:
 * retrieval/context -> prompt -> LLM provider -> deterministic decideVerdict.
 */
export async function executeCase(
  caseItem: { filename: string; caseData: GoldenSetCase },
  provider: LLMProvider,
): Promise<EvalCaseResult> {
  const { filename, caseData } = caseItem;
  const startTime = Date.now();

  // 1. Resolve fixtures
  const newsItem = EVAL_NEWS_ITEMS[caseData.news_url];
  const userProfile = USER_PROFILE_FIXTURES[caseData.user_profile_fixture];

  if (!newsItem) {
    throw new Error(`Fixture news item not found for URL: ${caseData.news_url} (in ${filename})`);
  }
  if (!userProfile) {
    throw new Error(
      `Fixture user profile not found for ID: ${caseData.user_profile_fixture} (in ${filename})`,
    );
  }

  // 2. Build VerdictContext & Retrieval Inputs
  const domainMatches = userProfile.domain_id === newsItem.domain_id;
  const impactScore = newsItem.impact_score || 5;

  const canonicalNodeMap = new Map<string, CanonicalNode>();
  for (const n of EVAL_CANONICAL_NODES) {
    canonicalNodeMap.set(n.id, n);
    canonicalNodeMap.set(n.slug, n);
  }

  const mappedIds: string[] = newsItem.mapped_node_ids || [];
  const candidateNodes = mappedIds
    .map((idOrSlug: string) => canonicalNodeMap.get(idOrSlug))
    .filter((n: CanonicalNode | undefined): n is CanonicalNode => Boolean(n))
    .map((n: CanonicalNode) => ({ slug: n.slug, name: n.name }));

  const userRoadmapSlice = userProfile.roadmap.user_nodes
    .map((un: UserNode) => {
      const canonical = canonicalNodeMap.get(un.node_id);
      return {
        slug: canonical?.slug || un.node_id,
        status: un.status,
      };
    })
    .filter((s: { slug: string; status: any }) => Boolean(s.slug));

  const approvedSupersedes = EVAL_SUPERSEDES_LINKS.map((s) => ({
    old_node_id: s.old_node_id,
    new_node_id: s.new_node_id,
    old_slug: s.old_slug,
    new_slug: s.new_slug,
  }));

  const supersedesForPrompt = approvedSupersedes.map((s) => ({
    old_slug: s.old_slug,
    new_slug: s.new_slug,
  }));

  // 3. Build Prompt Input & Call LLM
  const verdictInput: VerdictInput = {
    title: newsItem.title || 'Untitled Advancement',
    bullets: newsItem.bullets || ['Key advancement summary', '', ''],
    impact_score: impactScore,
    tags: newsItem.tags || [],
    candidateNodes,
    userRoadmapSlice,
    approvedSupersedes: supersedesForPrompt,
  };

  const llmOutput: VerdictOutput = await provider.generateJSON({
    tier: 'strong',
    system: verdictPrompt.system,
    user: verdictPrompt.buildUser(verdictInput),
    schema: verdictPrompt.schema,
    promptName: verdictPrompt.name,
    promptVersion: verdictPrompt.version,
  });

  // 4. Deterministic decideVerdict (PRD 9.2)
  const verdictContext: VerdictContext = {
    domainMatches,
    impactScore,
    canonicalNodes: EVAL_CANONICAL_NODES,
    canonicalEdges: EVAL_CANONICAL_EDGES,
    supersedes: approvedSupersedes,
    roadmap: userProfile.roadmap,
  };

  const decided: DecidedVerdict = decideVerdict(llmOutput, verdictContext);
  const latencyMs = Date.now() - startTime;

  // 5. Evaluate Agreement
  const verdictMatches = decided.verdict === caseData.expected_verdict;
  let nodeSlugMatches = true;

  const actualNewNode = decided.new_node_id ? canonicalNodeMap.get(decided.new_node_id) : null;
  const actualNewNodeSlug = actualNewNode ? actualNewNode.slug : null;

  if (caseData.expected_new_node_slug && decided.verdict !== 'shield') {
    nodeSlugMatches = actualNewNodeSlug === caseData.expected_new_node_slug;
  }

  const matched = verdictMatches && nodeSlugMatches;

  return {
    case_id: filename.replace(/\.json$/, ''),
    filename,
    case_data: caseData,
    actual_verdict: decided.verdict,
    actual_new_node_slug: actualNewNodeSlug,
    matched,
    notes: caseData.notes,
    llm_reasoning: decided.reasoning,
    downgrade_reason: decided.downgrade_reason,
    latency_ms: latencyMs,
  };
}

/**
 * Runs the full golden evaluation set and generates an EvalRunReport.
 */
export async function runEvaluation(options?: EvalOptions): Promise<EvalRunReport> {
  const rootDir = process.cwd();
  const goldenDir = options?.goldenDir || path.resolve(rootDir, 'evals', 'golden');
  const resultsDir = options?.resultsDir || path.resolve(rootDir, 'evals', 'results');

  // 1. Resolve Provider
  let provider: LLMProvider;
  let providerName = options?.providerName;

  if (!providerName) {
    const envProvider = process.env.LLM_PROVIDER;
    if (envProvider && ['openai', 'anthropic', 'gemini'].includes(envProvider)) {
      providerName = envProvider as any;
    } else {
      providerName = 'mock';
    }
  }

  if (providerName === 'mock') {
    provider = new MockProvider();
  } else {
    provider = getLLMProvider();
  }

  // 2. Load Cases
  const cases = loadGoldenCases(goldenDir);
  if (cases.length === 0) {
    throw new Error(`No valid golden cases found in: ${goldenDir}`);
  }

  // 3. Execute all cases
  const results: EvalCaseResult[] = [];
  const matrix: ConfusionMatrix = {
    shield: { shield: 0, injection: 0, override: 0 },
    injection: { shield: 0, injection: 0, override: 0 },
    override: { shield: 0, injection: 0, override: 0 },
  };

  const perVerdictStats = {
    shield: { total: 0, matched: 0, pct: 0 },
    injection: { total: 0, matched: 0, pct: 0 },
    override: { total: 0, matched: 0, pct: 0 },
  };

  const disagreements: EvalCaseDisagreement[] = [];

  for (const c of cases) {
    const result = await executeCase(c, provider);
    results.push(result);

    const exp = result.case_data.expected_verdict;
    const act = result.actual_verdict;

    // Update confusion matrix
    matrix[exp][act] += 1;

    // Update per-verdict count
    perVerdictStats[exp].total += 1;
    if (result.matched) {
      perVerdictStats[exp].matched += 1;
    } else {
      disagreements.push({
        case_id: result.case_id,
        filename: result.filename,
        news_url: result.case_data.news_url,
        expected_verdict: exp,
        actual_verdict: act,
        expected_new_node_slug: result.case_data.expected_new_node_slug,
        actual_new_node_slug: result.actual_new_node_slug,
        notes: result.notes,
        llm_reasoning: result.llm_reasoning,
        downgrade_reason: result.downgrade_reason,
      });
    }
  }

  // Compute percentages
  const totalCases = results.length;
  const matchedCases = results.filter((r) => r.matched).length;
  const overallAgreementPct = totalCases > 0 ? (matchedCases / totalCases) * 100 : 0;

  for (const v of ['shield', 'injection', 'override'] as const) {
    const s = perVerdictStats[v];
    s.pct = s.total > 0 ? (s.matched / s.total) * 100 : 0;
  }

  const modelInfo = (provider as any).getModelInfo?.() || {
    fastModel: (provider as any).fastModel || process.env.LLM_MODEL_FAST || 'mock-fast-model',
    strongModel: (provider as any).strongModel || process.env.LLM_MODEL_STRONG || 'mock-strong-model',
  };

  const report: EvalRunReport = {
    timestamp: new Date().toISOString(),
    provider: providerName || 'mock',
    models: {
      fast: modelInfo.fastModel,
      strong: modelInfo.strongModel,
    },
    prompt_versions: {
      verdict_analysis: verdictPrompt.version,
    },
    total_cases: totalCases,
    matched_cases: matchedCases,
    overall_agreement_pct: Math.round(overallAgreementPct * 10) / 10,
    per_verdict_agreement: perVerdictStats,
    confusion_matrix: matrix,
    disagreements,
    results,
  };

  // 4. Save results to /evals/results
  try {
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }
    const safeDate = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `run-${safeDate}.json`;
    const runPath = path.join(resultsDir, filename);
    const latestPath = path.join(resultsDir, 'latest.json');

    const jsonStr = JSON.stringify(report, null, 2);
    fs.writeFileSync(runPath, jsonStr, 'utf-8');
    fs.writeFileSync(latestPath, jsonStr, 'utf-8');
  } catch (err) {
    console.warn('[eval-harness] Warning: Could not write eval results to disk:', err);
  }

  return report;
}

/**
 * Formats a terminal-friendly ASCII summary report.
 */
export function formatEvalReport(report: EvalRunReport): string {
  const lines: string[] = [];
  const divider = '─'.repeat(72);
  const doubleDivider = '═'.repeat(72);

  lines.push(doubleDivider);
  lines.push(` ATLAS.AI RED BUTTON VERDICT EVALUATION REPORT`);
  lines.push(doubleDivider);
  lines.push(` Date:            ${report.timestamp}`);
  lines.push(` Provider:        ${report.provider.toUpperCase()}`);
  lines.push(` Strong Model:    ${report.models.strong}`);
  lines.push(` Fast Model:      ${report.models.fast}`);
  lines.push(` Verdict Prompt:  v${report.prompt_versions.verdict_analysis}`);
  lines.push(` Total Cases:     ${report.total_cases}`);
  lines.push(divider);

  // Overall Agreement
  const passedGate = report.overall_agreement_pct >= 90;
  const statusBadge = passedGate ? '✓ PASSED (>= 90%)' : '✗ FAILED (< 90%)';

  lines.push(` OVERALL AGREEMENT:  ${report.overall_agreement_pct}%  (${report.matched_cases}/${report.total_cases})  [${statusBadge}]`);
  lines.push(divider);

  // Per Verdict Breakdown
  lines.push(' PER-VERDICT AGREEMENT:');
  const shield = report.per_verdict_agreement.shield;
  const injection = report.per_verdict_agreement.injection;
  const override = report.per_verdict_agreement.override;

  lines.push(
    `   • SHIELD:     ${String(shield.pct.toFixed(1)).padStart(5)}%  (${shield.matched}/${shield.total})`,
  );
  lines.push(
    `   • INJECTION:  ${String(injection.pct.toFixed(1)).padStart(5)}%  (${injection.matched}/${injection.total})`,
  );
  lines.push(
    `   • OVERRIDE:   ${String(override.pct.toFixed(1)).padStart(5)}%  (${override.matched}/${override.total})`,
  );
  lines.push(divider);

  // Confusion Matrix
  lines.push(' CONFUSION MATRIX (Expected Rows vs Predicted Columns):');
  lines.push('                      Pred SHIELD    Pred INJECTION    Pred OVERRIDE');
  const cm = report.confusion_matrix;
  lines.push(
    `   Exp SHIELD:            ${String(cm.shield.shield).padStart(4)}            ${String(cm.shield.injection).padStart(4)}             ${String(cm.shield.override).padStart(4)}`,
  );
  lines.push(
    `   Exp INJECTION:         ${String(cm.injection.shield).padStart(4)}            ${String(cm.injection.injection).padStart(4)}             ${String(cm.injection.override).padStart(4)}`,
  );
  lines.push(
    `   Exp OVERRIDE:          ${String(cm.override.shield).padStart(4)}            ${String(cm.override.injection).padStart(4)}             ${String(cm.override.override).padStart(4)}`,
  );
  lines.push(divider);

  // Disagreements
  if (report.disagreements.length === 0) {
    lines.push(' DISAGREEMENTS: None! 100% agreement with editor-labeled golden set.');
  } else {
    lines.push(` DISAGREEMENTS (${report.disagreements.length}):`);
    report.disagreements.forEach((d, idx) => {
      lines.push(`   [${idx + 1}] Case: ${d.filename}`);
      lines.push(`       Expected: ${d.expected_verdict.toUpperCase()}${d.expected_new_node_slug ? ` (${d.expected_new_node_slug})` : ''}`);
      lines.push(`       Actual:   ${d.actual_verdict.toUpperCase()}${d.actual_new_node_slug ? ` (${d.actual_new_node_slug})` : ''}`);
      if (d.downgrade_reason) lines.push(`       Downgrade: ${d.downgrade_reason}`);
      lines.push(`       Notes:    ${d.notes}`);
    });
  }
  lines.push(doubleDivider);

  return lines.join('\n');
}
