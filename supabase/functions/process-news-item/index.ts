import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  getLLMProvider,
  newsSummaryPrompt,
  graphChangeDraftPrompt,
  type LLMProvider,
} from '../../../packages/llm/src/index';
import { retrieveCandidateNodes, pickMappedNodes, type CanonicalNodeMinimal } from './mapping';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

export interface ProcessNewsItemPayload {
  news_item_id?: string;
  batch_limit?: number;
}

export interface ProcessedItemReport {
  id: string;
  title: string;
  status: 'published' | 'ingested';
  impact_score?: number;
  bullets?: [string, string, string];
  mapped_node_ids?: string[];
  proposed_graph_change_created: boolean;
  error?: string;
}

export async function handleProcessNewsItem(
  req: Request,
  customClient?: SupabaseClient,
  customProvider?: LLMProvider,
): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl =
      process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
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

    let payload: ProcessNewsItemPayload = {};
    if (req.method === 'POST') {
      try {
        payload = (await req.json()) as ProcessNewsItemPayload;
      } catch {
        payload = {};
      }
    }

    // 1. Fetch pending item(s) to process
    let itemsQuery = supabase
      .from('news_items')
      .select('*');

    if (payload.news_item_id) {
      itemsQuery = itemsQuery.eq('id', payload.news_item_id);
    } else {
      itemsQuery = itemsQuery
        .eq('status', 'ingested')
        .order('created_at', { ascending: true })
        .limit(payload.batch_limit || 10);
    }

    const { data: items, error: itemsError } = await itemsQuery;

    if (itemsError) {
      return new Response(
        JSON.stringify({
          error: 'Failed to query news_items',
          detail: itemsError.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    if (!items || items.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          processed_count: 0,
          items: [],
          message: 'No pending ingested news_items found to process.',
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const reports: ProcessedItemReport[] = [];

    // 2. Process each news item
    for (const item of items) {
      try {
        // Step A: Run Fast-Tier Summary, Score & Tags Prompt
        const userPrompt = newsSummaryPrompt.buildUser({
          title: item.title,
          source_url: item.url,
          raw_text: item.raw_text || item.title,
        });

        const summaryOutput = await provider.generateJSON({
          tier: newsSummaryPrompt.tier,
          system: newsSummaryPrompt.system,
          user: userPrompt,
          schema: newsSummaryPrompt.schema,
          promptName: newsSummaryPrompt.name,
          promptVersion: newsSummaryPrompt.version,
        });

        // Step B: Strict Invariant Enforcement (PRD 9.1 & 10.1)
        // Check 1: EXACTLY 3 non-empty bullets
        const validBullets =
          Array.isArray(summaryOutput.bullets) &&
          summaryOutput.bullets.length === 3 &&
          summaryOutput.bullets.every(
            (b) => typeof b === 'string' && b.trim().length > 0,
          );

        // Check 2: impact_score integer 1 to 10
        const validScore =
          Number.isInteger(summaryOutput.impact_score) &&
          summaryOutput.impact_score >= 1 &&
          summaryOutput.impact_score <= 10;

        if (!validBullets || !validScore) {
          const validationErrorMsg = `Invalid LLM output: bulletsValid=${validBullets}, scoreValid=${validScore}`;
          await supabase
            .from('news_items')
            .update({
              status: 'ingested',
              error_record: validationErrorMsg,
              updated_at: new Date().toISOString(),
            })
            .eq('id', item.id);

          reports.push({
            id: item.id,
            title: item.title,
            status: 'ingested',
            error: validationErrorMsg,
            proposed_graph_change_created: false,
          });
          continue;
        }

        const bulletsTuple: [string, string, string] = [
          summaryOutput.bullets[0].trim(),
          summaryOutput.bullets[1].trim(),
          summaryOutput.bullets[2].trim(),
        ];

        // Step C: Load canonical nodes for candidate retrieval & node mapping
        const { data: canonicalNodesRaw } = await supabase
          .from('canonical_nodes')
          .select('id, slug, name, description, area, node_type, level')
          .eq('domain_id', item.domain_id)
          .eq('status', 'approved');

        const canonicalNodes: CanonicalNodeMinimal[] =
          (canonicalNodesRaw as CanonicalNodeMinimal[]) || [];

        // Candidate retrieval (keyword/tag overlap) followed by LLM pick
        const candidates = retrieveCandidateNodes(canonicalNodes, {
          title: item.title,
          bullets: bulletsTuple,
          tags: summaryOutput.tags,
          raw_text: item.raw_text,
        });

        const mappingResult = await pickMappedNodes(
          provider,
          {
            title: item.title,
            bullets: bulletsTuple,
            tags: summaryOutput.tags,
          },
          candidates,
        );

        let proposedGraphChangeCreated = false;

        // Step D: Proposed new tool handling (PRD 10.1 step 7)
        if (summaryOutput.proposed_new_tool) {
          const toolName = summaryOutput.proposed_new_tool.name.trim();
          const toolSlug = toolName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

          // Check if tool already exists in canonical nodes
          const existsInGraph = canonicalNodes.some(
            (n) =>
              n.name.toLowerCase() === toolName.toLowerCase() ||
              n.slug.toLowerCase() === toolSlug,
          );

          if (!existsInGraph) {
            // Run Strong-Tier Graph Change Draft Prompt
            const draftPromptUser = graphChangeDraftPrompt.buildUser({
              toolName,
              category: summaryOutput.proposed_new_tool.category,
              description:
                summaryOutput.impact_rationale ||
                `${toolName} advancement introduced via ${item.title}`,
              sourceExcerpt: item.raw_text || item.title,
              existingNodeSlugs: canonicalNodes.map((n) => n.slug),
            });

            const draftOutput = await provider.generateJSON({
              tier: graphChangeDraftPrompt.tier,
              system: graphChangeDraftPrompt.system,
              user: draftPromptUser,
              schema: graphChangeDraftPrompt.schema,
              promptName: graphChangeDraftPrompt.name,
              promptVersion: graphChangeDraftPrompt.version,
            });

            // Insert proposed graph change into editorial queue
            const { error: changeError } = await supabase
              .from('proposed_graph_changes')
              .insert({
                news_item_id: item.id,
                change_type: 'add_node',
                payload: draftOutput,
                status: 'pending',
              });

            if (!changeError) {
              proposedGraphChangeCreated = true;
            } else {
              console.warn(
                `[process-news-item] Warning inserting proposed_graph_changes:`,
                changeError.message,
              );
            }
          }
        }

        // Step E: Publish news item
        const { error: publishError } = await supabase
          .from('news_items')
          .update({
            bullets: bulletsTuple,
            impact_score: summaryOutput.impact_score,
            impact_rationale: summaryOutput.impact_rationale,
            tags: summaryOutput.tags,
            mapped_node_ids: mappingResult.mapped_node_ids,
            proposed_new_tool: summaryOutput.proposed_new_tool,
            status: 'published',
            error_record: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', item.id);

        if (publishError) {
          throw new Error(`Failed to publish news item: ${publishError.message}`);
        }

        reports.push({
          id: item.id,
          title: item.title,
          status: 'published',
          impact_score: summaryOutput.impact_score,
          bullets: bulletsTuple,
          mapped_node_ids: mappingResult.mapped_node_ids,
          proposed_graph_change_created: proposedGraphChangeCreated,
        });
      } catch (err) {
        // Validation/Processing Failure: Keep status 'ingested' with error_record
        const errorMsg = (err as Error).message || 'Unknown processing error';
        console.error(
          `[process-news-item] Processing failed for item ${item.id}:`,
          err,
        );

        await supabase
          .from('news_items')
          .update({
            status: 'ingested',
            error_record: errorMsg,
            updated_at: new Date().toISOString(),
          })
          .eq('id', item.id);

        reports.push({
          id: item.id,
          title: item.title,
          status: 'ingested',
          error: errorMsg,
          proposed_graph_change_created: false,
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed_count: reports.length,
        items: reports,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (err) {
    console.error('[process-news-item] Fatal unhandled error:', err);
    return new Response(
      JSON.stringify({
        error: (err as Error).message || 'Internal server error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
}

// Default export for Deno serve in Supabase Edge Runtime
export default async function handler(req: Request) {
  return handleProcessNewsItem(req);
}
