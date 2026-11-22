import { describe, it, expect, beforeEach } from 'vitest';
import { handleApplyVerdict } from './apply-verdict/index';
import type { Database } from '@repo/schemas';

type NewsItemRow = Database['public']['Tables']['news_items']['Row'];
type CanonicalNodeRow = Database['public']['Tables']['canonical_nodes']['Row'];
type CanonicalEdgeRow = Database['public']['Tables']['canonical_edges']['Row'];
type NodeSupersedesRow = Database['public']['Tables']['node_supersedes']['Row'];
type UserNodeRow = Database['public']['Tables']['user_nodes']['Row'];
type VerdictRow = Database['public']['Tables']['verdicts']['Row'];
type UserVerdictRow = Database['public']['Tables']['user_verdicts']['Row'];

describe('Prompt 12: Apply-Verdict Transaction & Revalidation Invariants', () => {
  const domainId = '00000000-0000-0000-0000-000000000001';
  const testUserId = 'user-1111-1111-1111-111111111111';

  let dbNewsItems: NewsItemRow[] = [];
  let dbCanonicalNodes: CanonicalNodeRow[] = [];
  let dbCanonicalEdges: CanonicalEdgeRow[] = [];
  let dbSupersedes: NodeSupersedesRow[] = [];
  let dbUserNodes: UserNodeRow[] = [];
  let dbVerdicts: VerdictRow[] = [];
  let dbUserVerdicts: UserVerdictRow[] = [];

  // Flag to simulate mid-transaction RPC failure
  let simulateRpcFailure = false;

  beforeEach(() => {
    simulateRpcFailure = false;

    dbCanonicalNodes = [
      {
        id: 'node-git',
        domain_id: domainId,
        slug: 'git-basics',
        name: 'Git Basics',
        description: 'Version control fundamentals',
        category: 'tool',
        area: 'version-control',
        level: 1,
        status: 'approved',
        external_url: 'https://git-scm.com',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'node-copilot',
        domain_id: domainId,
        slug: 'github-copilot',
        name: 'GitHub Copilot',
        description: 'AI code completion tool',
        category: 'tool',
        area: 'ai-assistants',
        level: 1,
        status: 'approved',
        external_url: 'https://github.com/features/copilot',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'node-cursor',
        domain_id: domainId,
        slug: 'cursor-agent',
        name: 'Cursor Agentic Editor',
        description: 'Next-gen AI code editor with background agentic workflow',
        category: 'tool',
        area: 'editors-ides',
        level: 2,
        status: 'approved',
        external_url: 'https://cursor.com',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'node-unapproved',
        domain_id: domainId,
        slug: 'experimental-unapproved-tool',
        name: 'Experimental Unapproved Tool',
        description: 'Pending review by editors',
        category: 'tool',
        area: 'ai-assistants',
        level: 2,
        status: 'draft', // NOT approved!
        external_url: 'https://experimental.example.com',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    dbCanonicalEdges = [
      {
        id: 'edge-git-copilot',
        from_node: 'node-git',
        to_node: 'node-copilot',
        relationship: 'prerequisite',
      },
    ];

    dbSupersedes = [
      {
        id: 'supersedes-copilot-cursor',
        old_node: 'node-copilot',
        new_node: 'node-cursor',
        domain_id: domainId,
        status: 'approved',
        confidence: 0.95,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    dbNewsItems = [
      {
        id: 'news-shield-001',
        domain_id: domainId,
        source_id: null,
        url: 'https://news.example.com/shield',
        title: 'Minor Library Release',
        published_at: new Date().toISOString(),
        raw_text: 'Small bugfix patch.',
        content_hash: 'hash-shield',
        bullets: ['Bullet 1', 'Bullet 2', 'Bullet 3'],
        impact_score: 3,
        impact_rationale: 'Minor bugfix.',
        tags: ['tooling'],
        mapped_node_ids: ['node-git'],
        proposed_new_tool: null,
        status: 'published',
        error_record: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'news-inject-002',
        domain_id: domainId,
        source_id: null,
        url: 'https://news.example.com/injection',
        title: 'Cursor Agentic Mode Launched',
        published_at: new Date().toISOString(),
        raw_text: 'Cursor launches multi-file agentic workflow.',
        content_hash: 'hash-inject',
        bullets: ['Bullet 1', 'Bullet 2', 'Bullet 3'],
        impact_score: 8,
        impact_rationale: 'Major breakthrough in editor tooling.',
        tags: ['editors-ides', 'cursor'],
        mapped_node_ids: ['node-cursor'],
        proposed_new_tool: null,
        status: 'published',
        error_record: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'news-override-003',
        domain_id: domainId,
        source_id: null,
        url: 'https://news.example.com/override',
        title: 'Cursor Supersedes Copilot Workflows',
        published_at: new Date().toISOString(),
        raw_text: 'Agentic editor replaces inline completion tool.',
        content_hash: 'hash-override',
        bullets: ['Bullet 1', 'Bullet 2', 'Bullet 3'],
        impact_score: 8,
        impact_rationale: 'Cursor supersedes Copilot.',
        tags: ['ai-assistants', 'cursor'],
        mapped_node_ids: ['node-cursor'],
        proposed_new_tool: null,
        status: 'published',
        error_record: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    // Initial user roadmap: Git (completed) -> Copilot (completed)
    dbUserNodes = [
      {
        id: 'un-git',
        user_id: testUserId,
        node_id: 'node-git',
        status: 'completed',
        origin: 'baseline',
        fast_track: false,
        replaced_node_id: null,
        version: 1,
        completed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'un-copilot',
        user_id: testUserId,
        node_id: 'node-copilot',
        status: 'completed',
        origin: 'baseline',
        fast_track: false,
        replaced_node_id: null,
        version: 1,
        completed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    dbVerdicts = [
      {
        id: 'verdict-shield-001',
        news_item_id: 'news-shield-001',
        verdict: 'shield',
        target_node_id: null,
        new_node_id: null,
        insert_after_node_ids: [],
        reasoning: 'Impact score below threshold; existing stack covers this advancement.',
        cache_key: 'cache-shield',
        created_at: new Date().toISOString(),
      },
      {
        id: 'verdict-inject-002',
        news_item_id: 'news-inject-002',
        verdict: 'injection',
        target_node_id: null,
        new_node_id: 'node-cursor',
        insert_after_node_ids: ['node-git'],
        reasoning: 'Cursor represents a high-impact breakthrough capability.',
        cache_key: 'cache-inject',
        created_at: new Date().toISOString(),
      },
      {
        id: 'verdict-override-003',
        news_item_id: 'news-override-003',
        verdict: 'override',
        target_node_id: 'node-copilot',
        new_node_id: 'node-cursor',
        insert_after_node_ids: [],
        reasoning: 'Cursor supersedes Copilot workflows.',
        cache_key: 'cache-override',
        created_at: new Date().toISOString(),
      },
      {
        id: 'verdict-unapproved-004',
        news_item_id: 'news-inject-002',
        verdict: 'injection',
        target_node_id: null,
        new_node_id: 'node-unapproved',
        insert_after_node_ids: ['node-git'],
        reasoning: 'Trying to inject unapproved node.',
        cache_key: 'cache-unapproved',
        created_at: new Date().toISOString(),
      },
    ];

    dbUserVerdicts = [];
  });

  // Mock Supabase Client that implements transactional table semantics & RPC
  function createMockSupabaseClient() {
    return {
      auth: {
        getUser: async (token: string) => {
          if (token === 'valid-user-token') {
            return { data: { user: { id: testUserId } }, error: null };
          }
          return { data: { user: null }, error: new Error('Invalid token') };
        },
      },
      from: (tableName: string) => {
        let filters: Array<(row: any) => boolean> = [];
        let selectColumns = '*';

        const builder: any = {
          select: (cols: string = '*') => {
            selectColumns = cols;
            return builder;
          },
          eq: (field: string, val: any) => {
            filters.push((row: any) => row[field] === val);
            return builder;
          },
          single: async () => {
            const table = getTableData(tableName);
            const filtered = table.filter((r) => filters.every((fn) => fn(r)));
            if (filtered.length === 0) {
              return { data: null, error: { message: 'Row not found' } };
            }
            return { data: enrichRow(tableName, filtered[0], selectColumns), error: null };
          },
          maybeSingle: async () => {
            const table = getTableData(tableName);
            const filtered = table.filter((r) => filters.every((fn) => fn(r)));
            if (filtered.length === 0) {
              return { data: null, error: null };
            }
            return { data: enrichRow(tableName, filtered[0], selectColumns), error: null };
          },
          upsert: async (records: any | any[]) => {
            const arr = Array.isArray(records) ? records : [records];
            for (const r of arr) {
              if (tableName === 'user_verdicts') {
                const idx = dbUserVerdicts.findIndex(
                  (uv) => uv.user_id === r.user_id && uv.news_item_id === r.news_item_id,
                );
                if (idx >= 0) {
                  dbUserVerdicts[idx] = { ...dbUserVerdicts[idx], ...r, updated_at: new Date().toISOString() };
                } else {
                  dbUserVerdicts.push({
                    id: `uv-${Date.now()}-${Math.random()}`,
                    applied_at: r.state === 'applied' ? new Date().toISOString() : null,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    ...r,
                  });
                }
              }
            }
            return { data: records, error: null };
          },
        };

        // When awaited directly
        builder.then = (resolve: any, reject: any) => {
          try {
            const table = getTableData(tableName);
            const filtered = table.filter((r) => filters.every((fn) => fn(r)));
            const result = filtered.map((row) => enrichRow(tableName, row, selectColumns));
            resolve({ data: result, error: null });
          } catch (err) {
            reject(err);
          }
        };

        return builder;
      },
      rpc: async (fnName: string, args: any) => {
        if (fnName === 'apply_verdict_transaction') {
          if (simulateRpcFailure) {
            return { data: null, error: { message: 'Simulated mid-transaction database rollback' } };
          }

          const {
            p_user_id,
            p_news_item_id,
            p_verdict_id,
            p_verdict_type,
            p_target_node_id,
            p_new_node_id,
          } = args;

          // Check idempotency
          const existing = dbUserVerdicts.find(
            (uv) => uv.user_id === p_user_id && uv.news_item_id === p_news_item_id,
          );
          if (existing && existing.state === 'applied') {
            return {
              data: { success: true, already_applied: true, message: 'Verdict has already been applied' },
              error: null,
            };
          }

          if (p_verdict_type === 'shield') {
            const uvIdx = dbUserVerdicts.findIndex(
              (uv) => uv.user_id === p_user_id && uv.news_item_id === p_news_item_id,
            );
            if (uvIdx >= 0) {
              dbUserVerdicts[uvIdx].state = 'applied';
              dbUserVerdicts[uvIdx].applied_at = new Date().toISOString();
            } else {
              dbUserVerdicts.push({
                id: `uv-${Date.now()}`,
                user_id: p_user_id,
                news_item_id: p_news_item_id,
                verdict_id: p_verdict_id,
                state: 'applied',
                applied_at: new Date().toISOString(),
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              });
            }
            return { data: { success: true, verdict_type: 'shield', mutated: false }, error: null };
          }

          if (p_verdict_type === 'injection') {
            // Check approved canonical node
            const cNode = dbCanonicalNodes.find((n) => n.id === p_new_node_id);
            if (!cNode || cNode.status !== 'approved') {
              return { data: null, error: { message: 'Only approved canonical nodes can be injected' } };
            }

            // Insert user_node
            const unIdx = dbUserNodes.findIndex(
              (un) => un.user_id === p_user_id && un.node_id === p_new_node_id,
            );
            if (unIdx >= 0) {
              dbUserNodes[unIdx].version += 1;
              dbUserNodes[unIdx].origin = 'injection';
            } else {
              dbUserNodes.push({
                id: `un-${Date.now()}`,
                user_id: p_user_id,
                node_id: p_new_node_id,
                status: 'todo',
                origin: 'injection',
                fast_track: false,
                replaced_node_id: null,
                version: 1,
                completed_at: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              });
            }

            // Mark user_verdict applied
            const uvIdx = dbUserVerdicts.findIndex(
              (uv) => uv.user_id === p_user_id && uv.news_item_id === p_news_item_id,
            );
            if (uvIdx >= 0) {
              dbUserVerdicts[uvIdx].state = 'applied';
            } else {
              dbUserVerdicts.push({
                id: `uv-${Date.now()}`,
                user_id: p_user_id,
                news_item_id: p_news_item_id,
                verdict_id: p_verdict_id,
                state: 'applied',
                applied_at: new Date().toISOString(),
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              });
            }

            return {
              data: { success: true, verdict_type: 'injection', mutated: true, new_node_id: p_new_node_id },
              error: null,
            };
          }

          if (p_verdict_type === 'override') {
            const target = dbUserNodes.find(
              (un) => un.user_id === p_user_id && un.node_id === p_target_node_id,
            );
            if (!target || target.status === 'archived') {
              return { data: null, error: { message: 'Target node invalid or already archived' } };
            }

            const hasSupersedes = dbSupersedes.some(
              (s) => s.old_node === p_target_node_id && s.new_node === p_new_node_id && s.status === 'approved',
            );
            if (!hasSupersedes) {
              return { data: null, error: { message: 'No approved supersedes relationship' } };
            }

            // 1. Archive old node (preserves completion history and completed_at!)
            target.status = 'archived';
            target.version += 1;
            target.updated_at = new Date().toISOString();

            // 2. Insert new node (fast_track = true)
            dbUserNodes.push({
              id: `un-${Date.now()}`,
              user_id: p_user_id,
              node_id: p_new_node_id,
              status: 'todo',
              origin: 'override',
              fast_track: true,
              replaced_node_id: p_target_node_id,
              version: 1,
              completed_at: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });

            // 3. Mark user_verdict applied
            const uvIdx = dbUserVerdicts.findIndex(
              (uv) => uv.user_id === p_user_id && uv.news_item_id === p_news_item_id,
            );
            if (uvIdx >= 0) {
              dbUserVerdicts[uvIdx].state = 'applied';
            } else {
              dbUserVerdicts.push({
                id: `uv-${Date.now()}`,
                user_id: p_user_id,
                news_item_id: p_news_item_id,
                verdict_id: p_verdict_id,
                state: 'applied',
                applied_at: new Date().toISOString(),
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              });
            }

            return {
              data: {
                success: true,
                verdict_type: 'override',
                mutated: true,
                old_node_id: p_target_node_id,
                new_node_id: p_new_node_id,
              },
              error: null,
            };
          }

          return { data: null, error: { message: 'Unknown verdict type' } };
        }
        return { data: null, error: { message: 'Unknown function' } };
      },
    } as any;
  }

  function getTableData(tableName: string): any[] {
    switch (tableName) {
      case 'canonical_nodes':
        return dbCanonicalNodes;
      case 'canonical_edges':
        return dbCanonicalEdges;
      case 'node_supersedes':
        return dbSupersedes;
      case 'news_items':
        return dbNewsItems;
      case 'user_nodes':
        return dbUserNodes;
      case 'verdicts':
        return dbVerdicts;
      case 'user_verdicts':
        return dbUserVerdicts;
      default:
        return [];
    }
  }

  function enrichRow(tableName: string, row: any, selectCols: string): any {
    if (tableName === 'user_nodes' && selectCols.includes('canonical_nodes')) {
      const cNode = dbCanonicalNodes.find((n) => n.id === row.node_id);
      return { ...row, canonical_node: cNode };
    }
    return row;
  }

  // --- TESTS ---

  it('1. Shield Path: Marks user_verdicts state="applied" with zero roadmap mutation', async () => {
    const mockClient = createMockSupabaseClient();
    const initialUserNodesCount = dbUserNodes.length;

    const req = new Request('http://localhost:54321/functions/v1/apply-verdict', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-user-token',
      },
      body: JSON.stringify({
        verdict_id: 'verdict-shield-001',
      }),
    });

    const res = await handleApplyVerdict(req, mockClient);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.verdict_type).toBe('shield');
    expect(json.mutated).toBe(false);

    // Assert user_verdicts is applied
    const uv = dbUserVerdicts.find(
      (u) => u.user_id === testUserId && u.news_item_id === 'news-shield-001',
    );
    expect(uv).toBeDefined();
    expect(uv?.state).toBe('applied');

    // Assert roadmap was not mutated
    expect(dbUserNodes.length).toBe(initialUserNodesCount);
  });

  it('2. Injection Path: Revalidates server-side, inserts user_nodes row (origin="injection", status="todo"), and sets state="applied"', async () => {
    const mockClient = createMockSupabaseClient();
    const initialCount = dbUserNodes.length;

    const req = new Request('http://localhost:54321/functions/v1/apply-verdict', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-user-token',
      },
      body: JSON.stringify({
        verdict_id: 'verdict-inject-002',
      }),
    });

    const res = await handleApplyVerdict(req, mockClient);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.verdict_type).toBe('injection');
    expect(json.mutated).toBe(true);
    expect(json.new_node_id).toBe('node-cursor');

    // Assert new node exists in user_nodes with origin='injection'
    const newNode = dbUserNodes.find((un) => un.node_id === 'node-cursor');
    expect(newNode).toBeDefined();
    expect(newNode?.status).toBe('todo');
    expect(newNode?.origin).toBe('injection');
    expect(newNode?.fast_track).toBe(false);
    expect(dbUserNodes.length).toBe(initialCount + 1);

    // Assert user_verdicts is applied
    const uv = dbUserVerdicts.find(
      (u) => u.user_id === testUserId && u.news_item_id === 'news-inject-002',
    );
    expect(uv?.state).toBe('applied');
  });

  it('3. Override Path: Archives old node (preserving completed_at history), inserts replacement node (fast_track=true), and marks state="applied"', async () => {
    const mockClient = createMockSupabaseClient();
    const oldCopilotNode = dbUserNodes.find((un) => un.node_id === 'node-copilot')!;
    const originalCompletedAt = oldCopilotNode.completed_at;
    expect(originalCompletedAt).toBeTruthy();

    const req = new Request('http://localhost:54321/functions/v1/apply-verdict', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-user-token',
      },
      body: JSON.stringify({
        verdict_id: 'verdict-override-003',
      }),
    });

    const res = await handleApplyVerdict(req, mockClient);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.verdict_type).toBe('override');
    expect(json.mutated).toBe(true);
    expect(json.old_node_id).toBe('node-copilot');
    expect(json.new_node_id).toBe('node-cursor');

    // 1. Verify old node is archived but NEVER deleted, and completed_at is preserved
    const archivedCopilot = dbUserNodes.find((un) => un.node_id === 'node-copilot');
    expect(archivedCopilot).toBeDefined();
    expect(archivedCopilot?.status).toBe('archived');
    expect(archivedCopilot?.completed_at).toBe(originalCompletedAt); // History preserved!

    // 2. Verify new node is inserted with fast_track=true and origin=override
    const cursorNode = dbUserNodes.find((un) => un.node_id === 'node-cursor');
    expect(cursorNode).toBeDefined();
    expect(cursorNode?.status).toBe('todo');
    expect(cursorNode?.origin).toBe('override');
    expect(cursorNode?.fast_track).toBe(true);
    expect(cursorNode?.replaced_node_id).toBe('node-copilot');

    // 3. Verify user_verdicts is marked applied
    const uv = dbUserVerdicts.find(
      (u) => u.user_id === testUserId && u.news_item_id === 'news-override-003',
    );
    expect(uv?.state).toBe('applied');
  });

  it('4. Rejection of unapproved canonical node: Revalidation rejects injection and sets state="failed"', async () => {
    const mockClient = createMockSupabaseClient();
    const initialCount = dbUserNodes.length;

    const req = new Request('http://localhost:54321/functions/v1/apply-verdict', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-user-token',
      },
      body: JSON.stringify({
        verdict_id: 'verdict-unapproved-004',
      }),
    });

    const res = await handleApplyVerdict(req, mockClient);
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe('INJECTION_REVALIDATION_FAILED');

    // Roadmap remains completely unaltered
    expect(dbUserNodes.length).toBe(initialCount);

    // user_verdicts is flagged as 'failed'
    const uv = dbUserVerdicts.find((u) => u.user_id === testUserId);
    expect(uv?.state).toBe('failed');
  });

  it('5. Forced mid-transaction failure: Leaves roadmap completely unchanged and sets state="failed"', async () => {
    simulateRpcFailure = true;
    const mockClient = createMockSupabaseClient();
    const initialUserNodes = JSON.stringify(dbUserNodes);

    const req = new Request('http://localhost:54321/functions/v1/apply-verdict', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-user-token',
      },
      body: JSON.stringify({
        verdict_id: 'verdict-inject-002',
      }),
    });

    const res = await handleApplyVerdict(req, mockClient);
    expect(res.status).toBe(500);

    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe('TRANSACTION_FAILED');

    // Verify roadmap was not modified at all (atomic rollback)
    expect(JSON.stringify(dbUserNodes)).toBe(initialUserNodes);

    // user_verdicts state is recorded as 'failed'
    const uv = dbUserVerdicts.find(
      (u) => u.user_id === testUserId && u.news_item_id === 'news-inject-002',
    );
    expect(uv?.state).toBe('failed');
  });

  it('6. Double-apply is an idempotent no-op: second call does not re-mutate roadmap', async () => {
    const mockClient = createMockSupabaseClient();

    const makeRequest = () =>
      new Request('http://localhost:54321/functions/v1/apply-verdict', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-user-token',
        },
        body: JSON.stringify({
          verdict_id: 'verdict-inject-002',
        }),
      });

    // First call: succeeds and mutates roadmap
    const res1 = await handleApplyVerdict(makeRequest(), mockClient);
    expect(res1.status).toBe(200);
    const json1 = await res1.json();
    expect(json1.success).toBe(true);
    expect(json1.mutated).toBe(true);

    const userNodesAfterFirstApply = dbUserNodes.length;

    // Second call: idempotent no-op!
    const res2 = await handleApplyVerdict(makeRequest(), mockClient);
    expect(res2.status).toBe(200);
    const json2 = await res2.json();
    expect(json2.success).toBe(true);
    expect(json2.already_applied).toBe(true);
    expect(json2.mutated).toBe(false);

    // Roadmap count and versions remain unchanged
    expect(dbUserNodes.length).toBe(userNodesAfterFirstApply);
  });
});
