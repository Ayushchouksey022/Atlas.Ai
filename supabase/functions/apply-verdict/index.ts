import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  applyInjection,
  applyOverride,
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

export interface ApplyVerdictPayload {
  verdict_id: string;
  user_id?: string;
}

export interface ApplyVerdictResponse {
  success: boolean;
  verdict_type?: 'shield' | 'injection' | 'override';
  already_applied?: boolean;
  mutated?: boolean;
  new_node_id?: string | null;
  old_node_id?: string | null;
  message?: string;
  error?: string;
  detail?: string;
}

export async function handleApplyVerdict(
  req: Request,
  customClient?: SupabaseClient,
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

    let payload: ApplyVerdictPayload = { verdict_id: '' };
    if (req.method === 'POST') {
      try {
        payload = (await req.json()) as ApplyVerdictPayload;
      } catch {
        payload = { verdict_id: '' };
      }
    }

    if (!payload.verdict_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: verdict_id' }),
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

    // 2. Fetch the Verdict record
    const { data: verdict, error: verdictError } = await supabase
      .from('verdicts')
      .select('*')
      .eq('id', payload.verdict_id)
      .single();

    if (verdictError || !verdict) {
      return new Response(
        JSON.stringify({ error: 'Verdict record not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 3. Idempotency Check: check if already applied for this user
    const { data: existingUserVerdict } = await supabase
      .from('user_verdicts')
      .select('*')
      .eq('user_id', userId)
      .eq('news_item_id', verdict.news_item_id)
      .maybeSingle();

    if (existingUserVerdict && existingUserVerdict.state === 'applied') {
      return new Response(
        JSON.stringify({
          success: true,
          already_applied: true,
          verdict_type: verdict.verdict,
          mutated: false,
          message: 'Verdict has already been applied to your roadmap.',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 4. Server-Side Revalidation via @repo/graph
    if (verdict.verdict === 'injection' || verdict.verdict === 'override') {
      // Load user roadmap
      const { data: userNodesRaw } = await supabase
        .from('user_nodes')
        .select('*, canonical_node:canonical_nodes(*)')
        .eq('user_id', userId);

      const userNodes = (userNodesRaw || []) as UserNode[];

      // Load news item to get domain_id
      const { data: newsItem } = await supabase
        .from('news_items')
        .select('domain_id')
        .eq('id', verdict.news_item_id)
        .single();

      const domainId = newsItem?.domain_id || '';

      // Load canonical nodes & edges
      const { data: canonicalNodesRaw } = await supabase
        .from('canonical_nodes')
        .select('*')
        .eq('domain_id', domainId);

      const canonicalNodes = (canonicalNodesRaw || []) as CanonicalNode[];
      const canonicalNodeMap = new Map<string, CanonicalNode>();
      for (const n of canonicalNodes) {
        canonicalNodeMap.set(n.id, n);
      }

      const { data: canonicalEdgesRaw } = await supabase
        .from('canonical_edges')
        .select('*');
      const canonicalEdges = (canonicalEdgesRaw || []) as CanonicalEdge[];

      const roadmap: Roadmap = {
        user_id: userId,
        domain_id: domainId,
        nodes: userNodes.map((un) => un.canonical_node!).filter(Boolean),
        edges: canonicalEdges.filter(
          (e) =>
            userNodes.some((un) => un.node_id === e.from_node) &&
            userNodes.some((un) => un.node_id === e.to_node),
        ),
        user_nodes: userNodes,
      };

      if (verdict.verdict === 'injection') {
        const newNode = canonicalNodeMap.get(verdict.new_node_id);
        if (!newNode || newNode.status !== 'approved') {
          await markVerdictFailed(supabase, userId, verdict.news_item_id, verdict.id);
          return new Response(
            JSON.stringify({
              success: false,
              error: 'INJECTION_REVALIDATION_FAILED',
              detail: 'Proposed new node is not an approved canonical node.',
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }

        const injectionResult = applyInjection(
          roadmap,
          newNode,
          verdict.insert_after_node_ids || [],
        );

        if (!injectionResult.ok && injectionResult.error !== 'NODE_ALREADY_EXISTS') {
          await markVerdictFailed(supabase, userId, verdict.news_item_id, verdict.id);
          return new Response(
            JSON.stringify({
              success: false,
              error: injectionResult.error,
              detail: injectionResult.detail || 'Injection revalidation failed.',
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }
      } else if (verdict.verdict === 'override') {
        const targetNodeId = verdict.target_node_id;
        const newNode = canonicalNodeMap.get(verdict.new_node_id);

        if (!targetNodeId || !newNode || newNode.status !== 'approved') {
          await markVerdictFailed(supabase, userId, verdict.news_item_id, verdict.id);
          return new Response(
            JSON.stringify({
              success: false,
              error: 'OVERRIDE_REVALIDATION_FAILED',
              detail: 'Invalid target or replacement canonical node.',
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }

        const overrideResult = applyOverride(roadmap, targetNodeId, newNode);

        if (!overrideResult.ok && overrideResult.error !== 'NEW_NODE_ALREADY_IN_ROADMAP') {
          await markVerdictFailed(supabase, userId, verdict.news_item_id, verdict.id);
          return new Response(
            JSON.stringify({
              success: false,
              error: overrideResult.error,
              detail: overrideResult.detail || 'Override revalidation failed.',
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }
      }
    }

    // 5. Execute Atomic Database Transaction via RPC
    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      'apply_verdict_transaction',
      {
        p_user_id: userId,
        p_news_item_id: verdict.news_item_id,
        p_verdict_id: verdict.id,
        p_verdict_type: verdict.verdict,
        p_target_node_id: verdict.target_node_id,
        p_new_node_id: verdict.new_node_id,
        p_insert_after_ids: verdict.insert_after_node_ids || [],
      },
    );

    if (rpcError) {
      // Transaction failed and rolled back automatically in postgres!
      await markVerdictFailed(supabase, userId, verdict.news_item_id, verdict.id);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'TRANSACTION_FAILED',
          detail: rpcError.message,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (verdict.new_node_id) {
      void triggerGuideGeneration(supabase, verdict.new_node_id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        verdict_type: verdict.verdict,
        mutated: rpcResult?.mutated ?? false,
        new_node_id: verdict.new_node_id,
        old_node_id: verdict.target_node_id,
        message: 'Verdict applied successfully to your roadmap.',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const errorMsg = (err as Error).message || String(err);
    return new Response(
      JSON.stringify({ error: 'Internal server error in apply-verdict', detail: errorMsg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
}

/** Sets user_verdicts state to 'failed' on error */
async function markVerdictFailed(
  supabase: SupabaseClient,
  userId: string,
  newsItemId: string,
  verdictId: string,
) {
  try {
    await supabase.from('user_verdicts').upsert(
      {
        user_id: userId,
        news_item_id: newsItemId,
        verdict_id: verdictId,
        state: 'failed',
      },
      { onConflict: 'user_id,news_item_id' },
    );
  } catch {
    // ignore secondary failure
  }
}
