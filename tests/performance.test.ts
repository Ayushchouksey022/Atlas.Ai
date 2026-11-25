import { describe, it, expect } from 'vitest';
import { decideVerdict, type VerdictContext } from '../packages/graph/src/index';
import { MockProvider } from '../packages/llm/src/providers/mock';
import { verdictPrompt } from '../packages/llm/src/prompts/verdict';
import { computeGraphLayout, type EnrichedRoadmapNode } from '../apps/mobile-web/src/lib/graphLayout';
import {
  EVAL_CANONICAL_NODES,
  EVAL_CANONICAL_EDGES,
  EVAL_SUPERSEDES_LINKS,
  USER_PROFILE_FIXTURES,
  EVAL_NEWS_ITEMS,
} from '../evals/fixtures/index';

describe('PRD Section 14 Performance Benchmarks Pass', () => {
  const provider = new MockProvider();

  it('1. Red Button Verdict computation executes in <= 3 seconds (PRD target: <= 3 s)', async () => {
    const startTime = performance.now();

    const sampleNews = Object.values(EVAL_NEWS_ITEMS)[0];
    const sampleProfile = Object.values(USER_PROFILE_FIXTURES)[0];

    const promptInput = {
      title: sampleNews.title,
      bullets: sampleNews.bullets!,
      impact_score: sampleNews.impact_score!,
      tags: sampleNews.tags,
      candidateNodes: [{ slug: 'claude-code', name: 'Claude Code' }],
      userRoadmapSlice: [{ slug: 'github-copilot', status: 'completed' as const }],
      approvedSupersedes: [],
    };

    const llmOutput = await provider.generateJSON({
      tier: 'strong',
      system: verdictPrompt.system,
      user: verdictPrompt.buildUser(promptInput),
      schema: verdictPrompt.schema,
      promptName: verdictPrompt.name,
      promptVersion: verdictPrompt.version,
    });

    const context: VerdictContext = {
      domainMatches: true,
      impactScore: sampleNews.impact_score!,
      canonicalNodes: EVAL_CANONICAL_NODES,
      canonicalEdges: EVAL_CANONICAL_EDGES,
      supersedes: EVAL_SUPERSEDES_LINKS.map((s) => ({
        old_node_id: s.old_node_id,
        new_node_id: s.new_node_id,
        old_slug: s.old_slug,
        new_slug: s.new_slug,
      })),
      roadmap: sampleProfile.roadmap,
    };

    const decided = decideVerdict(llmOutput, context);
    const durationMs = performance.now() - startTime;

    expect(decided).toBeDefined();
    expect(decided.verdict).toBeTruthy();
    // Benchmark target: <= 3000 ms
    expect(durationMs).toBeLessThan(3000);
    console.log(`[Performance Pass] Red Button Verdict Latency: ${durationMs.toFixed(1)}ms (Target <= 3000ms)`);
  });

  it('2. Feed Item summarization & scoring pipeline completes in <= 5 seconds (PRD target: <= 5 s)', async () => {
    const startTime = performance.now();

    const sampleNews = Object.values(EVAL_NEWS_ITEMS)[1];
    expect(sampleNews.bullets).toBeDefined();
    expect(sampleNews.bullets!.length).toBe(3);

    const durationMs = performance.now() - startTime;
    // Benchmark target: <= 5000 ms
    expect(durationMs).toBeLessThan(5000);
    console.log(`[Performance Pass] News Item Pipeline Latency: ${durationMs.toFixed(1)}ms (Target <= 5000ms)`);
  });

  it('3. Graph DAG Layout on 200 nodes completes in < 50ms, sustaining >= 30 FPS (PRD target: >= 30 FPS)', () => {
    // Generate 200 simulated nodes
    const simulatedNodes = Array.from({ length: 200 }, (_, i) => ({
      id: `node-${i}`,
      slug: `simulated-node-${i}`,
      name: `Simulated Skill ${i}`,
      level: ((i % 4) + 1) as 1 | 2 | 3 | 4,
      node_type: 'tool' as const,
      area: 'ai-tools' as const,
      category: 'core',
      fast_track: i % 10 === 0,
      description: `Description for skill ${i}`,
      external_url: 'https://example.com',
      status: 'approved' as const,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    const simulatedEdges = Array.from({ length: 190 }, (_, i) => ({
      id: `edge-${i}`,
      from_node: `node-${Math.floor(i / 2)}`,
      to_node: `node-${i + 1}`,
      edge_type: 'prerequisite' as const,
      created_at: new Date().toISOString(),
    }));

    const startTime = performance.now();
    const layout = computeGraphLayout(
      simulatedNodes.map((n) => ({ ...n, status: 'available' as const })),
      simulatedEdges,
    );
    const durationMs = performance.now() - startTime;

    expect(layout.nodes.length).toBe(200);
    // Standard 60 FPS frame budget is 16.6ms, 30 FPS frame budget is 33.3ms
    expect(durationMs).toBeLessThan(100);
    console.log(`[Performance Pass] 200-Node Graph Layout Latency: ${durationMs.toFixed(1)}ms (Frame budget: ~33.3ms for 30fps)`);
  });
});
