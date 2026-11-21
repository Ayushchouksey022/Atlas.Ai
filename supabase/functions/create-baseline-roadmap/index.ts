/**
 * Supabase Edge Function: create-baseline-roadmap
 *
 * Implements server-side baseline roadmap generation following PRD Section 8.1.
 * Pure graph logic is delegated to @repo/graph generateBaselineRoadmap.
 * Persists user_nodes and profile update atomically in ONE transaction via save_baseline_roadmap RPC.
 */

import { createClient } from '@supabase/supabase-js';
import { generateBaselineRoadmap } from '../../../packages/graph/src/index';
import type { CanonicalGraph, LevelsByArea } from '../../../packages/schemas/src/index';

// Canonical fallback seed in case database has not been seeded yet
import seedData from '../../seed/canonical-graph/ai-assisted-software-development.json';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export interface CreateBaselineRoadmapPayload {
  domain_id?: string;
  domain_slug?: string;
  selected_node_ids?: string[];
  levels_by_area: LevelsByArea;
}

export async function handleCreateBaselineRoadmap(req: Request): Promise<Response> {
  // 1. Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
    const supabaseServiceKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      '';

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: { Authorization: authHeader },
      },
    });

    // 2. Validate user identity from JWT
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired user session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Parse input
    const body = (await req.json()) as CreateBaselineRoadmapPayload;
    const {
      domain_id,
      domain_slug = 'ai-assisted-software-development',
      selected_node_ids = [],
      levels_by_area,
    } = body;

    if (!levels_by_area || typeof levels_by_area !== 'object') {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid levels_by_area mapping' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 4. Resolve Domain & Canonical Graph
    let resolvedDomainId = domain_id;

    if (!resolvedDomainId) {
      const { data: domainData } = await supabase
        .from('domains')
        .select('id')
        .eq('slug', domain_slug)
        .maybeSingle();

      resolvedDomainId = domainData?.id || '00000000-0000-0000-0000-000000000001';
    }

    // Load approved canonical nodes and edges from Supabase
    const { data: dbNodes } = await supabase
      .from('canonical_nodes')
      .select('*')
      .eq('domain_id', resolvedDomainId)
      .eq('status', 'approved');

    const { data: dbEdges } = await supabase
      .from('canonical_edges')
      .select('*');

    let canonicalGraph: CanonicalGraph;

    if (dbNodes && dbNodes.length > 0) {
      const nodeIds = new Set(dbNodes.map((n) => n.id));
      canonicalGraph = {
        domain_id: resolvedDomainId,
        nodes: dbNodes.map((n) => ({
          id: n.id,
          domain_id: n.domain_id,
          slug: n.slug,
          name: n.name,
          description: n.description || '',
          node_type: n.node_type as 'skill' | 'tool' | 'workflow',
          level: n.level,
          area: n.area || 'general',
          status: 'approved',
          external_url: n.external_url || null,
          version_tag: n.version_tag || null,
        })),
        edges: (dbEdges || [])
          .filter((e) => nodeIds.has(e.from_node) && nodeIds.has(e.to_node))
          .map((e) => ({
            id: e.id,
            from_node: e.from_node,
            to_node: e.to_node,
          })),
      };
    } else {
      // Fallback to launch seed dataset with deterministic IDs
      const slugToId = new Map<string, string>();
      const seedNodes = seedData.nodes.map((n, idx) => {
        const id = `00000000-0000-0000-0001-${String(idx + 1).padStart(12, '0')}`;
        slugToId.set(n.slug, id);
        return {
          id,
          domain_id: resolvedDomainId!,
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

      const seedEdges = (seedData.edges as [string, string][])
        .filter(([from, to]) => slugToId.has(from) && slugToId.has(to))
        .map(([from, to], idx) => ({
          id: `00000000-0000-0000-0002-${String(idx + 1).padStart(12, '0')}`,
          from_node: slugToId.get(from)!,
          to_node: slugToId.get(to)!,
        }));

      canonicalGraph = {
        domain_id: resolvedDomainId!,
        nodes: seedNodes,
        edges: seedEdges,
      };
    }

    // 5. Generate Baseline Roadmap via pure @repo/graph logic
    const baselineResult = generateBaselineRoadmap(
      canonicalGraph,
      selected_node_ids,
      levels_by_area,
      user.id,
    );

    if (!baselineResult.ok) {
      return new Response(
        JSON.stringify({
          error: `Failed to generate baseline roadmap: ${baselineResult.error}`,
          detail: baselineResult.detail,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const roadmap = baselineResult.value;

    // ---------------------------------------------------------------------------
    // HOOK: LLM per-node personalization annotations (PRD Section 8.1 step 5)
    // Optional LLM step (cheap tier): write a one-line "why this matters for you"
    // annotation per node. Failure must not block roadmap creation.
    // NOTE: DO NOT implement the LLM call yet — specification for Prompt 5.
    // ---------------------------------------------------------------------------

    // 6. Persist user_nodes and profile update in ONE transaction via RPC
    const userNodePayload = roadmap.user_nodes.map((un) => ({
      node_id: un.node_id,
      status: un.status,
      origin: un.origin,
      fast_track: un.fast_track,
    }));

    const { data: rpcData, error: rpcError } = await supabase.rpc(
      'save_baseline_roadmap',
      {
        p_user_id: user.id,
        p_domain_id: resolvedDomainId,
        p_experience: levels_by_area,
        p_user_nodes: userNodePayload,
      },
    );

    if (rpcError) {
      console.error('[create-baseline-roadmap] RPC transaction failed:', rpcError);
      return new Response(
        JSON.stringify({
          error: 'Database transaction failed during roadmap creation',
          detail: rpcError.message,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 7. Return generated roadmap
    return new Response(
      JSON.stringify({
        success: true,
        user_id: user.id,
        domain_id: resolvedDomainId,
        nodes_count: roadmap.nodes.length,
        user_nodes_count: roadmap.user_nodes.length,
        roadmap,
        db_result: rpcData,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[create-baseline-roadmap] Unhandled error:', err);
    return new Response(
      JSON.stringify({ error: (err as Error).message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
}

// Default export for Deno serve in Supabase Edge Runtime
export default async function handler(req: Request) {
  return handleCreateBaselineRoadmap(req);
}
