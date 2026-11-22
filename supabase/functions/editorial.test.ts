import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { handleEditorialAction } from './editorial-actions/index';
import { decideVerdict } from '../../packages/graph/src/verdict';
import type {
  CanonicalNode,
  CanonicalEdge,
  NodeSupersedes,
  ProposedGraphChange,
  Guide,
} from '@repo/schemas';

describe('Prompt 14: Editorial Dashboard Backend & Access Control', () => {
  const domainId = '00000000-0000-0000-0000-000000000001';
  const normalUserId = 'user-normal-0001';
  const editorUserId = 'user-editor-0002';

  let dbUserRoles: Array<{ user_id: string; role: string }> = [];
  let dbCanonicalNodes: CanonicalNode[] = [];
  let dbCanonicalEdges: CanonicalEdge[] = [];
  let dbSupersedes: NodeSupersedes[] = [];
  let dbProposedChanges: ProposedGraphChange[] = [];
  let dbGuides: Guide[] = [];
  let dbVerdicts: any[] = [];
  let dbNewsItems: any[] = [];
  let dbUserVerdicts: any[] = [];

  beforeEach(() => {
    dbUserRoles = [
      { user_id: normalUserId, role: 'learner' },
      { user_id: editorUserId, role: 'editor' },
    ];

    dbCanonicalNodes = [
      {
        id: 'node-git',
        domain_id: domainId,
        slug: 'git-basics',
        name: 'Git Basics',
        description: 'Version control',
        category: 'tool',
        area: 'tools',
        level: 1,
        status: 'approved',
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'node-copilot',
        domain_id: domainId,
        slug: 'copilot',
        name: 'GitHub Copilot',
        description: 'Inline AI suggestions',
        category: 'tool',
        area: 'ai-tools',
        level: 2,
        status: 'approved',
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'node-cursor',
        domain_id: domainId,
        slug: 'cursor-editor',
        name: 'Cursor AI Editor',
        description: 'Agentic IDE',
        category: 'tool',
        area: 'ai-tools',
        level: 2,
        status: 'approved',
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    dbCanonicalEdges = [
      {
        id: 'e-1',
        from_node: 'node-git',
        to_node: 'node-copilot',
        relationship: 'prerequisite',
      },
      {
        id: 'e-2',
        from_node: 'node-copilot',
        to_node: 'node-cursor',
        relationship: 'prerequisite',
      },
    ];

    dbSupersedes = [];

    dbProposedChanges = [
      {
        id: 'prop-change-valid-node',
        news_item_id: 'news-1',
        change_type: 'add_node',
        payload: {
          proposed_node: {
            slug: 'claude-code',
            name: 'Claude Code',
            description: 'Agentic CLI developer tool',
            category: 'tool',
            area: 'ai-tools',
            level: 3,
            external_url: 'https://anthropic.com/claude-code',
          },
          proposed_edges: [
            { from_node: 'node-cursor', to_slug: 'claude-code' },
          ],
        },
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'prop-change-cycle-edge',
        news_item_id: null,
        change_type: 'add_edge',
        payload: {
          from_node: 'node-cursor',
          to_node: 'node-git', // Cycle: git -> copilot -> cursor -> git
        },
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    dbGuides = [
      {
        id: 'guide-cursor',
        node_id: 'node-cursor',
        markdown: '# Draft Guide for Cursor\n1. Install Cursor\n2. Open repo',
        source_urls: ['https://cursor.com'],
        status: 'draft',
        last_verified_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    dbVerdicts = [
      {
        id: 'v-flagged-1',
        news_item_id: 'news-flagged',
        verdict: 'shield',
        confidence: 0.45, // low confidence
        reasoning: 'Unclear impact on learner roadmap.',
        created_at: new Date().toISOString(),
      },
    ];

    dbNewsItems = [
      {
        id: 'news-failed-1',
        title: 'Broken RSS Item',
        status: 'ingested',
        raw_text: 'Raw dump with syntax error',
        created_at: new Date().toISOString(),
      },
    ];

    dbUserVerdicts = [];
  });

  function createMockSupabaseClient() {
    return {
      auth: {
        getUser: async (token: string) => {
          if (token === 'editor-token') {
            return { data: { user: { id: editorUserId } }, error: null };
          }
          if (token === 'normal-user-token') {
            return { data: { user: { id: normalUserId } }, error: null };
          }
          return { data: { user: null }, error: new Error('Invalid token') };
        },
      },
      from: (tableName: string) => {
        let filters: Array<(row: any) => boolean> = [];
        let orderByField: string | null = null;
        let orderAsc: boolean = true;
        let selectColumns = '*';
        let limitCount: number | null = null;

        const getTable = () => {
          if (tableName === 'user_roles') return dbUserRoles;
          if (tableName === 'canonical_nodes') return dbCanonicalNodes;
          if (tableName === 'canonical_edges') return dbCanonicalEdges;
          if (tableName === 'node_supersedes') return dbSupersedes;
          if (tableName === 'proposed_graph_changes') return dbProposedChanges;
          if (tableName === 'guides') return dbGuides;
          if (tableName === 'verdicts') return dbVerdicts;
          if (tableName === 'news_items') return dbNewsItems;
          if (tableName === 'user_verdicts') return dbUserVerdicts;
          return [];
        };

        const builder: any = {
          select: (cols: string = '*') => {
            selectColumns = cols;
            return builder;
          },
          eq: (field: string, val: any) => {
            filters.push((row: any) => row[field] === val);
            return builder;
          },
          neq: (field: string, val: any) => {
            filters.push((row: any) => row[field] !== val);
            return builder;
          },
          lt: (field: string, val: any) => {
            filters.push((row: any) => row[field] < val);
            return builder;
          },
          not: (field: string, operator: string, val: any) => {
            if (operator === 'is' && val === null) {
              filters.push((row: any) => row[field] !== null && row[field] !== undefined);
            }
            return builder;
          },
          in: (field: string, list: any[]) => {
            filters.push((row: any) => list.includes(row[field]));
            return builder;
          },
          order: (field: string, opts?: { ascending?: boolean }) => {
            orderByField = field;
            orderAsc = opts?.ascending ?? true;
            return builder;
          },
          limit: (n: number) => {
            limitCount = n;
            return builder;
          },
          single: async () => {
            const data = getTable().filter((r) => filters.every((fn) => fn(r)));
            if (data.length === 0) {
              return { data: null, error: { message: 'Row not found' } };
            }
            return { data: { ...data[0] }, error: null };
          },
          insert: (records: any | any[]) => {
            const arr = Array.isArray(records) ? records : [records];
            const inserted = arr.map((r) => {
              const row = {
                id: r.id || `${tableName.slice(0, 4)}-${Date.now()}-${Math.random()}`,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                ...r,
              };
              getTable().push(row);
              return row;
            });

            return {
              select: () => ({
                single: async () => ({ data: inserted[0], error: null }),
              }),
              then: (resolve: any) => resolve({ data: inserted, error: null }),
            };
          },
          update: (updates: any) => {
            return {
              eq: (field: string, val: any) => {
                const table = getTable();
                for (let i = 0; i < table.length; i++) {
                  if (table[i][field] === val) {
                    table[i] = { ...table[i], ...updates, updated_at: new Date().toISOString() };
                  }
                }
                return {
                  select: () => ({
                    single: async () => {
                      const updated = table.find((r) => r[field] === val);
                      return { data: updated || null, error: null };
                    },
                  }),
                  then: (resolve: any) => resolve({ data: true, error: null }),
                };
              },
            };
          },
        };

        builder.then = (resolve: any) => {
          let data = getTable().filter((r) => filters.every((fn) => fn(r)));
          if (limitCount !== null) {
            data = data.slice(0, limitCount);
          }
          resolve({ data: data.map((d) => ({ ...d })), error: null });
        };

        return builder;
      },
    } as any;
  }

  describe('1. Access Control (Role Enforcement)', () => {
    it('rejects access from a user without the editor role with 403 Forbidden', async () => {
      const mockSupabase = createMockSupabaseClient();
      const req = new Request('http://localhost/editorial-actions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer normal-user-token',
        },
        body: JSON.stringify({ action: 'list_queues' }),
      });

      const res = await handleEditorialAction(req, mockSupabase);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.code).toBe('FORBIDDEN_NOT_EDITOR');
    });

    it('permits access when the user has the editor role', async () => {
      const mockSupabase = createMockSupabaseClient();
      const req = new Request('http://localhost/editorial-actions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer editor-token',
        },
        body: JSON.stringify({ action: 'list_queues' }),
      });

      const res = await handleEditorialAction(req, mockSupabase);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.queues.proposed_changes).toHaveLength(2);
      expect(json.queues.draft_guides).toHaveLength(1);
      expect(json.queues.flagged_items.low_confidence_verdicts).toHaveLength(1);
    });
  });

  describe('2. Cycle Rejection on Approve', () => {
    it('refuses to approve a proposed change that would create a circular dependency', async () => {
      const mockSupabase = createMockSupabaseClient();
      const initialEdgeCount = dbCanonicalEdges.length;

      const req = new Request('http://localhost/editorial-actions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer editor-token',
        },
        body: JSON.stringify({
          action: 'approve_proposed_change',
          change_id: 'prop-change-cycle-edge',
        }),
      });

      const res = await handleEditorialAction(req, mockSupabase);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.cycleDetected).toBe(true);
      expect(json.error).toBe('CYCLE_DETECTED');

      // Edge count must remain untouched (canonical graph preserved acyclic)
      expect(dbCanonicalEdges.length).toBe(initialEdgeCount);
      // Status in proposed_graph_changes remains pending
      const propChange = dbProposedChanges.find((p) => p.id === 'prop-change-cycle-edge');
      expect(propChange?.status).toBe('pending');
    });
  });

  describe('3. Approving a Node Makes it Eligible for Injection', () => {
    it('verifies non-approved node is shielded in decideVerdict, and becomes injectable upon approval', async () => {
      const mockSupabase = createMockSupabaseClient();

      const userRoadmap = {
        user_id: 'learner-1',
        domain_id: domainId,
        nodes: [dbCanonicalNodes[0], dbCanonicalNodes[1], dbCanonicalNodes[2]],
        edges: dbCanonicalEdges,
        user_nodes: [
          {
            id: 'un-1',
            user_id: 'learner-1',
            node_id: 'node-cursor',
            status: 'completed' as const,
            origin: 'baseline' as const,
            fast_track: false,
            replaced_node_id: null,
            version: 1,
            completed_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      };

      // BEFORE APPROVAL: 'claude-code' is not approved (does not exist in dbCanonicalNodes)
      const preDecision = decideVerdict(
        {
          verdict: 'injection',
          confidence: 0.9,
          reasoning: 'Major agentic CLI upgrade',
          new_node_slug: 'claude-code',
          candidate_slugs: ['claude-code'],
        },
        {
          domainMatches: true,
          impactScore: 8,
          canonicalNodes: dbCanonicalNodes, // does not have claude-code
          canonicalEdges: dbCanonicalEdges,
          supersedes: [],
          roadmap: userRoadmap,
        },
      );

      // Invariant: Non-approved node MUST be shielded according to PRD 9.2
      expect(preDecision.verdict).toBe('shield');

      // NOW: Editor approves the proposed node
      const approveReq = new Request('http://localhost/editorial-actions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer editor-token',
        },
        body: JSON.stringify({
          action: 'approve_proposed_change',
          change_id: 'prop-change-valid-node',
        }),
      });

      const approveRes = await handleEditorialAction(approveReq, mockSupabase);
      expect(approveRes.status).toBe(200);

      // Verify node was inserted into canonical_nodes with status = 'approved'
      const approvedNode = dbCanonicalNodes.find((n) => n.slug === 'claude-code');
      expect(approvedNode).toBeDefined();
      expect(approvedNode?.status).toBe('approved');
      expect(approvedNode?.name).toBe('Claude Code');

      // Verify proposed_graph_changes row updated to approved
      const propChange = dbProposedChanges.find((p) => p.id === 'prop-change-valid-node');
      expect(propChange?.status).toBe('approved');

      // AFTER APPROVAL: Run decideVerdict with the newly approved canonical node
      const postDecision = decideVerdict(
        {
          verdict: 'injection',
          confidence: 0.9,
          reasoning: 'Major agentic CLI upgrade',
          new_node_slug: 'claude-code',
          candidate_slugs: ['claude-code'],
        },
        {
          domainMatches: true,
          impactScore: 8,
          canonicalNodes: dbCanonicalNodes, // now includes approved claude-code
          canonicalEdges: dbCanonicalEdges,
          supersedes: [],
          roadmap: userRoadmap,
        },
      );

      // Invariant: Node is now eligible for injection!
      expect(postDecision.verdict).toBe('injection');
      expect(postDecision.new_node_id).toBe(approvedNode?.id);
    });
  });

  describe('4. Draft Guide Approval', () => {
    it('sets guide status to approved and stamps last_verified_at', async () => {
      const mockSupabase = createMockSupabaseClient();

      const req = new Request('http://localhost/editorial-actions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer editor-token',
        },
        body: JSON.stringify({
          action: 'approve_guide',
          guide_id: 'guide-cursor',
          markdown_content: '# Approved Guide\n1. Quickstart verified.',
        }),
      });

      const res = await handleEditorialAction(req, mockSupabase);
      expect(res.status).toBe(200);

      const guide = dbGuides.find((g) => g.id === 'guide-cursor');
      expect(guide?.status).toBe('approved');
      expect(guide?.last_verified_at).not.toBeNull();
      expect(guide?.markdown).toContain('Quickstart verified');
    });
  });

  describe('5. Golden-Set Manager (PRD Appendix B)', () => {
    it('validates and writes a golden test case into /evals/golden format', async () => {
      const mockSupabase = createMockSupabaseClient();
      const testCase = {
        news_url: 'https://anthropic.com/news/claude-code-cli',
        user_profile_fixture: 'fullstack-ts-developer',
        expected_verdict: 'injection' as const,
        expected_new_node_slug: 'claude-code',
        notes: 'Claude Code replaces manual terminal workflows with agentic loop',
      };

      const req = new Request('http://localhost/editorial-actions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer editor-token',
        },
        body: JSON.stringify({
          action: 'save_golden_case',
          golden_case: testCase,
          filename: 'test-claude-code',
        }),
      });

      const res = await handleEditorialAction(req, mockSupabase);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.filename).toBe('test-claude-code.json');

      // Check file was written to disk
      const filePath = path.resolve(process.cwd(), 'evals', 'golden', 'test-claude-code.json');
      expect(fs.existsSync(filePath)).toBe(true);
      const fileContent = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(fileContent.expected_verdict).toBe('injection');
      expect(fileContent.expected_new_node_slug).toBe('claude-code');

      // Clean up test file
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    });
  });
});
