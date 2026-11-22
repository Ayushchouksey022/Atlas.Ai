import { describe, it, expect } from 'vitest';
import {
  decideVerdict,
  computePlacement,
  computeCacheKey,
  computeExperienceBucket,
  type VerdictContext,
} from './verdict';
import type {
  CanonicalNode,
  CanonicalEdge,
  UserNode,
  Roadmap,
  VerdictOutput,
} from '@repo/schemas';

describe('@repo/graph — Verdict Engine & Deterministic Decision Rules', () => {
  const domainId = '00000000-0000-0000-0000-000000000001';
  const userId = 'user-0000-0000-0000-000000000001';

  // Canonical fixtures
  const nodeGit: CanonicalNode = {
    id: '10000000-0000-0000-0000-000000000001',
    domain_id: domainId,
    slug: 'git-basics',
    name: 'Git Basics',
    description: 'Version control basics',
    node_type: 'skill',
    level: 0,
    area: 'editors-ides',
    status: 'approved',
    external_url: null,
    version_tag: null,
  };

  const nodeVscode: CanonicalNode = {
    id: '10000000-0000-0000-0000-000000000002',
    domain_id: domainId,
    slug: 'vscode-editor',
    name: 'VS Code',
    description: 'Popular extensible code editor',
    node_type: 'tool',
    level: 1,
    area: 'editors-ides',
    status: 'approved',
    external_url: null,
    version_tag: null,
  };

  const nodeCursor: CanonicalNode = {
    id: '10000000-0000-0000-0000-000000000003',
    domain_id: domainId,
    slug: 'cursor-ai-editor',
    name: 'Cursor AI Editor',
    description: 'AI-first IDE with agentic mode',
    node_type: 'tool',
    level: 2,
    area: 'editors-ides',
    status: 'approved',
    external_url: null,
    version_tag: null,
  };

  const nodeCopilot: CanonicalNode = {
    id: '10000000-0000-0000-0000-000000000004',
    domain_id: domainId,
    slug: 'copilot-autocomplete',
    name: 'GitHub Copilot',
    description: 'AI code completion tool',
    node_type: 'tool',
    level: 1,
    area: 'ai-assistants',
    status: 'approved',
    external_url: null,
    version_tag: null,
  };

  const nodeUnapproved: CanonicalNode = {
    id: '10000000-0000-0000-0000-000000000005',
    domain_id: domainId,
    slug: 'experimental-alpha-tool',
    name: 'Experimental Alpha Tool',
    description: 'Pending review in editorial queue',
    node_type: 'tool',
    level: 2,
    area: 'agents-automation',
    status: 'draft',
    external_url: null,
    version_tag: null,
  };

  const canonicalNodes: CanonicalNode[] = [
    nodeGit,
    nodeVscode,
    nodeCursor,
    nodeCopilot,
    nodeUnapproved,
  ];

  const canonicalEdges: CanonicalEdge[] = [
    {
      id: 'e1',
      from_node: nodeGit.id,
      to_node: nodeVscode.id,
    },
    {
      id: 'e2',
      from_node: nodeVscode.id,
      to_node: nodeCursor.id,
    },
    {
      id: 'e3',
      from_node: nodeGit.id,
      to_node: nodeCopilot.id,
    },
  ];

  // Approved supersedes: VS Code -> Cursor
  const approvedSupersedes = [
    {
      old_node_id: nodeVscode.id,
      new_node_id: nodeCursor.id,
      old_slug: nodeVscode.slug,
      new_slug: nodeCursor.slug,
    },
  ];

  // Helper to create user roadmap
  function createRoadmap(userNodes: Array<{ node: CanonicalNode; status: UserNode['status'] }>): Roadmap {
    return {
      user_id: userId,
      domain_id: domainId,
      nodes: userNodes.map((un) => un.node),
      edges: canonicalEdges.filter(
        (e) =>
          userNodes.some((un) => un.node.id === e.from_node) &&
          userNodes.some((un) => un.node.id === e.to_node),
      ),
      user_nodes: userNodes.map((un, idx) => ({
        id: `un-${idx + 1}`,
        user_id: userId,
        node_id: un.node.id,
        status: un.status,
        origin: 'baseline',
        fast_track: false,
        replaced_node_id: null,
        completed_at: un.status === 'completed' ? new Date().toISOString() : null,
        version: 1,
        canonical_node: un.node,
      })),
    };
  }

  // -------------------------------------------------------------------------
  // Rule 1: SHIELD DECISION RULES
  // -------------------------------------------------------------------------
  describe('Rule 1: Shield Decision Rules & Downgrades', () => {
    it('returns Shield when domain does not match', () => {
      const roadmap = createRoadmap([{ node: nodeGit, status: 'completed' }]);
      const context: VerdictContext = {
        domainMatches: false,
        impactScore: 8,
        canonicalNodes,
        canonicalEdges,
        supersedes: approvedSupersedes,
        roadmap,
      };

      const llmOutput: VerdictOutput = {
        verdict: 'injection',
        new_node_slug: 'copilot-autocomplete',
        target_node_slug: null,
        insert_after_slugs: ['git-basics'],
        reasoning: 'Adopt Copilot for coding.',
        confidence: 0.95,
      };

      const result = decideVerdict(llmOutput, context);
      expect(result.verdict).toBe('shield');
      expect(result.downgraded_from).toBe('injection');
      expect(result.downgrade_reason).toBe('DOMAIN_MISMATCH');
    });

    it('returns Shield when impact score < 6', () => {
      const roadmap = createRoadmap([{ node: nodeGit, status: 'completed' }]);
      const context: VerdictContext = {
        domainMatches: true,
        impactScore: 5, // below threshold
        canonicalNodes,
        canonicalEdges,
        supersedes: approvedSupersedes,
        roadmap,
      };

      const llmOutput: VerdictOutput = {
        verdict: 'injection',
        new_node_slug: 'copilot-autocomplete',
        target_node_slug: null,
        insert_after_slugs: ['git-basics'],
        reasoning: 'Minor update to Copilot.',
        confidence: 0.95,
      };

      const result = decideVerdict(llmOutput, context);
      expect(result.verdict).toBe('shield');
      expect(result.downgraded_from).toBe('injection');
      expect(result.downgrade_reason).toBe('LOW_IMPACT_SCORE');
    });

    it('returns Shield and flags for editor review when confidence < 0.6', () => {
      const roadmap = createRoadmap([{ node: nodeGit, status: 'completed' }]);
      const context: VerdictContext = {
        domainMatches: true,
        impactScore: 8,
        canonicalNodes,
        canonicalEdges,
        supersedes: approvedSupersedes,
        roadmap,
      };

      const llmOutput: VerdictOutput = {
        verdict: 'injection',
        new_node_slug: 'copilot-autocomplete',
        target_node_slug: null,
        insert_after_slugs: ['git-basics'],
        reasoning: 'Maybe inject Copilot.',
        confidence: 0.55, // below 0.6 threshold
      };

      const result = decideVerdict(llmOutput, context);
      expect(result.verdict).toBe('shield');
      expect(result.flagged_for_editor).toBe(true);
      expect(result.downgrade_reason).toBe('LOW_CONFIDENCE');
    });

    it('returns Shield when proposed new node is not approved (draft/deprecated)', () => {
      const roadmap = createRoadmap([{ node: nodeGit, status: 'completed' }]);
      const context: VerdictContext = {
        domainMatches: true,
        impactScore: 9,
        canonicalNodes,
        canonicalEdges,
        supersedes: approvedSupersedes,
        roadmap,
      };

      const llmOutput: VerdictOutput = {
        verdict: 'injection',
        new_node_slug: 'experimental-alpha-tool', // status: 'draft'
        target_node_slug: null,
        insert_after_slugs: [],
        reasoning: 'Inject unapproved tool.',
        confidence: 0.9,
      };

      const result = decideVerdict(llmOutput, context);
      expect(result.verdict).toBe('shield');
      expect(result.flagged_for_editor).toBe(true);
      expect(result.downgrade_reason).toBe('NODE_NOT_APPROVED');
    });

    it('returns Shield when referencing unknown slugs', () => {
      const roadmap = createRoadmap([{ node: nodeGit, status: 'completed' }]);
      const context: VerdictContext = {
        domainMatches: true,
        impactScore: 8,
        canonicalNodes,
        canonicalEdges,
        supersedes: approvedSupersedes,
        roadmap,
      };

      const llmOutput: VerdictOutput = {
        verdict: 'injection',
        new_node_slug: 'non-existent-hallucinated-tool',
        target_node_slug: null,
        insert_after_slugs: [],
        reasoning: 'Inject nonexistent tool.',
        confidence: 0.9,
      };

      const result = decideVerdict(llmOutput, context);
      expect(result.verdict).toBe('shield');
      expect(result.flagged_for_editor).toBe(true);
      expect(result.downgrade_reason).toBe('UNKNOWN_SLUG');
    });
  });

  // -------------------------------------------------------------------------
  // Rule 2: OVERRIDE DECISION RULES
  // -------------------------------------------------------------------------
  describe('Rule 2: Override Decision Rules & Downgrades', () => {
    it('approves Override when target node is in roadmap and approved supersedes link exists', () => {
      // Roadmap contains VS Code (active)
      const roadmap = createRoadmap([
        { node: nodeGit, status: 'completed' },
        { node: nodeVscode, status: 'in_progress' },
      ]);

      const context: VerdictContext = {
        domainMatches: true,
        impactScore: 8,
        canonicalNodes,
        canonicalEdges,
        supersedes: approvedSupersedes, // VS Code -> Cursor
        roadmap,
      };

      const llmOutput: VerdictOutput = {
        verdict: 'override',
        target_node_slug: 'vscode-editor',
        new_node_slug: 'cursor-ai-editor',
        insert_after_slugs: [],
        reasoning: 'Cursor supersedes VS Code with native AI agents.',
        confidence: 0.92,
      };

      const result = decideVerdict(llmOutput, context);
      expect(result.verdict).toBe('override');
      expect(result.target_node_id).toBe(nodeVscode.id);
      expect(result.new_node_id).toBe(nodeCursor.id);
      expect(result.flagged_for_editor).toBe(false);
    });

    it('downgrades Override to Shield when target node is not in user roadmap', () => {
      // User only knows Git, does not use VS Code
      const roadmap = createRoadmap([{ node: nodeGit, status: 'completed' }]);

      const context: VerdictContext = {
        domainMatches: true,
        impactScore: 8,
        canonicalNodes,
        canonicalEdges,
        supersedes: approvedSupersedes,
        roadmap,
      };

      const llmOutput: VerdictOutput = {
        verdict: 'override',
        target_node_slug: 'vscode-editor',
        new_node_slug: 'cursor-ai-editor',
        insert_after_slugs: [],
        reasoning: 'Swap VS Code for Cursor.',
        confidence: 0.9,
      };

      const result = decideVerdict(llmOutput, context);
      expect(result.verdict).toBe('shield');
      expect(result.downgraded_from).toBe('override');
      expect(result.downgrade_reason).toBe('TARGET_NOT_IN_ROADMAP');
    });

    it('downgrades Override to Shield when target node is already archived', () => {
      // Target node already archived
      const roadmap = createRoadmap([
        { node: nodeGit, status: 'completed' },
        { node: nodeVscode, status: 'archived' },
      ]);

      const context: VerdictContext = {
        domainMatches: true,
        impactScore: 8,
        canonicalNodes,
        canonicalEdges,
        supersedes: approvedSupersedes,
        roadmap,
      };

      const llmOutput: VerdictOutput = {
        verdict: 'override',
        target_node_slug: 'vscode-editor',
        new_node_slug: 'cursor-ai-editor',
        insert_after_slugs: [],
        reasoning: 'Swap archived node.',
        confidence: 0.9,
      };

      const result = decideVerdict(llmOutput, context);
      expect(result.verdict).toBe('shield');
      expect(result.downgraded_from).toBe('override');
      expect(result.downgrade_reason).toBe('TARGET_ALREADY_ARCHIVED');
    });

    it('downgrades Override to Shield when no approved supersedes link exists', () => {
      const roadmap = createRoadmap([
        { node: nodeGit, status: 'completed' },
        { node: nodeVscode, status: 'completed' },
      ]);

      const context: VerdictContext = {
        domainMatches: true,
        impactScore: 8,
        canonicalNodes,
        canonicalEdges,
        supersedes: [], // empty: NO approved supersedes link!
        roadmap,
      };

      const llmOutput: VerdictOutput = {
        verdict: 'override',
        target_node_slug: 'vscode-editor',
        new_node_slug: 'copilot-autocomplete', // Copilot does not supersede VS Code
        insert_after_slugs: [],
        reasoning: 'Replace editor with autocomplete.',
        confidence: 0.9,
      };

      const result = decideVerdict(llmOutput, context);
      expect(result.verdict).toBe('shield');
      expect(result.flagged_for_editor).toBe(true);
      expect(result.downgrade_reason).toBe('NO_APPROVED_SUPERSEDES_LINK');
    });

    it('downgrades Override to Shield when new node is already active in user roadmap', () => {
      const roadmap = createRoadmap([
        { node: nodeGit, status: 'completed' },
        { node: nodeVscode, status: 'completed' },
        { node: nodeCursor, status: 'completed' }, // user already has Cursor!
      ]);

      const context: VerdictContext = {
        domainMatches: true,
        impactScore: 8,
        canonicalNodes,
        canonicalEdges,
        supersedes: approvedSupersedes,
        roadmap,
      };

      const llmOutput: VerdictOutput = {
        verdict: 'override',
        target_node_slug: 'vscode-editor',
        new_node_slug: 'cursor-ai-editor',
        insert_after_slugs: [],
        reasoning: 'Swap VS Code for Cursor.',
        confidence: 0.9,
      };

      const result = decideVerdict(llmOutput, context);
      expect(result.verdict).toBe('shield');
      expect(result.downgrade_reason).toBe('NEW_NODE_ALREADY_IN_ROADMAP');
    });
  });

  // -------------------------------------------------------------------------
  // Rule 3: INJECTION DECISION RULES
  // -------------------------------------------------------------------------
  describe('Rule 3: Injection Decision Rules & Downgrades', () => {
    it('approves Injection when node is approved, not in roadmap, and impact score >= 7', () => {
      const roadmap = createRoadmap([{ node: nodeGit, status: 'completed' }]);

      const context: VerdictContext = {
        domainMatches: true,
        impactScore: 8, // >= 7
        canonicalNodes,
        canonicalEdges,
        supersedes: approvedSupersedes,
        roadmap,
      };

      const llmOutput: VerdictOutput = {
        verdict: 'injection',
        new_node_slug: 'copilot-autocomplete',
        target_node_slug: null,
        insert_after_slugs: ['git-basics'],
        reasoning: 'Adopt Copilot for coding assistance.',
        confidence: 0.95,
      };

      const result = decideVerdict(llmOutput, context);
      expect(result.verdict).toBe('injection');
      expect(result.new_node_id).toBe(nodeCopilot.id);
      expect(result.insert_after_node_ids).toEqual([nodeGit.id]);
      expect(result.flagged_for_editor).toBe(false);
    });

    it('downgrades Injection to Shield when impact score is 6 (< 7 required for injection)', () => {
      const roadmap = createRoadmap([{ node: nodeGit, status: 'completed' }]);

      const context: VerdictContext = {
        domainMatches: true,
        impactScore: 6, // 6 is sufficient for shield evaluation, but injection requires >= 7 per PRD 9.2
        canonicalNodes,
        canonicalEdges,
        supersedes: approvedSupersedes,
        roadmap,
      };

      const llmOutput: VerdictOutput = {
        verdict: 'injection',
        new_node_slug: 'copilot-autocomplete',
        target_node_slug: null,
        insert_after_slugs: ['git-basics'],
        reasoning: 'Inject Copilot.',
        confidence: 0.9,
      };

      const result = decideVerdict(llmOutput, context);
      expect(result.verdict).toBe('shield');
      expect(result.downgraded_from).toBe('injection');
      expect(result.downgrade_reason).toBe('INJECTION_IMPACT_TOO_LOW');
    });

    it('downgrades Injection to Shield when node is already in user roadmap', () => {
      const roadmap = createRoadmap([
        { node: nodeGit, status: 'completed' },
        { node: nodeCopilot, status: 'in_progress' }, // already in roadmap!
      ]);

      const context: VerdictContext = {
        domainMatches: true,
        impactScore: 8,
        canonicalNodes,
        canonicalEdges,
        supersedes: approvedSupersedes,
        roadmap,
      };

      const llmOutput: VerdictOutput = {
        verdict: 'injection',
        new_node_slug: 'copilot-autocomplete',
        target_node_slug: null,
        insert_after_slugs: ['git-basics'],
        reasoning: 'Inject Copilot.',
        confidence: 0.9,
      };

      const result = decideVerdict(llmOutput, context);
      expect(result.verdict).toBe('shield');
      expect(result.downgraded_from).toBe('injection');
      expect(result.downgrade_reason).toBe('ALREADY_IN_ROADMAP');
    });
  });

  // -------------------------------------------------------------------------
  // Placement Rule & Cycle Prevention
  // -------------------------------------------------------------------------
  describe('Placement Rule & Cycle Prevention', () => {
    it('computes placement after the deepest satisfied prerequisite in user roadmap', () => {
      const roadmap = createRoadmap([
        { node: nodeGit, status: 'completed' },
        { node: nodeVscode, status: 'completed' },
      ]);

      // nodeCursor depends on nodeVscode (which depends on nodeGit)
      const placement = computePlacement(nodeCursor.id, canonicalEdges, roadmap);
      expect(placement.wouldCycle).toBe(false);
      // Deepest satisfied prerequisite is nodeVscode
      expect(placement.insertAfterNodeIds).toEqual([nodeVscode.id]);
    });

    it('detects and rejects placement that would create a cycle', () => {
      // In this setup, roadmap already has a reversed edge from nodeCursor -> nodeGit
      const reverseEdge: CanonicalEdge = {
        id: 'rev-1',
        from_node: nodeCursor.id,
        to_node: nodeGit.id,
      };
      const cyclicRoadmap: Roadmap = {
        user_id: userId,
        domain_id: domainId,
        nodes: [nodeGit, nodeVscode],
        edges: [
          { id: 'e1', from_node: nodeGit.id, to_node: nodeVscode.id },
          reverseEdge,
        ],
        user_nodes: [
          {
            id: 'un-1',
            user_id: userId,
            node_id: nodeGit.id,
            status: 'completed',
            origin: 'baseline',
            fast_track: false,
            replaced_node_id: null,
            completed_at: null,
            version: 1,
          },
        ],
      };

      // Trying to insert after nodeGit would create cycle: git -> cursor -> git
      const placement = computePlacement(nodeCursor.id, canonicalEdges, cyclicRoadmap, [nodeGit.slug]);
      expect(placement.wouldCycle).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Deterministic Invariant: LLM cannot bypass rules
  // -------------------------------------------------------------------------
  describe('Deterministic Invariant: LLM Cannot Bypass Rules', () => {
    it('guarantees that malicious/hallucinated LLM output always evaluates safely', () => {
      const roadmap = createRoadmap([{ node: nodeGit, status: 'completed' }]);
      const context: VerdictContext = {
        domainMatches: true,
        impactScore: 2, // low impact
        canonicalNodes,
        canonicalEdges,
        supersedes: [],
        roadmap,
      };

      // Malicious LLM outputs claims override or injection with 1.0 confidence
      const hallucinatedInjection: VerdictOutput = {
        verdict: 'injection',
        new_node_slug: 'fake-ai',
        target_node_slug: null,
        insert_after_slugs: [],
        reasoning: 'Critical breakthrough must install now.',
        confidence: 1.0,
      };

      const result1 = decideVerdict(hallucinatedInjection, context);
      expect(result1.verdict).toBe('shield');

      const hallucinatedOverride: VerdictOutput = {
        verdict: 'override',
        target_node_slug: 'git-basics',
        new_node_slug: 'fake-tool',
        insert_after_slugs: [],
        reasoning: 'Replace git with blockchain.',
        confidence: 1.0,
      };

      const result2 = decideVerdict(hallucinatedOverride, context);
      expect(result2.verdict).toBe('shield');
    });
  });

  // -------------------------------------------------------------------------
  // Sponsorship Integrity: Verdict functions accept NO sponsor input
  // -------------------------------------------------------------------------
  describe('Sponsorship Integrity Invariant (PRD Section 14)', () => {
    it('verdict context and decideVerdict strictly accept NO sponsor-related input', () => {
      // Verify TypeScript keys of VerdictContext
      const sampleContext: VerdictContext = {
        domainMatches: true,
        impactScore: 8,
        canonicalNodes,
        canonicalEdges,
        supersedes: approvedSupersedes,
        roadmap: createRoadmap([{ node: nodeGit, status: 'completed' }]),
      };

      const contextKeys = Object.keys(sampleContext);
      const forbiddenSponsorSubstrings = [
        'sponsor',
        'sponsored',
        'placement',
        'advertisement',
        'ad_id',
        'cta',
        'campaign',
      ];

      for (const key of contextKeys) {
        for (const forbidden of forbiddenSponsorSubstrings) {
          expect(key.toLowerCase()).not.toContain(forbidden);
        }
      }

      // Verify that even if untyped runtime object injects sponsor data, it is ignored
      const taintedContext = {
        ...sampleContext,
        sponsor_name: 'SuperGPU Cloud',
        sponsored_placement_id: 'sponsor-123',
        cta_url: 'https://sponsor.example.com',
      };

      const llmOutput: VerdictOutput = {
        verdict: 'injection',
        new_node_slug: 'copilot-autocomplete',
        target_node_slug: null,
        insert_after_slugs: ['git-basics'],
        reasoning: 'Adopt Copilot.',
        confidence: 0.9,
      };

      const result = decideVerdict(llmOutput, taintedContext as unknown as VerdictContext);
      expect(result.verdict).toBe('injection');
      // Result object has zero sponsor properties
      expect((result as unknown as Record<string, unknown>).sponsor_name).toBeUndefined();
      expect((result as unknown as Record<string, unknown>).sponsored_placement_id).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Cache Key & Experience Bucket Helpers
  // -------------------------------------------------------------------------
  describe('Cache Key & Experience Bucket Generation', () => {
    it('computes experience bucket accurately based on majority levels', () => {
      expect(computeExperienceBucket(null)).toBe('beginner');
      expect(computeExperienceBucket({})).toBe('beginner');
      expect(computeExperienceBucket({ area1: 'expert', area2: 'expert', area3: 'working' })).toBe('expert');
      expect(computeExperienceBucket({ area1: 'working', area2: 'working', area3: 'expert' })).toBe('working');
      expect(computeExperienceBucket({ area1: 'beginner', area2: 'beginner' })).toBe('beginner');
    });

    it('generates deterministic cache keys invariant to node ID sorting', () => {
      const newsId = '30000000-0000-0000-0000-000000000001';
      const key1 = computeCacheKey(newsId, ['node-b', 'node-a', 'node-c'], 'expert');
      const key2 = computeCacheKey(newsId, ['node-a', 'node-c', 'node-b'], 'expert');
      expect(key1).toBe(key2);

      const key3 = computeCacheKey(newsId, ['node-a', 'node-b'], 'beginner');
      expect(key1).not.toBe(key3);
    });
  });
});
