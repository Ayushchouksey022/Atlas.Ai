import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { loadGoldenCases, executeCase, runEvaluation } from './harness';
import { MockProvider } from '../packages/llm/src/providers/mock';
import type { EvalOptions } from '../packages/llm/src/evals/types';

describe('Prompt 15: Evaluation Harness & Golden Set Runner', () => {
  const rootDir = process.cwd();
  const goldenDir = path.resolve(rootDir, 'evals', 'golden');

  it('1. loads all 18 starter golden cases and validates PRD Appendix B schema', () => {
    const cases = loadGoldenCases(goldenDir);
    expect(cases.length).toBeGreaterThanOrEqual(15);
    expect(cases.length).toBe(18);

    for (const c of cases) {
      expect(c.caseData.news_url).toMatch(/^https?:\/\//);
      expect(c.caseData.user_profile_fixture).toBeTruthy();
      expect(['shield', 'injection', 'override']).toContain(c.caseData.expected_verdict);
      expect(c.caseData.notes).toBeTruthy();
    }
  });

  it('2. executes a single golden case through retrieval + prompt + decideVerdict', async () => {
    const cases = loadGoldenCases(goldenDir);
    const provider = new MockProvider();

    // Pick a test case (Claude Code injection)
    const claudeCase = cases.find((c) => c.filename === 'case-10-claude-code-cli.json');
    expect(claudeCase).toBeDefined();

    const result = await executeCase(claudeCase!, provider);
    expect(result.actual_verdict).toBe('injection');
    expect(result.matched).toBe(true);
    expect(result.actual_new_node_slug).toBe('claude-code');
    expect(result.latency_ms).toBeGreaterThanOrEqual(0);
  });

  it('3. runs full evaluation across all 18 cases with MockProvider, achieving >= 90% agreement', async () => {
    const options: EvalOptions = {
      providerName: 'mock',
      goldenDir,
    };

    const report = await runEvaluation(options);

    // Verify overall agreement >= 90%
    expect(report.total_cases).toBe(18);
    expect(report.overall_agreement_pct).toBeGreaterThanOrEqual(90);

    // Verify confusion matrix sums
    expect(
      report.confusion_matrix.shield.shield +
        report.confusion_matrix.shield.injection +
        report.confusion_matrix.shield.override,
    ).toBe(9);
    expect(
      report.confusion_matrix.injection.shield +
        report.confusion_matrix.injection.injection +
        report.confusion_matrix.injection.override,
    ).toBe(5);
    expect(
      report.confusion_matrix.override.shield +
        report.confusion_matrix.override.injection +
        report.confusion_matrix.override.override,
    ).toBe(4);
  });
});
