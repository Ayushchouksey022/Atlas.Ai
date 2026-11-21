import { supabase } from './supabase';
import { generateBaselineRoadmap } from '@repo/graph';
import type {
  CanonicalGraph,
  CanonicalNode,
  LevelsByArea,
  Roadmap,
} from '@repo/schemas';
import seedData from '../../../../supabase/seed/canonical-graph/ai-assisted-software-development.json';
import { useAuthStore } from './authStore';

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

  // Persist locally in sessionStorage if running in mock auth mode
  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      const mockAuthRaw = window.sessionStorage.getItem('__mock_auth__');
      if (mockAuthRaw) {
        const parsed = JSON.parse(mockAuthRaw);
        if (parsed.profile) {
          parsed.profile.onboarding_completed = true;
          parsed.profile.experience = params.levelsByArea;
          parsed.profile.domain_id = domainId;
          window.sessionStorage.setItem('__mock_auth__', JSON.stringify(parsed));
        }
      }
      // Store user nodes in mock session for E2E validation
      window.sessionStorage.setItem(
        '__atlas_user_nodes__',
        JSON.stringify(roadmap.user_nodes),
      );
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
