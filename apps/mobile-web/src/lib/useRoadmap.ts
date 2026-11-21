import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { supabase } from './supabase';
import { getBundledCanonicalGraph } from './roadmapService';
import type {
  CanonicalEdge,
  CanonicalNode,
  UserNode,
} from '@repo/schemas';
import type { EnrichedRoadmapNode, NodeVisualStatus } from './graphLayout';
import { computeNodeVisualStatus } from './roadmapRules';
import { broadcastSyncEvent } from './realtimeSync';

export { computeNodeVisualStatus, canTransitionToStatus } from './roadmapRules';

export interface RoadmapQueryResult {
  nodes: EnrichedRoadmapNode[];
  edges: CanonicalEdge[];
  prereqMap: Map<string, string[]>; // node_id -> array of prerequisite node_ids
  dependentMap: Map<string, string[]>; // node_id -> array of dependent node_ids
  stats: {
    total: number;
    completed: number;
    available: number;
    inProgress: number;
    locked: number;
    archived: number;
  };
}

/** Fetch and assemble the user's roadmap */
export async function fetchUserRoadmap(userId: string): Promise<RoadmapQueryResult> {
  const fallbackGraph = getBundledCanonicalGraph();

  let userNodesData: UserNode[] = [];
  let canonicalNodes: CanonicalNode[] = fallbackGraph.nodes;
  let canonicalEdges: CanonicalEdge[] = fallbackGraph.edges;

  // 1. Fetch from Supabase if online with fast timeout fallback
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 600);

    const [userNodesRes, canonicalNodesRes, canonicalEdgesRes] = await Promise.all([
      supabase.from('user_nodes').select('*').eq('user_id', userId).abortSignal(controller.signal),
      supabase.from('canonical_nodes').select('*').eq('status', 'approved').abortSignal(controller.signal),
      supabase.from('canonical_edges').select('*').abortSignal(controller.signal),
    ]);
    clearTimeout(timer);

    if (!userNodesRes.error && userNodesRes.data && userNodesRes.data.length > 0) {
      userNodesData = userNodesRes.data as unknown as UserNode[];
    }
    if (!canonicalNodesRes.error && canonicalNodesRes.data && canonicalNodesRes.data.length > 0) {
      canonicalNodes = canonicalNodesRes.data as unknown as CanonicalNode[];
    }
    if (!canonicalEdgesRes.error && canonicalEdgesRes.data && canonicalEdgesRes.data.length > 0) {
      canonicalEdges = canonicalEdgesRes.data as unknown as CanonicalEdge[];
    }
  } catch {
    // ignore offline
  }

  // 2. Check mock storage if user_nodes not in DB
  if (userNodesData.length === 0 && typeof window !== 'undefined') {
    try {
      const raw =
        window.sessionStorage?.getItem('__atlas_user_nodes__') ||
        window.localStorage?.getItem('__atlas_user_nodes__');
      if (raw) {
        userNodesData = JSON.parse(raw);
      }
    } catch {
      // ignore
    }
  }

  // Fallback default: create baseline user_nodes if neither DB nor session has them
  if (userNodesData.length === 0) {
    userNodesData = canonicalNodes.map((n, idx) => ({
      id: `mock-un-${idx}`,
      user_id: userId,
      node_id: n.id,
      status: 'todo',
      origin: 'baseline' as const,
      fast_track: false,
      replaced_node_id: null,
      completed_at: null,
      version: 1,
    }));
  }

  // 3. Build Adjacency Maps
  const prereqMap = new Map<string, string[]>();
  const dependentMap = new Map<string, string[]>();

  for (const edge of canonicalEdges) {
    if (!prereqMap.has(edge.to_node)) prereqMap.set(edge.to_node, []);
    prereqMap.get(edge.to_node)!.push(edge.from_node);

    if (!dependentMap.has(edge.from_node)) dependentMap.set(edge.from_node, []);
    dependentMap.get(edge.from_node)!.push(edge.to_node);
  }

  // Quick lookup of user node by canonical node id
  const userNodeByCanonicalId = new Map<string, UserNode>();
  for (const un of userNodesData) {
    userNodeByCanonicalId.set(un.node_id, un);
  }

  // 4. Enrich nodes with visual status
  const enrichedNodes: EnrichedRoadmapNode[] = [];
  const stats = {
    total: 0,
    completed: 0,
    available: 0,
    inProgress: 0,
    locked: 0,
    archived: 0,
  };

  const canonicalById = new Map<string, CanonicalNode>();
  for (const n of canonicalNodes) {
    canonicalById.set(n.id, n);
  }

  for (const node of canonicalNodes) {
    const un = userNodeByCanonicalId.get(node.id);
    const rawStatus = un?.status || 'todo';
    const prereqIds = prereqMap.get(node.id) || [];

    const visualStatus = computeNodeVisualStatus(rawStatus, prereqIds, userNodeByCanonicalId);

    stats.total++;
    if (visualStatus === 'completed') stats.completed++;
    else if (visualStatus === 'available') stats.available++;
    else if (visualStatus === 'in_progress') stats.inProgress++;
    else if (visualStatus === 'locked') stats.locked++;
    else if (visualStatus === 'archived') stats.archived++;

    enrichedNodes.push({
      ...node,
      userNodeId: un?.id,
      status: visualStatus,
      fast_track: un?.fast_track ?? false,
      completed_at: un?.completed_at ?? null,
      version: un?.version ?? 1,
    });
  }

  // Filter edges to only include nodes that exist in canonicalNodes
  const validNodeIds = new Set(canonicalNodes.map((n) => n.id));
  const validEdges = canonicalEdges.filter(
    (e) => validNodeIds.has(e.from_node) && validNodeIds.has(e.to_node),
  );

  return {
    nodes: enrichedNodes,
    edges: validEdges,
    prereqMap,
    dependentMap,
    stats,
  };
}

export function useRoadmap(userId: string) {
  const queryClient = useQueryClient();
  const queryKey = ['roadmap', userId];

  const query = useQuery({
    queryKey,
    queryFn: () => fetchUserRoadmap(userId),
    staleTime: 1000 * 60 * 2,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({
      nodeId,
      newStatus,
      expectedVersion,
    }: {
      nodeId: string;
      newStatus: string;
      expectedVersion?: number;
    }) => {
      // 1. Haptic feedback
      if (Platform.OS !== 'web') {
        try {
          if (newStatus === 'completed') {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } else {
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          }
        } catch {
          // ignore
        }
      }

      const completedAt =
        newStatus === 'completed' ? new Date().toISOString() : null;

      // Determine version to check
      let currentVersion = expectedVersion;
      if (currentVersion === undefined) {
        const currentData = queryClient.getQueryData<RoadmapQueryResult>(queryKey);
        const currentTarget = currentData?.nodes.find((n) => n.id === nodeId);
        currentVersion = currentTarget?.version || 1;
      }

      const nextVersion = currentVersion + 1;
      let conflictDetected = false;

      // 2. Persist to Supabase with optimistic concurrency version check (PRD Section 12)
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 600);

        const { data, error } = await supabase
          .from('user_nodes')
          .update({
            status: newStatus as any,
            completed_at: completedAt,
            version: nextVersion,
          })
          .eq('user_id', userId)
          .eq('node_id', nodeId)
          .eq('version', currentVersion)
          .select()
          .abortSignal(controller.signal);

        clearTimeout(timer);

        if (!error && data && data.length === 0) {
          // 0 rows updated means version on DB changed: conflict!
          conflictDetected = true;
        }
      } catch {
        // offline fallback
      }

      // 3. Update session & local storage if mock mode
      if (typeof window !== 'undefined') {
        try {
          const raw =
            window.sessionStorage?.getItem('__atlas_user_nodes__') ||
            window.localStorage?.getItem('__atlas_user_nodes__');
          if (raw) {
            const list: UserNode[] = JSON.parse(raw);
            const found = list.find((u) => u.node_id === nodeId);
            if (found) {
              if (expectedVersion !== undefined && found.version !== expectedVersion) {
                conflictDetected = true;
              } else {
                found.status = newStatus as UserNode['status'];
                found.completed_at = completedAt;
                found.version = nextVersion;
                const serialized = JSON.stringify(list);
                window.sessionStorage?.setItem('__atlas_user_nodes__', serialized);
                window.localStorage?.setItem('__atlas_user_nodes__', serialized);
              }
            }
          }
        } catch {
          // ignore
        }
      }

      if (conflictDetected) {
        // Refetch latest state on conflict (PRD Section 12)
        void queryClient.invalidateQueries({ queryKey });
        return { nodeId, newStatus, completedAt, conflict: true };
      }

      // 4. Broadcast live sync event to other tabs/windows
      broadcastSyncEvent({
        type: 'USER_NODE_UPDATED',
        userId,
        payload: {
          nodeId,
          status: newStatus,
          version: nextVersion,
          completed_at: completedAt,
        },
      });

      return { nodeId, newStatus, completedAt, conflict: false };
    },

    // Optimistic Update
    onMutate: async ({ nodeId, newStatus }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<RoadmapQueryResult>(queryKey);

      if (previous) {
        const completedAt = newStatus === 'completed' ? new Date().toISOString() : null;
        const updatedNodes = previous.nodes.map((n) => {
          if (n.id === nodeId) {
            return {
              ...n,
              status: (newStatus === 'known' ? 'completed' : newStatus) as NodeVisualStatus,
              completed_at: completedAt,
              version: (n.version || 1) + 1,
            };
          }
          return n;
        });

        // Re-evaluate visual statuses of downstream nodes
        const userNodeMap = new Map<string, { status: string }>();
        for (const n of updatedNodes) {
          userNodeMap.set(n.id, { status: n.status });
        }

        const recheckedNodes = updatedNodes.map((n) => {
          if (n.status === 'completed' || n.status === 'archived' || n.status === 'in_progress') {
            return n;
          }
          const prereqIds = previous.prereqMap.get(n.id) || [];
          const vis = computeNodeVisualStatus(n.status, prereqIds, userNodeMap);
          return { ...n, status: vis };
        });

        queryClient.setQueryData<RoadmapQueryResult>(queryKey, {
          ...previous,
          nodes: recheckedNodes,
        });
      }

      return { previous };
    },

    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  return {
    ...query,
    updateStatus: updateStatusMutation.mutateAsync,
    isUpdating: updateStatusMutation.isPending,
  };
}
