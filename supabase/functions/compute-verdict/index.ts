import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  getLLMProvider,
  verdictPrompt,
  type LLMProvider,
  type VerdictInput,
} from '../../../packages/llm/src/index';
import {
  decideVerdict,
  computeCacheKey,
  computeExperienceBucket,
  type VerdictContext,
} from '../../../packages/graph/src/index';
import type {
  CanonicalNode,
  CanonicalEdge,
  Roadmap,
  UserNode,
} from '@repo/schemas';
import { triggerGuideGeneration } from '../generate-guide/index';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

export interface ComputeVerdictPayload {
  news_item_id: string;
  user_id?: string;
}

export interface ComputeVerdictResponse {
  success: boolean;
  verdict?: {
    id: string;
    news_item_id: string;
    cache_key: string;
    verdict: 'shield' | 'injection' | 'override';
    target_node_id: string | null;
    new_node_id: string | null;
    insert_after_node_ids: string[];
    reasoning: string;
    confidence: number;
    target_node?: CanonicalNode | null;
    new_node?: CanonicalNode | null;
  };
  user_verdict?: {
    id: string;
    user_id: string;
    news_item_id: string;
    verdict_id: string;
    state: string;
  };
  is_precomputed: boolean;
  cache_hit?: boolean;
  remaining_analyses: number;
  error?: string;
  message?: string;
  limit?: number;
}

export async function handleComputeVerdict(
  req: Request,
  customClient?: SupabaseClient,
  customProvider?: LLMProvider,
): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
    const supabaseServiceKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      '';

    const supabase =
      customClient ||
      createClient(supabaseUrl, supabaseServiceKey, {
        auth: { persistSession: false },
      });

    const provider = customProvider || getLLMProvider();

    let payload: ComputeVerdictPayload = { news_item_id: '' };
    if (req.method === 'POST') {
      try {
        payload = (await req.json()) as ComputeVerdictPayload;
      } catch {
        payload = { news_item_id: '' };
      }
    }

    if (!payload.news_item_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: news_item_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 1. Resolve User Identity
    let userId = payload.user_id;
    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');

    if (!userId && authHeader) {
      const token = authHeader.replace(/^Bearer\s+/i, '');
      const { data: userData, error: userError } = await supabase.auth.getUser(token);
      if (!userError && userData?.user) {
        userId = userData.user.id;
      }
    }

    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: missing or invalid user authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 2. Fetch News Item
    const { data: newsItem, error: newsError } = await supabase
      .from('news_items')
      .select('*')
      .eq('id', payload.news_item_id)
      .single();

    if (newsError || !newsItem) {
      return new Response(
        JSON.stringify({ error: 'News item not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Free tier daily limit (default 10)
    const DAILY_LIMIT = parseInt(
      process.env.FREE_TIER_DAILY_ANALYSES || '10',
      10,
    );
    const todayDate = new Date().toISOString().split('T')[0];

    // 3. Check for existing user_verdict (precomputed or previously previewed)
    const { data: existingUserVerdict } = await supabase
      .from('user_verdicts')
      .select('*')
      .eq('user_id', userId)
      .eq('news_item_id', payload.news_item_id)
      .maybeSingle();

    // Fetch user's current daily usage
    const { data: usageRow } = await supabase
      .from('usage_counters')
      .select('on_demand_analyses')
      .eq('user_id', userId)
      .eq('day', todayDate)
      .maybeSingle();

    const currentUsage = usageRow?.on_demand_analyses ?? 0;

    if (existingUserVerdict && existingUserVerdict.verdict_id) {
      // Precomputed preview hit! PRD 10.2: Precomputed previews do not count against daily limit.
      const { data: cachedVerdict } = await supabase
        .from('verdicts')
        .select('*')
        .eq('id', existingUserVerdict.verdict_id)
        .single();

      if (cachedVerdict) {
        const remainingAnalyses = Math.max(0, DAILY_LIMIT - currentUsage);
        return new Response(
          JSON.stringify({
            success: true,
            verdict: cachedVerdict,
            user_verdict: existingUserVerdict,
            is_precomputed: true,
            cache_hit: true,
            remaining_analyses: remainingAnalyses,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    // 4. On-Demand Analysis Path: Enforce daily free-tier limit
    if (currentUsage >= DAILY_LIMIT) {
      return new Response(
        JSON.stringify({
          error: 'DAILY_LIMIT_EXCEEDED',
          message: 'You have reached your daily limit of on-demand analyses. Check back tomorrow!',
          limit: DAILY_LIMIT,
          remaining_analyses: 0,
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 5. Build User Context (Roadmap, Profile Experience, Canonical Nodes, Supersedes)
    const { data: profile } = await supabase
      .from('profiles')
      .select('domain_id, experience')
      .eq('id', userId)
      .maybeSingle();

    const domainMatches = profile?.domain_id === newsItem.domain_id;

    // Load user roadmap
    const { data: userNodesRaw } = await supabase
      .from('user_nodes')
      .select('*, canonical_node:canonical_nodes(*)')
      .eq('user_id', userId);

    const userNodes = (userNodesRaw || []) as UserNode[];

    // Load canonical nodes for the domain
    const { data: canonicalNodesRaw } = await supabase
      .from('canonical_nodes')
      .select('*')
      .eq('domain_id', newsItem.domain_id);

    const canonicalNodes = (canonicalNodesRaw || []) as CanonicalNode[];

    // Load canonical edges for the domain
    const canonicalNodeIds = canonicalNodes.map((n) => n.id);
    const { data: canonicalEdgesRaw } = await supabase
      .from('canonical_edges')
      .select('*')
      .in('from_node', canonicalNodeIds)
      .in('to_node', canonicalNodeIds);

    const canonicalEdges = (canonicalEdgesRaw || []) as CanonicalEdge[];

    // Load approved supersedes
    const { data: supersedesRaw } = await supabase
      .from('node_supersedes')
      .select('old_node, new_node');

    const supersedes = (supersedesRaw || []).map((s: { old_node: string; new_node: string }) => ({
      old_node_id: s.old_node,
      new_node_id: s.new_node,
    }));

    // Build Roadmap snapshot
    const roadmap: Roadmap = {
      user_id: userId,
      domain_id: newsItem.domain_id,
      nodes: userNodes.map((un) => un.canonical_node!).filter(Boolean),
      edges: canonicalEdges.filter(
        (e) =>
          userNodes.some((un) => un.node_id === e.from_node) &&
          userNodes.some((un) => un.node_id === e.to_node),
      ),
      user_nodes: userNodes,
    };

    // Calculate experience bucket & cache key
    const experienceBucket = computeExperienceBucket(profile?.experience as Record<string, string>);
    const mappedIds = (newsItem.mapped_node_ids || []) as string[];
    const relevantNodeIds = userNodes
      .map((un) => un.node_id)
      .filter((id) => mappedIds.includes(id));

    // If intersection is empty, use all mappedIds to cohort by news relevance
    const finalRelevantIds = relevantNodeIds.length > 0 ? relevantNodeIds : mappedIds;
    const cacheKey = computeCacheKey(newsItem.id, finalRelevantIds, experienceBucket);

    // 6. Check if verdict already exists in verdicts cache table
    const { data: cachedVerdict } = await supabase
      .from('verdicts')
      .select('*')
      .eq('news_item_id', newsItem.id)
      .eq('cache_key', cacheKey)
      .maybeSingle();

    let verdictRecord = cachedVerdict;
    let wasCacheHit = Boolean(cachedVerdict);

    if (!verdictRecord) {
      // 7. No cached verdict: Call LLM (strong tier)
      const canonicalNodeMap = new Map<string, CanonicalNode>();
      for (const n of canonicalNodes) {
        canonicalNodeMap.set(n.id, n);
      }

      const candidateNodes = mappedIds
        .map((id) => canonicalNodeMap.get(id))
        .filter(Boolean)
        .map((n) => ({ slug: n!.slug, name: n!.name }));

      const userRoadmapSlice = userNodes
        .map((un) => ({
          slug: un.canonical_node?.slug || '',
          status: un.status,
        }))
        .filter((s) => s.slug.length > 0);

      const approvedSupersedes = supersedes
        .map((s) => ({
          old_slug: canonicalNodeMap.get(s.old_node_id)?.slug || '',
          new_slug: canonicalNodeMap.get(s.new_node_id)?.slug || '',
        }))
        .filter((s) => s.old_slug && s.new_slug);

      const verdictInput: VerdictInput = {
        title: newsItem.title,
        bullets: newsItem.bullets || ['No summary available', '', ''],
        impact_score: newsItem.impact_score || 5,
        tags: newsItem.tags || [],
        candidateNodes,
        userRoadmapSlice,
        approvedSupersedes,
      };

      // Call LLM with retry budget
      const llmOutput = await provider.generateJSON({
        tier: 'strong',
        system: verdictPrompt.system,
        user: verdictPrompt.buildUser(verdictInput),
        schema: verdictPrompt.schema,
      });

      // 8. Deterministic Decision Rules via @repo/graph
      const verdictContext: VerdictContext = {
        domainMatches,
        impactScore: newsItem.impact_score || 5,
        canonicalNodes,
        canonicalEdges,
        supersedes,
        roadmap,
      };

      const decided = decideVerdict(llmOutput, verdictContext);

      // 9. Store in verdicts table
      const newVerdictId = crypto.randomUUID();
      const insertVerdictRow = {
        id: newVerdictId,
        news_item_id: newsItem.id,
        cache_key: cacheKey,
        verdict: decided.verdict,
        target_node_id: decided.target_node_id,
        new_node_id: decided.new_node_id,
        insert_after_node_ids: decided.insert_after_node_ids,
        reasoning: decided.reasoning,
        confidence: decided.confidence,
      };

      const { data: createdVerdict, error: insertError } = await supabase
        .from('verdicts')
        .insert(insertVerdictRow)
        .select('*')
        .single();

      if (insertError) {
        // If conflict on (news_item_id, cache_key), read the conflicting row
        const { data: existing } = await supabase
          .from('verdicts')
          .select('*')
          .eq('news_item_id', newsItem.id)
          .eq('cache_key', cacheKey)
          .single();
        verdictRecord = existing;
        wasCacheHit = true;
      } else {
        verdictRecord = createdVerdict;
      }
    }

    // Trigger automatic guide generation if proposed for injection/override (PRD 10.4)
    if (
      verdictRecord &&
      (verdictRecord.verdict === 'injection' || verdictRecord.verdict === 'override') &&
      verdictRecord.new_node_id
    ) {
      void triggerGuideGeneration(supabase, verdictRecord.new_node_id, provider);
    }

    // 10. Update on-demand usage counter and user_verdicts
    const newUsage = currentUsage + 1;
    await supabase.from('usage_counters').upsert(
      {
        user_id: userId,
        day: todayDate,
        on_demand_analyses: newUsage,
      },
      { onConflict: 'user_id,day' },
    );

    // Upsert user_verdict as previewed
    const userVerdictId = existingUserVerdict?.id || crypto.randomUUID();
    const { data: savedUserVerdict } = await supabase
      .from('user_verdicts')
      .upsert(
        {
          id: userVerdictId,
          user_id: userId,
          news_item_id: newsItem.id,
          verdict_id: verdictRecord.id,
          state: existingUserVerdict?.state || 'previewed',
        },
        { onConflict: 'user_id,news_item_id' },
      )
      .select('*')
      .single();

    const remainingAnalyses = Math.max(0, DAILY_LIMIT - newUsage);

    return new Response(
      JSON.stringify({
        success: true,
        verdict: verdictRecord,
        user_verdict: savedUserVerdict,
        is_precomputed: false,
        cache_hit: wasCacheHit,
        remaining_analyses: remainingAnalyses,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const errorMsg = (err as Error).message || String(err);
    return new Response(
      JSON.stringify({ error: 'Internal server error in compute-verdict', detail: errorMsg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
}
