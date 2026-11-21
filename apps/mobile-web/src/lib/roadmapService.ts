import { supabase } from './supabase';
import { generateBaselineRoadmap, mergeRoadmapWithBaseline } from '@repo/graph';
import type {
  CanonicalGraph,
  CanonicalNode,
  LevelsByArea,
  Roadmap,
  UserNode,
} from '@repo/schemas';
import seedData from '../../../../supabase/seed/canonical-graph/ai-assisted-software-development.json';
import { useAuthStore } from './authStore';
import { broadcastSyncEvent } from './realtimeSync';

export interface CreateBaselineParams {
  domainId?: string;
  domainSlug?: string;
  selectedNodeIds: string[];
  levelsByArea: LevelsByArea;
}

/** Get the bundled fallback canonical graph for the default domain */
export function getBundledCanonicalGraph(
  domainId = '00000000-0000-0000-0000-000000000001',
): CanonicalGraph {
  const slugToId = new Map<string, string>();
  const nodes: CanonicalNode[] = seedData.nodes.map((n, idx) => {
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

  const edges = (seedData.edges as [string, string][])
    .filter(([from, to]) => slugToId.has(from) && slugToId.has(to))
    .map(([from, to], idx) => ({
      id: `00000000-0000-0000-0002-${String(idx + 1).padStart(12, '0')}`,
      from_node: slugToId.get(from)!,
      to_node: slugToId.get(to)!,
    }));

  return {
    domain_id: domainId,
    nodes,
    edges,
  };
}

/** Fetch approved canonical nodes, with fallback to bundled seed */
export async function fetchApprovedCanonicalNodes(
  domainId?: string,
): Promise<CanonicalNode[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1000);

    let query = supabase
      .from('canonical_nodes')
      .select('*')
      .eq('status', 'approved')
      .abortSignal(controller.signal);

    if (domainId) {
      query = query.eq('domain_id', domainId);
    }

    const { data, error } = await query;
    clearTimeout(timeout);
    if (!error && data && data.length > 0) {
      return data as CanonicalNode[];
    }
  } catch {
    // ignore network/offline errors and use fallback
  }

  // Fallback to launch seed dataset
  return getBundledCanonicalGraph(domainId).nodes;
}

/**
 * Creates the baseline roadmap.
 * Calls Supabase Edge Function `create-baseline-roadmap`.
 * If Edge Function or Supabase is unavailable (offline / mock dev), gracefully computes
 * the pure @repo/graph roadmap and updates local profile state.
 */
export async function createBaselineRoadmap(
  params: CreateBaselineParams,
): Promise<Roadmap> {
  const { user, profile } = useAuthStore.getState();
  const userId = user?.id || '00000000-0000-0000-0000-000000000099';
  const domainId = params.domainId || '00000000-0000-0000-0000-000000000001';

  // 1. Attempt server-side Edge Function invocation
  try {
    const { data, error } = await supabase.functions.invoke(
      'create-baseline-roadmap',
      {
        body: {
          domain_id: domainId,
          domain_slug: params.domainSlug,
          selected_node_ids: params.selectedNodeIds,
          levels_by_area: params.levelsByArea,
        },
      },
    );

    if (!error && data?.success && data?.roadmap) {
      // Edge function succeeded! Update local profile state
      if (profile) {
        useAuthStore.getState().setProfile({
          ...profile,
          domain_id: domainId,
          experience: params.levelsByArea,
          onboarding_completed: true,
        });
      }
      return data.roadmap as Roadmap;
    }
  } catch {
    // Fall back to pure client execution / RPC
  }

  // 2. Client-side fallback using @repo/graph
  const canonicalGraph = getBundledCanonicalGraph(domainId);
  const result = generateBaselineRoadmap(
    canonicalGraph,
    params.selectedNodeIds,
    params.levelsByArea,
    userId,
  );

  if (!result.ok) {
    throw new Error(`Failed to generate baseline roadmap: ${result.error}`);
  }

  const roadmap = result.value;

  // Persist locally in storage if running in mock auth mode
  if (typeof window !== 'undefined') {
    try {
      const mockAuthRaw =
        window.sessionStorage?.getItem('__mock_auth__') ||
        window.localStorage?.getItem('__mock_auth__');
      if (mockAuthRaw) {
        const parsed = JSON.parse(mockAuthRaw);
        if (parsed.profile) {
          parsed.profile.onboarding_completed = true;
          parsed.profile.experience = params.levelsByArea;
          parsed.profile.domain_id = domainId;
          const authSerialized = JSON.stringify(parsed);
          window.sessionStorage?.setItem('__mock_auth__', authSerialized);
          window.localStorage?.setItem('__mock_auth__', authSerialized);
        }
      }
      // Store user nodes in mock storage for E2E validation
      const nodesSerialized = JSON.stringify(roadmap.user_nodes);
      window.sessionStorage?.setItem('__atlas_user_nodes__', nodesSerialized);
      window.localStorage?.setItem('__atlas_user_nodes__', nodesSerialized);
    } catch {
      // ignore
    }
  }

  // Attempt transactional RPC if connected to DB
  try {
    await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<unknown>)(
      'save_baseline_roadmap',
      {
        p_user_id: userId,
        p_domain_id: domainId,
        p_experience: params.levelsByArea,
        p_user_nodes: roadmap.user_nodes.map((un) => ({
          node_id: un.node_id,
          status: un.status,
          origin: un.origin,
          fast_track: un.fast_track,
        })),
      },
    );
  } catch {
    // ignore if DB is offline during mock tests
  }

  // Update zustand store
  if (profile) {
    useAuthStore.getState().setProfile({
      ...profile,
      domain_id: domainId,
      experience: params.levelsByArea,
      onboarding_completed: true,
    });
  }

  return roadmap;
}

/**
 * Re-runs baseline generation with updated known stack and levels WITHOUT losing
 * completed, in-progress, or archived state (PRD Section 11.5).
 */
export async function updateRoadmapStackAndLevels(
  selectedNodeIds: string[],
  levelsByArea: LevelsByArea,
): Promise<Roadmap> {
  const { user, profile } = useAuthStore.getState();
  const userId = user?.id || '00000000-0000-0000-0000-000000000099';
  const domainId = profile?.domain_id || '00000000-0000-0000-0000-000000000001';
  const canonicalGraph = getBundledCanonicalGraph(domainId);

  // 1. Fetch current user_nodes
  let currentUserNodes: UserNode[] = [];
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 600);
    const { data, error } = await supabase
      .from('user_nodes')
      .select('*')
      .eq('user_id', userId)
      .abortSignal(controller.signal);
    clearTimeout(timer);
    if (!error && data && data.length > 0) {
      currentUserNodes = data as unknown as UserNode[];
    }
  } catch {
    // offline
  }

  // Fallback to mock session storage
  if (currentUserNodes.length === 0 && typeof window !== 'undefined' && window.sessionStorage) {
    try {
      const raw = window.sessionStorage.getItem('__atlas_user_nodes__');
      if (raw) {
        currentUserNodes = JSON.parse(raw);
      }
    } catch {
      // ignore
    }
  }

  // If still empty, initialize from canonical
  if (currentUserNodes.length === 0) {
    currentUserNodes = canonicalGraph.nodes.map((n, idx) => ({
      id: `init-un-${idx}`,
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

  const currentRoadmap: Roadmap = {
    user_id: userId,
    domain_id: domainId,
    nodes: canonicalGraph.nodes,
    edges: canonicalGraph.edges,
    user_nodes: currentUserNodes,
  };

  // 2. Pure immutable merge via @repo/graph
  const mergeResult = mergeRoadmapWithBaseline(
    currentRoadmap,
    selectedNodeIds,
    levelsByArea,
    canonicalGraph,
  );

  if (!mergeResult.ok) {
    throw new Error(`Failed to merge roadmap: ${mergeResult.error}`);
  }

  const mergedRoadmap = mergeResult.value;

  // 3. Persist to Supabase
  try {
    // Update profile experience
    await supabase
      .from('profiles')
      .update({
        experience: levelsByArea,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    // Upsert merged user_nodes
    const userNodesPayload = mergedRoadmap.user_nodes.map((un) => ({
      user_id: userId,
      node_id: un.node_id,
      status: un.status,
      origin: un.origin,
      fast_track: un.fast_track,
      replaced_node_id: un.replaced_node_id,
      completed_at: un.completed_at,
      version: un.version,
    }));

    await supabase.from('user_nodes').upsert(userNodesPayload, {
      onConflict: 'user_id,node_id',
    });
  } catch {
    // offline fallback
  }

  // 4. Update storage if mock mode
  if (typeof window !== 'undefined') {
    try {
      const nodesSerialized = JSON.stringify(mergedRoadmap.user_nodes);
      window.sessionStorage?.setItem('__atlas_user_nodes__', nodesSerialized);
      window.localStorage?.setItem('__atlas_user_nodes__', nodesSerialized);

      const mockAuthRaw =
        window.sessionStorage?.getItem('__mock_auth__') ||
        window.localStorage?.getItem('__mock_auth__');
      if (mockAuthRaw) {
        const parsed = JSON.parse(mockAuthRaw);
        if (parsed.profile) {
          parsed.profile.experience = levelsByArea;
          const authSerialized = JSON.stringify(parsed);
          window.sessionStorage?.setItem('__mock_auth__', authSerialized);
          window.localStorage?.setItem('__mock_auth__', authSerialized);
        }
      }
    } catch {
      // ignore
    }
  }

  // 5. Update local AuthStore profile
  if (profile) {
    useAuthStore.getState().setProfile({
      ...profile,
      experience: levelsByArea,
    });
  }

  // 6. Broadcast sync event to all open tabs/windows
  broadcastSyncEvent({
    type: 'ROADMAP_UPDATED',
    userId,
  });

  return mergedRoadmap;
}

