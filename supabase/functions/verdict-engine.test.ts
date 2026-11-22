import { describe, it, expect, beforeEach } from 'vitest';
import { handleComputeVerdict } from './compute-verdict/index';
import { handlePrecomputeVerdicts } from './precompute-verdicts/index';
import { MockProvider } from '../../packages/llm/src/providers/mock';
import type { Database } from '@repo/schemas';

type NewsItemRow = Database['public']['Tables']['news_items']['Row'];
type CanonicalNodeRow = Database['public']['Tables']['canonical_nodes']['Row'];
type CanonicalEdgeRow = Database['public']['Tables']['canonical_edges']['Row'];
type NodeSupersedesRow = Database['public']['Tables']['node_supersedes']['Row'];
type ProfileRow = Database['public']['Tables']['profiles']['Row'];
type UserNodeRow = Database['public']['Tables']['user_nodes']['Row'];
type VerdictRow = Database['public']['Tables']['verdicts']['Row'];
type UserVerdictRow = Database['public']['Tables']['user_verdicts']['Row'];
type UsageCounterRow = Database['public']['Tables']['usage_counters']['Row'];
type SponsoredPlacementRow = Database['public']['Tables']['sponsored_placements']['Row'];

describe('Prompt 11: Verdict Engine Edge Functions & Decision Invariants', () => {
  const domainId = '00000000-0000-0000-0000-000000000001';
  const user1Id = 'user-1111-1111-1111-111111111111';
  const user2Id = 'user-2222-2222-2222-222222222222';
  const user3Id = 'user-3333-3333-3333-333333333333';

  // In-memory mock database tables
  let dbNewsItems: NewsItemRow[] = [];
  let dbCanonicalNodes: CanonicalNodeRow[] = [];
  let dbCanonicalEdges: CanonicalEdgeRow[] = [];
  let dbSupersedes: NodeSupersedesRow[] = [];
  let dbProfiles: ProfileRow[] = [];
  let dbUserNodes: UserNodeRow[] = [];
  let dbVerdicts: VerdictRow[] = [];
  let dbUserVerdicts: UserVerdictRow[] = [];
  let dbUsageCounters: UsageCounterRow[] = [];
  let dbSponsoredPlacements: SponsoredPlacementRow[] = [];

  let mockProvider: MockProvider;

  beforeEach(() => {
    mockProvider = new MockProvider();

    // Reset database fixtures
    dbNewsItems = [
      {
        id: 'news-item-001',
        domain_id: domainId,
        source_id: null,
        url: 'https://news.example.com/cursor-agents',
        title: 'Cursor Releases Multi-File Agent Mode',
        published_at: new Date().toISOString(),
        raw_text: 'Cursor launches multi-file agentic code editing.',
        content_hash: 'hash-001',
        bullets: [
          'State-of-the-art SWE-bench agentic refactoring benchmarks.',
          'Two times faster than Claude 3 Opus with lower latency.',
          'Adopt in test environments to evaluate code refactoring speedups.',
        ],
        impact_score: 8,
        impact_rationale: 'Major capability enhancement in AI editor category.',
        tags: ['editors-ides', 'cursor'],
        mapped_node_ids: [
          'node-cursor',
          'node-vscode',
        ],
        proposed_new_tool: null,
        status: 'published',
        error_record: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'news-item-002',
        domain_id: domainId,
        source_id: null,
        url: 'https://news.example.com/minor-patch',
        title: 'Minor Library Bugfix Release',
        published_at: new Date().toISOString(),
        raw_text: 'Small bugfix patch.',
        content_hash: 'hash-002',
        bullets: [
          'Fixes minor edge case in cli argument parsing.',
          'No breaking changes introduced.',
          'Update when convenient.',
        ],
        impact_score: 3, // < 5, should be skipped by precompute
        impact_rationale: 'Routine bug fix release.',
        tags: ['testing'],
        mapped_node_ids: [],
        proposed_new_tool: null,
        status: 'published',
        error_record: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    dbCanonicalNodes = [
      {
        id: 'node-git',
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
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'node-vscode',
        domain_id: domainId,
        slug: 'vscode-editor',
        name: 'VS Code',
        description: 'Standard code editor',
        node_type: 'tool',
        level: 1,
        area: 'editors-ides',
        status: 'approved',
        external_url: null,
        version_tag: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'node-cursor',
        domain_id: domainId,
        slug: 'cursor-ai-editor',
        name: 'Cursor AI Editor',
        description: 'AI-first code editor with agent mode',
        node_type: 'tool',
        level: 2,
        area: 'editors-ides',
        status: 'approved',
        external_url: null,
        version_tag: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'node-copilot',
        domain_id: domainId,
        slug: 'copilot-assistant',
        name: 'GitHub Copilot',
        description: 'Autocomplete coding assistant',
        node_type: 'tool',
        level: 1,
        area: 'ai-assistants',
        status: 'approved',
        external_url: null,
        version_tag: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    dbCanonicalEdges = [
      {
        id: 'edge-1',
        from_node: 'node-git',
        to_node: 'node-vscode',
      },
      {
        id: 'edge-2',
        from_node: 'node-vscode',
        to_node: 'node-cursor',
      },
      {
        id: 'edge-3',
        from_node: 'node-git',
        to_node: 'node-copilot',
      },
    ];

    dbSupersedes = [
      {
        old_node: 'node-vscode',
        new_node: 'node-cursor',
        note: 'Cursor IDE supersedes standard VS Code editor',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    dbProfiles = [
      {
        id: user1Id,
        domain_id: domainId,
        display_name: 'Alice Developer',
        avatar_url: null,
        experience: { 'editors-ides': 'working' },
        onboarding_completed: true,
        streak_days: 3,
        last_active_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: user2Id,
        domain_id: domainId,
        display_name: 'Bob Coder',
        avatar_url: null,
        experience: { 'editors-ides': 'working' }, // same cohort as Alice
        onboarding_completed: true,
        streak_days: 1,
        last_active_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: user3Id,
        domain_id: domainId,
        display_name: 'Charlie Expert',
        avatar_url: null,
        experience: { 'editors-ides': 'expert', 'ai-assistants': 'expert' }, // different cohort
        onboarding_completed: true,
        streak_days: 5,
        last_active_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    // Alice & Bob have Git and VS Code
    dbUserNodes = [
      {
        id: 'un-1',
        user_id: user1Id,
        node_id: 'node-git',
        status: 'completed',
        origin: 'baseline',
        fast_track: false,
        replaced_node_id: null,
        completed_at: new Date().toISOString(),
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'un-2',
        user_id: user1Id,
        node_id: 'node-vscode',
        status: 'completed',
        origin: 'baseline',
        fast_track: false,
        replaced_node_id: null,
        completed_at: new Date().toISOString(),
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'un-3',
        user_id: user2Id,
        node_id: 'node-git',
        status: 'completed',
        origin: 'baseline',
        fast_track: false,
        replaced_node_id: null,
        completed_at: new Date().toISOString(),
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'un-4',
        user_id: user2Id,
        node_id: 'node-vscode',
        status: 'completed',
        origin: 'baseline',
        fast_track: false,
        replaced_node_id: null,
        completed_at: new Date().toISOString(),
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      // Charlie already has Cursor
      {
        id: 'un-5',
        user_id: user3Id,
        node_id: 'node-cursor',
        status: 'completed',
        origin: 'baseline',
        fast_track: false,
        replaced_node_id: null,
        completed_at: new Date().toISOString(),
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    dbVerdicts = [];
    dbUserVerdicts = [];
    dbUsageCounters = [];
    dbSponsoredPlacements = [
      {
        id: 'sponsor-gpu',
        title: 'GPU Cloud Compute',
        body: 'Rent high-end H100 clusters',
        cta_url: 'https://gpu.example.com',
        sponsor_name: 'Compute Inc',
        domain_id: domainId,
        active: true,
        starts_at: null,
        ends_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];
  });

  // Create lightweight chainable mock Supabase client
  function createMockSupabaseClient() {
    return {
      auth: {
        getUser: async (token: string) => {
          if (token === 'user1-token') {
            return { data: { user: { id: user1Id } }, error: null };
          }
          if (token === 'user2-token') {
            return { data: { user: { id: user2Id } }, error: null };
          }
          return { data: { user: null }, error: new Error('Invalid token') };
        },
      },
      from: (table: string) => {
        let filters: Array<(row: any) => boolean> = [];
        let orderCol: string | null = null;
        let orderAsc = true;
        let limitCount: number | null = null;

        const builder: any = {
          select: (_cols?: string) => builder,
          eq: (col: string, val: any) => {
            filters.push((row: any) => row[col] === val);
            return builder;
          },
          gte: (col: string, val: any) => {
            filters.push((row: any) => row[col] >= val);
            return builder;
          },
          in: (col: string, vals: any[]) => {
            filters.push((row: any) => vals.includes(row[col]));
            return builder;
          },
          order: (col: string, opts?: { ascending?: boolean }) => {
            orderCol = col;
            orderAsc = opts?.ascending ?? true;
            return builder;
          },
          limit: (n: number) => {
            limitCount = n;
            return builder;
          },
          maybeSingle: async () => {
            const list = getTableData(table).filter((r) => filters.every((f) => f(r)));
            return { data: list[0] || null, error: null };
          },
          single: async () => {
            const list = getTableData(table).filter((r) => filters.every((f) => f(r)));
            if (list.length === 0) return { data: null, error: new Error('Row not found') };
            return { data: list[0], error: null };
          },
          insert: (recordOrList: any) => {
            const records = Array.isArray(recordOrList) ? recordOrList : [recordOrList];
            for (const r of records) {
              const fullRecord = {
                ...r,
                id: r.id || `id-${Date.now()}-${Math.random()}`,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              };
              insertTableData(table, fullRecord);
            }
            return {
              select: () => ({
                single: async () => ({
                  data: Array.isArray(recordOrList) ? records[0] : records[0],
                  error: null,
                }),
              }),
              data: recordOrList,
              error: null,
            };
          },
          upsert: (record: any, _opts?: any) => {
            upsertTableData(table, record);
            return {
              select: () => ({
                single: async () => ({ data: record, error: null }),
              }),
              data: record,
              error: null,
            };
          },
          then: (resolve: any) => {
            let list = getTableData(table).filter((r) => filters.every((f) => f(r)));
            if (orderCol) {
              list = [...list].sort((a, b) => {
                if (a[orderCol!] < b[orderCol!]) return orderAsc ? -1 : 1;
                if (a[orderCol!] > b[orderCol!]) return orderAsc ? 1 : -1;
                return 0;
              });
            }
            if (limitCount !== null) {
              list = list.slice(0, limitCount);
            }
            // Populate canonical_node relation on user_nodes
            if (table === 'user_nodes') {
              list = list.map((un) => ({
                ...un,
                canonical_node: dbCanonicalNodes.find((n) => n.id === un.node_id),
              }));
            }
            resolve({ data: list, error: null });
          },
        };
        return builder;
      },
    };
  }

  function getTableData(table: string): any[] {
    switch (table) {
      case 'news_items': return dbNewsItems;
      case 'canonical_nodes': return dbCanonicalNodes;
      case 'canonical_edges': return dbCanonicalEdges;
      case 'node_supersedes': return dbSupersedes;
      case 'profiles': return dbProfiles;
      case 'user_nodes': return dbUserNodes;
      case 'verdicts': return dbVerdicts;
      case 'user_verdicts': return dbUserVerdicts;
      case 'usage_counters': return dbUsageCounters;
      case 'sponsored_placements': return dbSponsoredPlacements;
      default: return [];
    }
  }

  function insertTableData(table: string, record: any) {
    switch (table) {
      case 'verdicts': dbVerdicts.push(record); break;
      case 'user_verdicts': dbUserVerdicts.push(record); break;
      case 'usage_counters': dbUsageCounters.push(record); break;
      default: break;
    }
  }

  function upsertTableData(table: string, record: any) {
    if (table === 'usage_counters') {
      const idx = dbUsageCounters.findIndex(
        (u) => u.user_id === record.user_id && u.day === record.day,
      );
      if (idx >= 0) dbUsageCounters[idx] = { ...dbUsageCounters[idx], ...record };
      else dbUsageCounters.push(record);
    } else if (table === 'user_verdicts') {
      const idx = dbUserVerdicts.findIndex(
        (uv) => uv.user_id === record.user_id && uv.news_item_id === record.news_item_id,
      );
      if (idx >= 0) dbUserVerdicts[idx] = { ...dbUserVerdicts[idx], ...record };
      else dbUserVerdicts.push(record);
    }
  }

  // -------------------------------------------------------------------------
  // 1. On-Demand Verdict Analysis & Free Tier Limit
  // -------------------------------------------------------------------------
  describe('compute-verdict: On-Demand Analysis & Limits', () => {
    it('executes on-demand analysis, applies decision rules, stores in verdicts, and increments usage', async () => {
      // Mock LLM proposes Override: VS Code -> Cursor
      mockProvider.enqueueResponse({
        verdict: 'override',
        target_node_slug: 'vscode-editor',
        new_node_slug: 'cursor-ai-editor',
        insert_after_slugs: [],
        reasoning: 'Cursor supersedes VS Code with native AI agent mode.',
        confidence: 0.95,
      });

      const client = createMockSupabaseClient() as any;
      const req = new Request('http://localhost/functions/v1/compute-verdict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          news_item_id: 'news-item-001',
          user_id: user1Id,
        }),
      });

      const res = await handleComputeVerdict(req, client, mockProvider);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.verdict.verdict).toBe('override');
      expect(data.verdict.target_node_id).toBe('node-vscode');
      expect(data.verdict.new_node_id).toBe('node-cursor');
      expect(data.is_precomputed).toBe(false);
      expect(data.remaining_analyses).toBe(9); // 10 - 1 = 9

      // Verify verdict stored in dbVerdicts
      expect(dbVerdicts.length).toBe(1);
      expect(dbVerdicts[0].news_item_id).toBe('news-item-001');

      // Verify user_verdicts row created
      expect(dbUserVerdicts.length).toBe(1);
      expect(dbUserVerdicts[0].user_id).toBe(user1Id);
      expect(dbUserVerdicts[0].state).toBe('previewed');

      // Verify usage counter incremented
      expect(dbUsageCounters.length).toBe(1);
      expect(dbUsageCounters[0].on_demand_analyses).toBe(1);
    });

    it('enforces cache hit across users sharing the same cache_key (0 LLM calls for second user)', async () => {
      // 1. User 1 (Alice) runs on-demand analysis first to populate cache
      mockProvider.enqueueResponse({
        verdict: 'override',
        target_node_slug: 'vscode-editor',
        new_node_slug: 'cursor-ai-editor',
        insert_after_slugs: [],
        reasoning: 'Cursor supersedes VS Code.',
        confidence: 0.95,
      });

      const client = createMockSupabaseClient() as any;
      const req1 = new Request('http://localhost/functions/v1/compute-verdict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          news_item_id: 'news-item-001',
          user_id: user1Id,
        }),
      });

      const res1 = await handleComputeVerdict(req1, client, mockProvider);
      expect(res1.status).toBe(200);

      // Now Bob (user2Id, same working level in editors-ides and same roadmap) requests analysis.
      const initialVerdictsCount = dbVerdicts.length;
      expect(initialVerdictsCount).toBe(1);
      const initialCallCount = mockProvider.getHistory().length;

      const req2 = new Request('http://localhost/functions/v1/compute-verdict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          news_item_id: 'news-item-001',
          user_id: user2Id,
        }),
      });

      const res2 = await handleComputeVerdict(req2, client, mockProvider);
      expect(res2.status).toBe(200);

      const data2 = await res2.json();
      expect(data2.success).toBe(true);
      expect(data2.cache_hit).toBe(true);
      expect(data2.verdict.verdict).toBe('override');

      // Zero new verdicts created in dbVerdicts
      expect(dbVerdicts.length).toBe(initialVerdictsCount);

      // Zero new LLM calls made! Reused cached verdict
      expect(mockProvider.getHistory().length).toBe(initialCallCount);

      // Bob's on-demand usage is tracked independently
      const bobUsage = dbUsageCounters.find((u) => u.user_id === user2Id);
      expect(bobUsage?.on_demand_analyses).toBe(1);
      expect(data2.remaining_analyses).toBe(9);
    });

    it('returns precomputed verdict instantly without consuming daily analyses', async () => {
      // Setup a precomputed verdict for Charlie
      const precomputedVerdictId = 'verdict-precomputed-101';
      dbVerdicts.push({
        id: precomputedVerdictId,
        news_item_id: 'news-item-001',
        cache_key: 'charlie-cache-key',
        verdict: 'shield',
        target_node_id: null,
        new_node_id: null,
        insert_after_node_ids: [],
        reasoning: 'User already has Cursor installed and mastered.',
        confidence: 0.95,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      dbUserVerdicts.push({
        id: 'uv-charlie-1',
        user_id: user3Id,
        news_item_id: 'news-item-001',
        verdict_id: precomputedVerdictId,
        state: 'precomputed',
        applied_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Charlie currently has 3 analyses used today
      const today = new Date().toISOString().split('T')[0];
      dbUsageCounters.push({
        user_id: user3Id,
        day: today,
        on_demand_analyses: 3,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const client = createMockSupabaseClient() as any;
      const req = new Request('http://localhost/functions/v1/compute-verdict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          news_item_id: 'news-item-001',
          user_id: user3Id,
        }),
      });

      const res = await handleComputeVerdict(req, client, mockProvider);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.is_precomputed).toBe(true);
      expect(data.verdict.verdict).toBe('shield');

      // PRD 10.2: Precomputed previews do not count!
      // Charlie's usage count must remain 3, and remaining count is 10 - 3 = 7
      expect(data.remaining_analyses).toBe(7);
      const charlieUsage = dbUsageCounters.find((u) => u.user_id === user3Id);
      expect(charlieUsage?.on_demand_analyses).toBe(3);
    });

    it('enforces daily limit: returns 429 DAILY_LIMIT_EXCEEDED when daily limit is exhausted', async () => {
      const today = new Date().toISOString().split('T')[0];
      // Set Alice's usage to 10
      const aliceUsage = dbUsageCounters.find((u) => u.user_id === user1Id);
      if (aliceUsage) {
        aliceUsage.on_demand_analyses = 10;
      } else {
        dbUsageCounters.push({
          user_id: user1Id,
          day: today,
          on_demand_analyses: 10,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }

      // Remove any existing user_verdict for this news item so it's on-demand
      dbUserVerdicts = dbUserVerdicts.filter(
        (uv) => !(uv.user_id === user1Id && uv.news_item_id === 'news-item-002'),
      );

      const client = createMockSupabaseClient() as any;
      const req = new Request('http://localhost/functions/v1/compute-verdict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          news_item_id: 'news-item-002',
          user_id: user1Id,
        }),
      });

      const res = await handleComputeVerdict(req, client, mockProvider);
      expect(res.status).toBe(429);

      const data = await res.json();
      expect(data.error).toBe('DAILY_LIMIT_EXCEEDED');
      expect(data.remaining_analyses).toBe(0);
      expect(data.limit).toBe(10);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Precompute Verdicts Batch Worker
  // -------------------------------------------------------------------------
  describe('precompute-verdicts: Cohort Grouping & Batch Precomputation', () => {
    it('groups active users by cache_key and scales LLM calls with cohorts instead of users', async () => {
      // Clear verdicts and user_verdicts
      dbVerdicts = [];
      dbUserVerdicts = [];

      mockProvider.enqueueResponse({
        verdict: 'override',
        target_node_slug: 'vscode-editor',
        new_node_slug: 'cursor-ai-editor',
        insert_after_slugs: [],
        reasoning: 'Cursor replaces VS Code for agentic workflows.',
        confidence: 0.94,
      });

      // Charlie's cohort response (he already has Cursor)
      mockProvider.enqueueResponse({
        verdict: 'shield',
        target_node_slug: null,
        new_node_slug: null,
        insert_after_slugs: [],
        reasoning: 'Roadmap already includes Cursor.',
        confidence: 0.98,
      });

      const client = createMockSupabaseClient() as any;
      const req = new Request('http://localhost/functions/v1/precompute-verdicts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          news_item_id: 'news-item-001',
          min_impact_score: 5,
        }),
      });

      const res = await handlePrecomputeVerdicts(req, client, mockProvider);
      expect(res.status).toBe(200);

      const report = await res.json();
      expect(report.success).toBe(true);
      expect(report.news_items_processed).toBe(1);

      // There are 3 active users:
      // Alice and Bob share the exact same roadmap and experience -> Cohort 1
      // Charlie has Cursor -> Cohort 2
      // Thus, exactly 2 cohorts are evaluated, making at most 2 LLM calls!
      expect(report.cohorts_evaluated).toBe(2);
      expect(report.llm_calls_made).toBe(2);

      // 3 user_verdicts rows created (1 for Alice, 1 for Bob, 1 for Charlie)
      expect(report.user_verdicts_created).toBe(3);

      // Verify that all 3 users have precomputed verdicts
      const aliceVerdict = dbUserVerdicts.find((uv) => uv.user_id === user1Id);
      const bobVerdict = dbUserVerdicts.find((uv) => uv.user_id === user2Id);
      const charlieVerdict = dbUserVerdicts.find((uv) => uv.user_id === user3Id);

      expect(aliceVerdict?.state).toBe('precomputed');
      expect(bobVerdict?.state).toBe('precomputed');
      expect(charlieVerdict?.state).toBe('precomputed');

      // Alice and Bob share the EXACT SAME verdict_id!
      expect(aliceVerdict?.verdict_id).toBe(bobVerdict?.verdict_id);
    });

    it('skips news items below minimum impact score (< 5)', async () => {
      const client = createMockSupabaseClient() as any;
      const req = new Request('http://localhost/functions/v1/precompute-verdicts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          news_item_id: 'news-item-002', // impact_score: 3
          min_impact_score: 5,
        }),
      });

      const res = await handlePrecomputeVerdicts(req, client, mockProvider);
      expect(res.status).toBe(200);

      const report = await res.json();
      expect(report.news_items_processed).toBe(0);
      expect(report.cohorts_evaluated).toBe(0);
      expect(report.llm_calls_made).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Sponsorship Integrity Invariant
  // -------------------------------------------------------------------------
  describe('Sponsorship Integrity Invariant (PRD Section 14)', () => {
    it('guarantees verdict functions and endpoints accept NO sponsor-related input', async () => {
      const client = createMockSupabaseClient() as any;

      // Send request polluted with sponsor payload
      const req = new Request('http://localhost/functions/v1/compute-verdict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          news_item_id: 'news-item-001',
          user_id: user1Id,
          sponsor_name: 'ComputeCloud Inc.',
          sponsored_placement_id: 'sponsor-gpu',
          cta_url: 'https://sponsor.example.com',
        }),
      });

      const res = await handleComputeVerdict(req, client, mockProvider);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);

      // Verify verdict object contains zero sponsor data
      const verdictKeys = Object.keys(data.verdict);
      for (const k of verdictKeys) {
        expect(k.toLowerCase()).not.toContain('sponsor');
        expect(k.toLowerCase()).not.toContain('placement');
      }

      // Verify DB verdicts table contains zero sponsor data
      for (const v of dbVerdicts) {
        expect((v as any).sponsor_name).toBeUndefined();
        expect((v as any).placement_id).toBeUndefined();
      }
    });
  });
});
