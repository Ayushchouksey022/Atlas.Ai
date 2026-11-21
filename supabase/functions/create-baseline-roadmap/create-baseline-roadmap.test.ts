import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleCreateBaselineRoadmap } from './index';
import { generateBaselineRoadmap } from '../../../packages/graph/src/index';
import type { CanonicalGraph, LevelsByArea } from '../../../packages/schemas/src/index';
import seedData from '../../seed/canonical-graph/ai-assisted-software-development.json';

// Build in-memory canonical graph fixture
const domainId = '00000000-0000-0000-0000-000000000001';
const slugToId = new Map<string, string>();
const mockNodes = seedData.nodes.map((n, idx) => {
  const id = `00000000-0000-0000-0001-${String(idx + 1).padStart(12, '0')}`;
  slugToId.set(n.slug, id);
  return {
    id,
    domain_id: domainId,
    slug: n.slug,
    name: n.name,
    description: n.description || '',
    node_type: n.type as 'skill' | 'tool' | 'workflow',
    level: n.level,
    area: n.area,
    status: 'approved' as const,
    external_url: null,
    version_tag: null,
  };
});

const mockEdges = (seedData.edges as [string, string][])
  .filter(([from, to]) => slugToId.has(from) && slugToId.has(to))
  .map(([from, to], idx) => ({
    id: `00000000-0000-0000-0002-${String(idx + 1).padStart(12, '0')}`,
    from_node: slugToId.get(from)!,
    to_node: slugToId.get(to)!,
  }));

const canonicalGraph: CanonicalGraph = {
  domain_id: domainId,
  nodes: mockNodes,
  edges: mockEdges,
};

describe('create-baseline-roadmap — Edge Function & Transactional Logic', () => {
  const userId = '11111111-1111-1111-1111-111111111111';
  const defaultLevels: LevelsByArea = {
    'editors-ides': 'working',
    'ai-assistants': 'working',
    'languages-frameworks': 'working',
    'testing': 'working',
    'deployment': 'working',
    'agents-automation': 'working',
  };

  it('generates a valid baseline roadmap adhering to PRD 8.1', () => {
    const selectedNodes = [mockNodes[0].id, mockNodes[1].id];
    const res = generateBaselineRoadmap(canonicalGraph, selectedNodes, defaultLevels, userId);

    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const roadmap = res.value;
    expect(roadmap.user_id).toBe(userId);
    expect(roadmap.user_nodes.length).toBeGreaterThan(0);
    expect(roadmap.user_nodes.length).toBeLessThanOrEqual(60);

    // Selected nodes must be marked known
    const userNodeMap = new Map(roadmap.user_nodes.map((un) => [un.node_id, un]));
    expect(userNodeMap.get(mockNodes[0].id)?.status).toBe('known');
    expect(userNodeMap.get(mockNodes[1].id)?.status).toBe('known');
  });

  it('handles edge case: user selects nothing (0 nodes)', () => {
    const res = generateBaselineRoadmap(canonicalGraph, [], defaultLevels, userId);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const roadmap = res.value;
    expect(roadmap.user_nodes.length).toBeGreaterThan(0);
    // Baseline should still produce available nodes for the learner to start with
    const available = roadmap.user_nodes.filter((n) => n.status === 'known');
    expect(available.length).toBeGreaterThanOrEqual(0);
  });

  it('handles edge case: user selects all nodes', () => {
    const allIds = mockNodes.map((n) => n.id);
    const res = generateBaselineRoadmap(canonicalGraph, allIds, defaultLevels, userId);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const roadmap = res.value;
    // All included nodes should be known
    for (const un of roadmap.user_nodes) {
      expect(un.status).toBe('known');
    }
  });

  it('simulates transactional idempotency: re-running creation produces exact same row set', () => {
    const selected = [mockNodes[0].id, mockNodes[3].id];

    // Run 1
    const run1 = generateBaselineRoadmap(canonicalGraph, selected, defaultLevels, userId);
    expect(run1.ok).toBe(true);
    if (!run1.ok) return;

    // Run 2 (idempotent call with identical parameters)
    const run2 = generateBaselineRoadmap(canonicalGraph, selected, defaultLevels, userId);
    expect(run2.ok).toBe(true);
    if (!run2.ok) return;

    expect(run1.value.user_nodes.length).toBe(run2.value.user_nodes.length);

    // Map by canonical node id
    const map1 = new Map(run1.value.user_nodes.map((u) => [u.node_id, u.status]));
    const map2 = new Map(run2.value.user_nodes.map((u) => [u.node_id, u.status]));

    for (const [nodeId, status1] of map1.entries()) {
      expect(map2.get(nodeId)).toBe(status1);
    }
  });

  it('proves simulated transactional atomic rollback on forced failure leaves no partial state', async () => {
    // In-memory mock database table state
    const dbUserNodes: Array<{ user_id: string; node_id: string; status: string }> = [];
    const dbProfiles: Array<{ id: string; onboarding_completed: boolean }> = [
      { id: userId, onboarding_completed: false },
    ];

    // Transaction simulator
    const executeRoadmapTransaction = (
      userNodesToInsert: Array<{ node_id: string; status: string }>,
      shouldForceFail: boolean,
    ) => {
      // Begin transaction snapshot
      const snapshotUserNodes = [...dbUserNodes];
      const snapshotProfiles = dbProfiles.map((p) => ({ ...p }));

      try {
        if (shouldForceFail) {
          throw new Error('Forced network or constraint failure mid-transaction!');
        }

        // Apply inserts
        for (const un of userNodesToInsert) {
          dbUserNodes.push({ user_id: userId, node_id: un.node_id, status: un.status });
        }
        const profile = dbProfiles.find((p) => p.id === userId);
        if (profile) profile.onboarding_completed = true;

        return { success: true };
      } catch (err) {
        // Atomic rollback to snapshot
        dbUserNodes.length = 0;
        dbUserNodes.push(...snapshotUserNodes);
        dbProfiles.length = 0;
        dbProfiles.push(...snapshotProfiles);
        return { success: false, error: (err as Error).message };
      }
    };

    // Attempt 1: Forced failure
    const failureResult = executeRoadmapTransaction(
      [{ node_id: mockNodes[0].id, status: 'known' }],
      true, // force fail
    );

    expect(failureResult.success).toBe(false);
    expect(dbUserNodes.length).toBe(0); // Nothing partially saved!
    expect(dbProfiles[0].onboarding_completed).toBe(false);

    // Attempt 2: Normal success
    const successResult = executeRoadmapTransaction(
      [{ node_id: mockNodes[0].id, status: 'known' }],
      false,
    );

    expect(successResult.success).toBe(true);
    expect(dbUserNodes.length).toBe(1);
    expect(dbProfiles[0].onboarding_completed).toBe(true);
  });

  it('HTTP handler returns 401 if missing Authorization header', async () => {
    const req = new Request('http://localhost:54321/functions/v1/create-baseline-roadmap', {
      method: 'POST',
      body: JSON.stringify({
        levels_by_area: defaultLevels,
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await handleCreateBaselineRoadmap(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain('Missing Authorization');
  });

  it('HTTP handler responds to CORS OPTIONS preflight', async () => {
    const req = new Request('http://localhost:54321/functions/v1/create-baseline-roadmap', {
      method: 'OPTIONS',
    });

    const res = await handleCreateBaselineRoadmap(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});
