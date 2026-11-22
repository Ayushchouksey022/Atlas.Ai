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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

export interface PrecomputeVerdictsPayload {
  news_item_id?: string;
  min_impact_score?: number;
}

export interface PrecomputeVerdictsReport {
  success: boolean;
  news_items_processed: number;
  cohorts_evaluated: number;
  llm_calls_made: number;
  user_verdicts_created: number;
  details?: Array<{
    news_item_id: string;
    title: string;
    cohorts_count: number;
    users_count: number;
  }>;
  error?: string;
}

export async function handlePrecomputeVerdicts(
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

    let payload: PrecomputeVerdictsPayload = {};
    if (req.method === 'POST') {
      try {
        payload = (await req.json()) as PrecomputeVerdictsPayload;
      } catch {
        payload = {};
      }
    }

    const minImpact = payload.min_impact_score ?? 5; // PRD 10.2: items with impact_score >= 5

    // 1. Fetch eligible published news items
    let newsQuery = supabase
      .from('news_items')
      .select('*')
      .eq('status', 'published')
      .gte('impact_score', minImpact);

    if (payload.news_item_id) {
      newsQuery = newsQuery.eq('id', payload.news_item_id);
    } else {
      newsQuery = newsQuery
        .order('published_at', { ascending: false })
        .limit(10);
    }

    const { data: newsItems, error: newsError } = await newsQuery;

    if (newsError) {
      return new Response(
        JSON.stringify({ error: 'Failed to query news_items', detail: newsError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!newsItems || newsItems.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          news_items_processed: 0,
          cohorts_evaluated: 0,
          llm_calls_made: 0,
          user_verdicts_created: 0,
          message: 'No eligible published news items found for precomputation.',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 2. Fetch active users who completed onboarding
    const { data: activeProfiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, domain_id, experience')
      .eq('onboarding_completed', true);

    if (profileError) {
      return new Response(
        JSON.stringify({ error: 'Failed to query profiles', detail: profileError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!activeProfiles || activeProfiles.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          news_items_processed: newsItems.length,
          cohorts_evaluated: 0,
          llm_calls_made: 0,
          user_verdicts_created: 0,
          message: 'No active onboarded users found.',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 3. Preload all active users' roadmap nodes
    const activeUserIds = activeProfiles.map((p) => p.id);
    const { data: allUserNodesRaw } = await supabase
      .from('user_nodes')
      .select('*, canonical_node:canonical_nodes(*)')
      .in('user_id', activeUserIds);

    const userNodesByUser = new Map<string, UserNode[]>();
    for (const un of (allUserNodesRaw || []) as UserNode[]) {
      if (!userNodesByUser.has(un.user_id)) {
        userNodesByUser.set(un.user_id, []);
      }
      userNodesByUser.get(un.user_id)!.push(un);
    }

    // 4. Preload canonical graph & supersedes per domain
    const domainIds = [...new Set(newsItems.map((n) => n.domain_id))];
    const { data: allCanonicalNodesRaw } = await supabase
      .from('canonical_nodes')
      .select('*')
      .in('domain_id', domainIds);

    const canonicalNodes = (allCanonicalNodesRaw || []) as CanonicalNode[];
    const canonicalNodeMap = new Map<string, CanonicalNode>();
    for (const n of canonicalNodes) {
      canonicalNodeMap.set(n.id, n);
    }

    const { data: allCanonicalEdgesRaw } = await supabase
      .from('canonical_edges')
      .select('*');
    const canonicalEdges = (allCanonicalEdgesRaw || []) as CanonicalEdge[];

    const { data: allSupersedesRaw } = await supabase
      .from('node_supersedes')
      .select('old_node, new_node');

    const supersedes = (allSupersedesRaw || []).map((s: { old_node: string; new_node: string }) => ({
      old_node_id: s.old_node,
      new_node_id: s.new_node,
    }));

    let totalCohortsEvaluated = 0;
    let totalLlmCallsMade = 0;
    let totalUserVerdictsCreated = 0;
    const itemReports: Array<{ news_item_id: string; title: string; cohorts_count: number; users_count: number }> = [];

    // 5. Process each news item
    for (const item of newsItems) {
      // Filter users in this domain
      const domainUsers = activeProfiles.filter((p) => p.domain_id === item.domain_id);
      if (domainUsers.length === 0) continue;

      const mappedIds = (item.mapped_node_ids || []) as string[];

      // Group active users into cohorts by cache_key
      interface CohortGroup {
        cacheKey: string;
        userIds: string[];
        sampleUser: {
          id: string;
          experience: Record<string, string>;
          userNodes: UserNode[];
        };
      }

      const cohortMap = new Map<string, CohortGroup>();

      for (const profile of domainUsers) {
        const userNodes = userNodesByUser.get(profile.id) || [];
        const experience = (profile.experience || {}) as Record<string, string>;
        const experienceBucket = computeExperienceBucket(experience);

        const relevantNodeIds = userNodes
          .map((un) => un.node_id)
          .filter((id) => mappedIds.includes(id));

        const finalRelevantIds = relevantNodeIds.length > 0 ? relevantNodeIds : mappedIds;
        const cacheKey = computeCacheKey(item.id, finalRelevantIds, experienceBucket);

        if (!cohortMap.has(cacheKey)) {
          cohortMap.set(cacheKey, {
            cacheKey,
            userIds: [],
            sampleUser: {
              id: profile.id,
              experience,
              userNodes,
            },
          });
        }

        cohortMap.get(cacheKey)!.userIds.push(profile.id);
      }

      totalCohortsEvaluated += cohortMap.size;
      itemReports.push({
        news_item_id: item.id,
        title: item.title,
        cohorts_count: cohortMap.size,
        users_count: domainUsers.length,
      });

      // 6. For each cohort: evaluate verdict (1 LLM call max per cohort)
      for (const cohort of cohortMap.values()) {
        // Check if verdict already exists in verdicts cache table
        const { data: existingVerdict } = await supabase
          .from('verdicts')
          .select('*')
          .eq('news_item_id', item.id)
          .eq('cache_key', cohort.cacheKey)
          .maybeSingle();

        let verdictRecord = existingVerdict;

        if (!verdictRecord) {
          // LLM Call for this cohort
          totalLlmCallsMade++;

          const candidateNodes = mappedIds
            .map((id) => canonicalNodeMap.get(id))
            .filter(Boolean)
            .map((n) => ({ slug: n!.slug, name: n!.name }));

          const userRoadmapSlice = cohort.sampleUser.userNodes
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
            title: item.title,
            bullets: item.bullets || ['No summary available', '', ''],
            impact_score: item.impact_score || 5,
            tags: item.tags || [],
            candidateNodes,
            userRoadmapSlice,
            approvedSupersedes,
          };

          const llmOutput = await provider.generateJSON({
            tier: 'strong',
            system: verdictPrompt.system,
            user: verdictPrompt.buildUser(verdictInput),
            schema: verdictPrompt.schema,
          });

          // Run deterministic decision rules
          const roadmap: Roadmap = {
            user_id: cohort.sampleUser.id,
            domain_id: item.domain_id,
            nodes: cohort.sampleUser.userNodes.map((un) => un.canonical_node!).filter(Boolean),
            edges: canonicalEdges.filter(
              (e) =>
                cohort.sampleUser.userNodes.some((un) => un.node_id === e.from_node) &&
                cohort.sampleUser.userNodes.some((un) => un.node_id === e.to_node),
            ),
            user_nodes: cohort.sampleUser.userNodes,
          };

          const verdictContext: VerdictContext = {
            domainMatches: true,
            impactScore: item.impact_score || 5,
            canonicalNodes,
            canonicalEdges,
            supersedes,
            roadmap,
          };

          const decided = decideVerdict(llmOutput, verdictContext);

          const newVerdictId = crypto.randomUUID();
          const insertRow = {
            id: newVerdictId,
            news_item_id: item.id,
            cache_key: cohort.cacheKey,
            verdict: decided.verdict,
            target_node_id: decided.target_node_id,
            new_node_id: decided.new_node_id,
            insert_after_node_ids: decided.insert_after_node_ids,
            reasoning: decided.reasoning,
            confidence: decided.confidence,
          };

          const { data: createdVerdict, error: insertError } = await supabase
            .from('verdicts')
            .insert(insertRow)
            .select('*')
            .single();

          if (insertError) {
            const { data: conflicting } = await supabase
              .from('verdicts')
              .select('*')
              .eq('news_item_id', item.id)
              .eq('cache_key', cohort.cacheKey)
              .single();
            verdictRecord = conflicting;
          } else {
            verdictRecord = createdVerdict;
          }
        }

        if (!verdictRecord) continue;

        // 7. Batch upsert user_verdicts for all users in this cohort
        for (const uid of cohort.userIds) {
          const userVerdictId = crypto.randomUUID();
          await supabase.from('user_verdicts').upsert(
            {
              id: userVerdictId,
              user_id: uid,
              news_item_id: item.id,
              verdict_id: verdictRecord.id,
              state: 'precomputed',
            },
            { onConflict: 'user_id,news_item_id' },
          );
          totalUserVerdictsCreated++;
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        news_items_processed: newsItems.length,
        cohorts_evaluated: totalCohortsEvaluated,
        llm_calls_made: totalLlmCallsMade,
        user_verdicts_created: totalUserVerdictsCreated,
        details: itemReports,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const errorMsg = (err as Error).message || String(err);
    return new Response(
      JSON.stringify({ error: 'Internal server error in precompute-verdicts', detail: errorMsg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
}
