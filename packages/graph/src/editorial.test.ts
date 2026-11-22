import { describe, it, expect } from 'vitest';
import type { CanonicalNode, CanonicalEdge } from '@repo/schemas';
import { GoldenSetCaseSchema } from '@repo/schemas';
import {
  validateProposedChange,
  computeNodeDiff,
  type ProposedGraphChangeRecord,
} from './editorial';

describe('Editorial Graph Logic', () => {
  const node1Id = '00000000-0000-0000-0000-000000000001';
  const node2Id = '00000000-0000-0000-0000-000000000002';
  const node3Id = '00000000-0000-0000-0000-000000000003';

  const sampleNodes: CanonicalNode[] = [
    {
      id: node1Id,
      domain_id: '00000000-0000-0000-0000-000000000000',
      slug: 'javascript-basics',
      name: 'JavaScript Basics',
      description: 'JS basics',
      node_type: 'skill',
      area: 'frontend',
      level: 1,
      status: 'approved',
      external_url: null,
      version_tag: null,
    },
    {
      id: node2Id,
      domain_id: '00000000-0000-0000-0000-000000000000',
      slug: 'typescript-basics',
      name: 'TypeScript Basics',
      description: 'TS basics',
      node_type: 'skill',
      area: 'frontend',
      level: 2,
      status: 'approved',
      external_url: null,
      version_tag: null,
    },
    {
      id: node3Id,
      domain_id: '00000000-0000-0000-0000-000000000000',
      slug: 'react-fundamentals',
      name: 'React Fundamentals',
      description: 'React fundamentals',
      node_type: 'tool',
      area: 'frontend',
      level: 2,
      status: 'approved',
      external_url: null,
      version_tag: null,
    },
  ];

  const sampleEdges: CanonicalEdge[] = [
    {
      id: '00000000-0000-0000-0000-000000000011',
      from_node: node1Id,
      to_node: node2Id,
    },
    {
      id: '00000000-0000-0000-0000-000000000012',
      from_node: node2Id,
      to_node: node3Id,
    },
  ];

  describe('validateProposedChange: add_node', () => {
    it('approves a valid new node with no edges', () => {
      const change: ProposedGraphChangeRecord = {
        id: 'prop-1',
        change_type: 'add_node',
        status: 'pending',
        payload: {
          proposed_node: {
            slug: 'vue-basics',
            name: 'Vue Basics',
            category: 'tool',
            area: 'frontend',
            level: 2,
          },
        },
      };

      const result = validateProposedChange(change, sampleNodes, sampleEdges);
      expect(result.valid).toBe(true);
      expect(result.cycleDetected).toBeUndefined();
    });

    it('rejects a proposed node missing slug or name', () => {
      const change: ProposedGraphChangeRecord = {
        id: 'prop-2',
        change_type: 'add_node',
        status: 'pending',
        payload: {
          proposed_node: {
            slug: '',
            name: 'Missing Slug',
            category: 'tool',
            area: 'frontend',
            level: 1,
          },
        },
      };

      const result = validateProposedChange(change, sampleNodes, sampleEdges);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('INVALID_PAYLOAD');
    });

    it('rejects a proposed node with a duplicate slug', () => {
      const change: ProposedGraphChangeRecord = {
        id: 'prop-3',
        change_type: 'add_node',
        status: 'pending',
        payload: {
          proposed_node: {
            slug: 'typescript-basics', // already in sampleNodes
            name: 'Duplicate TS',
            category: 'skill',
            area: 'frontend',
            level: 2,
          },
        },
      };

      const result = validateProposedChange(change, sampleNodes, sampleEdges);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('DUPLICATE_SLUG');
    });

    it('detects a cycle if proposed edges loop back to ancestors', () => {
      // Current path: node-1 -> node-2 -> node-3
      // If proposed node connects node-3 -> temp-node -> node-1, that's a cycle!
      const change: ProposedGraphChangeRecord = {
        id: 'prop-4',
        change_type: 'add_node',
        status: 'pending',
        payload: {
          proposed_node: {
            slug: 'cycle-maker',
            name: 'Cycle Maker',
            category: 'skill',
            area: 'frontend',
            level: 3,
          },
          proposed_edges: [
            { from_node: node3Id, to_slug: 'cycle-maker' },
            { from_slug: 'cycle-maker', to_node: node1Id },
          ],
        },
      };

      const result = validateProposedChange(change, sampleNodes, sampleEdges);
      expect(result.valid).toBe(false);
      expect(result.cycleDetected).toBe(true);
      expect(result.error).toBe('CYCLE_DETECTED');
    });
  });

  describe('validateProposedChange: add_edge', () => {
    it('accepts a valid edge that does not create a cycle', () => {
      const change: ProposedGraphChangeRecord = {
        id: 'edge-prop-1',
        change_type: 'add_edge',
        status: 'pending',
        payload: {
          from_node: node1Id,
          to_node: node3Id,
        },
      };

      const result = validateProposedChange(change, sampleNodes, sampleEdges);
      expect(result.valid).toBe(true);
    });

    it('rejects self-loops (from_node == to_node)', () => {
      const change: ProposedGraphChangeRecord = {
        id: 'edge-prop-2',
        change_type: 'add_edge',
        status: 'pending',
        payload: {
          from_node: node2Id,
          to_node: node2Id,
        },
      };

      const result = validateProposedChange(change, sampleNodes, sampleEdges);
      expect(result.valid).toBe(false);
      expect(result.cycleDetected).toBe(true);
    });

    it('refuses an edge that would create a cycle (node-3 -> node-1)', () => {
      const change: ProposedGraphChangeRecord = {
        id: 'edge-prop-3',
        change_type: 'add_edge',
        status: 'pending',
        payload: {
          from_node: node3Id,
          to_node: node1Id,
        },
      };

      const result = validateProposedChange(change, sampleNodes, sampleEdges);
      expect(result.valid).toBe(false);
      expect(result.cycleDetected).toBe(true);
      expect(result.error).toBe('CYCLE_DETECTED');
      expect(result.message).toContain('circular dependency');
    });
  });

  describe('validateProposedChange: add_supersedes', () => {
    it('accepts valid supersedes relation', () => {
      const change: ProposedGraphChangeRecord = {
        id: 'sup-1',
        change_type: 'add_supersedes',
        status: 'pending',
        payload: {
          old_node: node1Id,
          new_node: node3Id,
        },
      };

      const result = validateProposedChange(change, sampleNodes, sampleEdges);
      expect(result.valid).toBe(true);
    });

    it('rejects self-supersedes', () => {
      const change: ProposedGraphChangeRecord = {
        id: 'sup-2',
        change_type: 'add_supersedes',
        status: 'pending',
        payload: {
          old_node: node1Id,
          new_node: node1Id,
        },
      };

      const result = validateProposedChange(change, sampleNodes, sampleEdges);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('INVALID_SUPERSEDES');
    });
  });

  describe('computeNodeDiff', () => {
    it('computes field-level differences correctly', () => {
      const original = sampleNodes[0];
      const updated: Partial<CanonicalNode> = {
        name: 'JavaScript Fundamentals (Modern)',
        level: 2,
      };

      const diffs = computeNodeDiff(original, updated);
      expect(diffs).toEqual([
        {
          field: 'name',
          from: 'JavaScript Basics',
          to: 'JavaScript Fundamentals (Modern)',
        },
        {
          field: 'level',
          from: 1,
          to: 2,
        },
      ]);
    });

    it('returns empty array when fields have identical values', () => {
      const original = sampleNodes[0];
      const diffs = computeNodeDiff(original, {
        name: 'JavaScript Basics',
        level: 1,
      });
      expect(diffs).toHaveLength(0);
    });
  });

  describe('GoldenSetCaseSchema (PRD Appendix B format)', () => {
    it('validates a correct golden-set record', () => {
      const goldenRecord = {
        news_url: 'https://example.com/release-notes',
        user_profile_fixture: 'senior-js-copilot-user',
        expected_verdict: 'injection',
        expected_new_node_slug: 'agentic-coding-tools',
        notes: 'Editor rationale here',
      };

      const parsed = GoldenSetCaseSchema.safeParse(goldenRecord);
      expect(parsed.success).toBe(true);
    });

    it('rejects an invalid verdict type in golden record', () => {
      const invalidRecord = {
        news_url: 'https://example.com/release-notes',
        user_profile_fixture: 'senior-js-copilot-user',
        expected_verdict: 'invalid_type',
        notes: 'Editor rationale here',
      };

      const parsed = GoldenSetCaseSchema.safeParse(invalidRecord);
      expect(parsed.success).toBe(false);
    });
  });
});
