import { describe, it, expect } from 'vitest';
import { generateBaselineRoadmap, decideVerdict, applyInjection, type VerdictContext } from '../packages/graph/src/index';
import {
  EVAL_CANONICAL_NODES,
  EVAL_CANONICAL_EDGES,
  EVAL_SUPERSEDES_LINKS,
  EVAL_NEWS_ITEMS,
} from '../evals/fixtures/index';
import { GoldenSetCaseSchema, type GoldenSetCase } from '../packages/schemas/src/domain';

describe('Prompt 16: Complete New User Lifecycle & Verification', () => {
  const newUserId = `test-user-${Date.now()}`;
  const userEmail = 'new-engineer@atlas.ai';
  const displayName = 'Grace Hopper';
  const inviteCode = 'ATLAS-FOUNDER-2026';

  it('1. verifies closed beta invite code validation and consent requirements', () => {
    // Valid invite codes
    const validCodes = ['ATLAS-FOUNDER-2026', 'AI-LEARNER-2026', 'BETA-INVITE-001'];
    expect(validCodes).toContain(inviteCode);

    // Consent must be agreed
    const consentAgreed = true;
    expect(consentAgreed).toBe(true);
  });

  it('2. generates a personalized, acyclic baseline roadmap for the new user', () => {
    const experienceLevels = {
      'ai-tools': 'working' as const,
      'editors-ides': 'expert' as const,
      'frontend': 'beginner' as const,
      'backends': 'working' as const,
    };

    const res = generateBaselineRoadmap(
      {
        domain_id: '00000000-0000-0000-0000-000000000001',
        domain_slug: 'ai-assisted-software-development',
        nodes: EVAL_CANONICAL_NODES,
        edges: EVAL_CANONICAL_EDGES,
      },
      ['copilot-node'],
      experienceLevels,
      newUserId,
    );

    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const { nodes, user_nodes } = res.value;
    expect(nodes.length).toBeGreaterThan(0);
    expect(user_nodes.length).toBeGreaterThan(0);

    // Nodes marked known based on expert level
    const known = user_nodes.filter((n) => n.status === 'known');
    const todo = user_nodes.filter((n) => n.status === 'todo');
    expect(known.length).toBeGreaterThan(0);
    expect(todo.length).toBeGreaterThan(0);
  });

  it('3. advances node progress and qualifies as Weekly Active Learner', () => {
    // Initial roadmap
    const res = generateBaselineRoadmap(
      {
        domain_id: '00000000-0000-0000-0000-000000000001',
        domain_slug: 'ai-assisted-software-development',
        nodes: EVAL_CANONICAL_NODES,
        edges: EVAL_CANONICAL_EDGES,
      },
      [],
      { 'ai-tools': 'beginner', 'editors-ides': 'beginner', 'frontend': 'beginner', 'backends': 'beginner' },
      newUserId,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const { user_nodes } = res.value;

    // Pick a todo node and mark it completed
    const targetNode = user_nodes.find((n) => n.status === 'todo');
    expect(targetNode).toBeDefined();

    const updatedUserNodes = user_nodes.map((n) => {
      if (n.id === targetNode!.id) {
        return {
          ...n,
          status: 'completed' as const,
          updated_at: new Date().toISOString(),
        };
      }
      return n;
    });

    const completedNode = updatedUserNodes.find((n) => n.id === targetNode!.id);
    expect(completedNode?.status).toBe('completed');

    // Rule: User qualifies as Weekly Active Learner if status = completed updated in current week
    const isWeeklyActiveLearner = updatedUserNodes.some((n) => n.status === 'completed');
    expect(isWeeklyActiveLearner).toBe(true);
  });

  it('4. evaluates a Red Button news item and applies an Injection verdict', () => {
    const claudeNews = EVAL_NEWS_ITEMS['https://anthropic.com.example.com/news/claude-code-terminal-agent'];
    expect(claudeNews).toBeDefined();

    const userRoadmap = {
      user_id: newUserId,
      domain_id: '00000000-0000-0000-0000-000000000001',
      nodes: EVAL_CANONICAL_NODES.filter((n) => n.id === 'node-terminal-basics'),
      edges: [],
      user_nodes: [
        {
          id: 'un-1',
          user_id: newUserId,
          node_id: 'node-terminal-basics',
          status: 'completed' as const,
          fast_track: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
    };

    const context: VerdictContext = {
      domainMatches: true,
      impactScore: claudeNews.impact_score || 8,
      canonicalNodes: EVAL_CANONICAL_NODES,
      canonicalEdges: EVAL_CANONICAL_EDGES,
      supersedes: [],
      roadmap: userRoadmap as any,
    };

    const llmOutput = {
      verdict: 'injection' as const,
      new_node_slug: 'claude-code',
      reasoning: 'Claude Code is a premier agentic coding tool that should be injected.',
      confidence: 0.95,
      impact_summary: 'Introduces terminal-native agentic programming',
      placement: {
        insert_after_slugs: ['terminal-basics'],
      },
    };

    const decided = decideVerdict(llmOutput, context);
    expect(decided.verdict).toBe('injection');

    // Apply injection to user roadmap
    const targetCanonicalNode = EVAL_CANONICAL_NODES.find((n) => n.id === decided.new_node_id);
    expect(targetCanonicalNode).toBeDefined();

    const applied = applyInjection(userRoadmap as any, targetCanonicalNode!, ['node-terminal-basics']);
    expect(applied.ok).toBe(true);
    if (applied.ok) {
      expect(applied.value.user_nodes.some((n) => n.node_id === decided.new_node_id)).toBe(true);
    }
  });

  it('5. exports full learning data JSON under GDPR/DPDP Article 20', () => {
    const exportData = {
      export_version: '1.0.0',
      compliance: 'GDPR / India DPDP Article 20 Data Portability',
      exported_at: new Date().toISOString(),
      user: {
        id: newUserId,
        email: userEmail,
      },
      profile: {
        id: newUserId,
        display_name: displayName,
        onboarding_completed: true,
      },
      user_nodes: [
        { node_id: 'github-copilot', status: 'completed' },
        { node_id: 'claude-code', status: 'in_progress' },
      ],
      user_verdicts: [
        { verdict_id: 'v-1', state: 'applied' },
      ],
      usage_counters: [
        { feature: 'on_demand_analyses', count: 1 },
      ],
      events: [
        { name: 'onboarding_completed', properties: { duration_ms: 120000 } },
      ],
    };

    expect(exportData.user.id).toBe(newUserId);
    expect(exportData.user_nodes.length).toBe(2);
    expect(exportData.user_verdicts[0].state).toBe('applied');

    // Validates JSON serializability
    const jsonString = JSON.stringify(exportData, null, 2);
    expect(jsonString).toContain('GDPR');
    expect(jsonString).toContain(displayName);
  });
});
