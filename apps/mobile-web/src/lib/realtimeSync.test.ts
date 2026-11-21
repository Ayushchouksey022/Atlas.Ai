import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import {
  applyNodeUpdateToCache,
  broadcastSyncEvent,
  subscribeToUserRealtime,
  type SyncEvent,
} from './realtimeSync';
import type { RoadmapQueryResult } from './useRoadmap';
import type { EnrichedRoadmapNode } from './graphLayout';
import type { CanonicalEdge } from '@repo/schemas';

function makeTestNode(id: string, status: any = 'available', version = 1): EnrichedRoadmapNode {
  return {
    id,
    domain_id: 'domain-1',
    slug: `slug-${id}`,
    name: `Node ${id}`,
    description: '',
    node_type: 'skill',
    level: 0,
    area: 'editors-ides',
    status,
    external_url: null,
    version_tag: null,
    userNodeId: `un-${id}`,
    fast_track: false,
    completed_at: null,
    version,
  };
}

describe('realtimeSync', () => {
  let queryClient: QueryClient;
  const userId = 'user-test-123';
  const queryKey = ['roadmap', userId];

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
  });

  it('applyNodeUpdateToCache updates target node and recalculates downstream visual statuses', () => {
    // A -> B: A is available, B is locked because A is not completed
    const nodeA = makeTestNode('A', 'available', 1);
    const nodeB = makeTestNode('B', 'locked', 1);

    const edges: CanonicalEdge[] = [{ id: 'e1', from_node: 'A', to_node: 'B' }];
    const prereqMap = new Map<string, string[]>([
      ['A', []],
      ['B', ['A']],
    ]);
    const dependentMap = new Map<string, string[]>([
      ['A', ['B']],
      ['B', []],
    ]);

    const initialData: RoadmapQueryResult = {
      nodes: [nodeA, nodeB],
      edges,
      prereqMap,
      dependentMap,
      stats: {
        total: 2,
        completed: 0,
        available: 1,
        inProgress: 0,
        locked: 1,
        archived: 0,
      },
    };

    queryClient.setQueryData(queryKey, initialData);

    // Apply Realtime node update: A completed with version 2
    applyNodeUpdateToCache(queryClient, userId, {
      nodeId: 'A',
      status: 'completed',
      version: 2,
      completed_at: '2026-11-22T02:00:00Z',
    });

    const updated = queryClient.getQueryData<RoadmapQueryResult>(queryKey);
    expect(updated).toBeDefined();

    const updatedA = updated?.nodes.find((n) => n.id === 'A');
    const updatedB = updated?.nodes.find((n) => n.id === 'B');

    // Node A is completed
    expect(updatedA?.status).toBe('completed');
    expect(updatedA?.version).toBe(2);
    expect(updatedA?.completed_at).toBe('2026-11-22T02:00:00Z');

    // Node B's prerequisite A is now satisfied -> B becomes 'available'!
    expect(updatedB?.status).toBe('available');

    // Stats are updated
    expect(updated?.stats.completed).toBe(1);
    expect(updated?.stats.available).toBe(1);
    expect(updated?.stats.locked).toBe(0);
  });

  it('broadcastSyncEvent safely emits events without throwing', () => {
    const event: SyncEvent = {
      type: 'USER_NODE_UPDATED',
      userId,
      payload: {
        nodeId: 'A',
        status: 'completed',
        version: 2,
        completed_at: '2026-11-22T02:00:00Z',
      },
    };

    expect(() => broadcastSyncEvent(event)).not.toThrow();
  });

  it('subscribeToUserRealtime registers cleanup function and responds to lifecycle', () => {
    const onConnectionChange = vi.fn();
    const onConflict = vi.fn();

    const unsubscribe = subscribeToUserRealtime(userId, queryClient, {
      onConnectionChange,
      onConflict,
    });

    expect(typeof unsubscribe).toBe('function');
    expect(() => unsubscribe()).not.toThrow();
  });
});
