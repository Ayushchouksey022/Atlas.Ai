import type { GoldenSetCase, VerdictType } from '@repo/schemas';

export interface ConfusionMatrix {
  // Rows: Expected, Columns: Predicted
  shield: { shield: number; injection: number; override: number };
  injection: { shield: number; injection: number; override: number };
  override: { shield: number; injection: number; override: number };
}

export interface EvalCaseDisagreement {
  case_id: string;
  filename: string;
  news_url: string;
  expected_verdict: VerdictType;
  actual_verdict: VerdictType;
  expected_new_node_slug?: string | null;
  actual_new_node_slug?: string | null;
  notes: string;
  llm_reasoning: string;
  downgrade_reason?: string;
}

export interface EvalCaseResult {
  case_id: string;
  filename: string;
  case_data: GoldenSetCase;
  actual_verdict: VerdictType;
  actual_new_node_slug?: string | null;
  matched: boolean;
  notes: string;
  llm_reasoning: string;
  downgrade_reason?: string;
  latency_ms: number;
}

export interface EvalRunReport {
  timestamp: string;
  provider: string;
  models: {
    fast: string;
    strong: string;
  };
  prompt_versions: {
    verdict_analysis: string;
  };
  total_cases: number;
  matched_cases: number;
  overall_agreement_pct: number;
  per_verdict_agreement: {
    shield: { total: number; matched: number; pct: number };
    injection: { total: number; matched: number; pct: number };
    override: { total: number; matched: number; pct: number };
  };
  confusion_matrix: ConfusionMatrix;
  disagreements: EvalCaseDisagreement[];
  results: EvalCaseResult[];
}

export interface EvalOptions {
  providerName?: 'mock' | 'openai' | 'anthropic' | 'gemini';
  goldenDir?: string;
  resultsDir?: string;
  gate?: boolean;
  minAgreementPct?: number; // default: 90
  verbose?: boolean;
}
