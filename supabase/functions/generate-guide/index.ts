import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  getLLMProvider,
  quickstartGuidePrompt,
  type LLMProvider,
} from '../../../packages/llm/src/index';
import type { Database } from '@repo/schemas';
import { formatGuideToMarkdown, extractTextFromHtml } from './format';

type GuideRow = Database['public']['Tables']['guides']['Row'];
type CanonicalNodeRow = Database['public']['Tables']['canonical_nodes']['Row'];

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

export interface GenerateGuidePayload {
  node_id: string;
  force?: boolean;
}

export interface GenerateGuideResponse {
  success: boolean;
  guide?: GuideRow;
  cached?: boolean;
  message?: string;
  error?: string;
  detail?: string;
}

export async function handleGenerateGuide(
  req: Request,
  customClient?: SupabaseClient,
  customProvider?: LLMProvider,
  customFetch: typeof fetch = fetch,
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
      createClient<Database>(supabaseUrl, supabaseServiceKey, {
        auth: { persistSession: false },
      });

    let payload: GenerateGuidePayload = { node_id: '' };
    if (req.method === 'POST') {
      try {
        payload = (await req.json()) as GenerateGuidePayload;
      } catch {
        payload = { node_id: '' };
      }
    } else {
      const url = new URL(req.url);
      payload = {
        node_id: url.searchParams.get('node_id') || '',
        force: url.searchParams.get('force') === 'true',
      };
    }

    if (!payload.node_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameter: node_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 1. Check Cache: One guide per canonical node, cached in guides (never per user)
    if (!payload.force) {
      const { data: existingGuide } = await supabase
        .from('guides')
        .select('*')
        .eq('node_id', payload.node_id)
        .maybeSingle();

      if (existingGuide) {
        return new Response(
          JSON.stringify({
            success: true,
            guide: existingGuide,
            cached: true,
            message: 'Returning cached guide for canonical node.',
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    // 2. Fetch Canonical Node Record
    const { data: nodeData, error: nodeError } = await supabase
      .from('canonical_nodes')
      .select('*')
      .eq('id', payload.node_id)
      .maybeSingle();

    if (nodeError || !nodeData) {
      return new Response(
        JSON.stringify({ error: `Canonical node not found: ${payload.node_id}` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const node = nodeData as CanonicalNodeRow;

    // 3. Official Source Validation (PRD 10.4):
    // If no source is available, do not generate; flag the node for the editor instead.
    if (!node.external_url || !node.external_url.trim().startsWith('http')) {
      // Flag the node in proposed_graph_changes for editor review
      await supabase.from('proposed_graph_changes').insert({
        change_type: 'add_node',
        payload: {
          flag: 'MISSING_SOURCE_FOR_GUIDE',
          node_id: node.id,
          slug: node.slug,
          name: node.name,
          category: node.category,
          area: node.area,
          message:
            'Canonical node has no external_url documentation link. Quickstart guide generation halted and flagged for editorial review.',
        },
        status: 'pending',
      });

      return new Response(
        JSON.stringify({
          success: false,
          error: 'NO_SOURCE_AVAILABLE',
          message:
            'No official documentation/release notes URL configured for this node. Flagged for editor review.',
          node_id: node.id,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 4. Fetch the official documentation / release notes URL
    let extractedDocsText = '';
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const fetchRes = await customFetch(node.external_url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'AtlasAI-DocBot/1.0 (+https://atlas.ai/bot)',
          Accept: 'text/html,text/plain,application/xhtml+xml',
        },
      });
      clearTimeout(timeoutId);

      if (fetchRes.ok) {
        const rawBody = await fetchRes.text();
        extractedDocsText = extractTextFromHtml(rawBody).slice(0, 8000);
      }
    } catch (fetchErr) {
      console.warn(`[generate-guide] Warning fetching ${node.external_url}:`, fetchErr);
    }

    // If fetch returned empty text, provide fallback content from node metadata
    if (!extractedDocsText || extractedDocsText.length < 50) {
      extractedDocsText = `${node.name}: ${node.description || 'Developer tool and workflow enhancement.'} Official documentation reference: ${node.external_url}. Follow standard CLI commands and patterns for installation, setup, test execution, and verification.`;
    }

    // 5. Call LLM with Quickstart Guide Prompt (Strong Tier)
    const provider = customProvider || getLLMProvider();
    const promptInput = {
      nodeName: node.name,
      nodeType: node.category || 'tool',
      description: node.description || '',
      officialDocsExcerpt: extractedDocsText,
      officialUrl: node.external_url,
    };

    const guideOutput = await provider.generateJSON({
      tier: quickstartGuidePrompt.tier,
      system: quickstartGuidePrompt.system,
      user: quickstartGuidePrompt.buildUser(promptInput),
      schema: quickstartGuidePrompt.schema,
      promptName: quickstartGuidePrompt.name,
      promptVersion: quickstartGuidePrompt.version,
    });

    // 6. Format Guide to Safe Markdown
    const markdown = formatGuideToMarkdown(guideOutput);
    const sourceUrls = Array.from(
      new Set([node.external_url, ...(guideOutput.source_links || [])]),
    );

    // 7. Store Draft Guide in Database (PRD 10.4: created as draft; users only see approved)
    const { data: savedGuide, error: saveError } = await supabase
      .from('guides')
      .upsert(
        {
          node_id: node.id,
          markdown,
          source_urls: sourceUrls,
          last_verified_at: new Date().toISOString(),
          status: 'draft',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'node_id' },
      )
      .select('*')
      .single();

    if (saveError) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'DATABASE_SAVE_FAILED',
          detail: saveError.message,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        guide: savedGuide,
        cached: false,
        message: 'Draft quickstart guide generated and stored for editorial approval.',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const errorMsg = (err as Error).message || String(err);
    return new Response(
      JSON.stringify({
        error: 'INTERNAL_SERVER_ERROR',
        detail: errorMsg,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
}

/**
 * Triggers draft guide generation automatically for candidate nodes (Prompt 13 / PRD 10.4).
 * Caches per canonical node (never per user).
 */
export async function triggerGuideGeneration(
  supabase: SupabaseClient,
  nodeId: string,
  customProvider?: LLMProvider,
): Promise<void> {
  if (!nodeId) return;

  try {
    // Check cache: if a guide already exists, skip generation
    const { data: existing } = await supabase
      .from('guides')
      .select('id')
      .eq('node_id', nodeId)
      .maybeSingle();

    if (existing) {
      return;
    }

    const req = new Request(`http://localhost:54321/functions/v1/generate-guide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ node_id: nodeId }),
    });

    await handleGenerateGuide(req, supabase, customProvider);
  } catch (err) {
    console.warn(`[triggerGuideGeneration] Could not auto-generate guide for node ${nodeId}:`, err);
  }
}
