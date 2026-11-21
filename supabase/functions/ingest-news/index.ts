import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { parseFeedSource, type NormalizedEntry } from './parsers';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

export interface IngestNewsPayload {
  source_ids?: string[];
  force_all?: boolean;
  test_feed_payloads?: Record<string, string>;
  process_immediately?: boolean;
}

export interface IngestionResult {
  success: boolean;
  sources_checked: number;
  items_ingested: number;
  items_skipped_duplicates: number;
  errors: Array<{ source_id: string; source_name: string; error: string }>;
  ingested_item_ids: string[];
}

export async function handleIngestNews(
  req: Request,
  customClient?: SupabaseClient,
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

    let payload: IngestNewsPayload = {};
    if (req.method === 'POST') {
      try {
        payload = (await req.json()) as IngestNewsPayload;
      } catch {
        payload = {};
      }
    }

    // 1. Load active news sources (or explicit source_ids if specified)
    let sourcesQuery = supabase
      .from('news_sources')
      .select('id, domain_id, name, url, kind, active');

    if (payload.source_ids && payload.source_ids.length > 0) {
      sourcesQuery = sourcesQuery.in('id', payload.source_ids);
    } else if (!payload.force_all) {
      sourcesQuery = sourcesQuery.eq('active', true);
    }

    const { data: sources, error: sourcesError } = await sourcesQuery;

    if (sourcesError) {
      return new Response(
        JSON.stringify({
          error: 'Failed to query news_sources',
          detail: sourcesError.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    if (!sources || sources.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          sources_checked: 0,
          items_ingested: 0,
          items_skipped_duplicates: 0,
          errors: [],
          ingested_item_ids: [],
          message: 'No active news sources to ingest.',
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    let itemsIngested = 0;
    let itemsSkippedDuplicates = 0;
    const errors: Array<{ source_id: string; source_name: string; error: string }> =
      [];
    const ingestedItemIds: string[] = [];

    // 2. Fetch and parse each source with per-source error isolation
    for (const source of sources) {
      try {
        let content = '';

        // Check test payloads fixture first (allows offline and deterministic testing)
        if (
          payload.test_feed_payloads &&
          (payload.test_feed_payloads[source.id] ||
            payload.test_feed_payloads[source.url])
        ) {
          content =
            payload.test_feed_payloads[source.id] ||
            payload.test_feed_payloads[source.url];
        } else {
          // Fetch live feed with 8-second timeout
          const response = await fetch(source.url, {
            signal: AbortSignal.timeout(8000),
            headers: {
              'User-Agent': 'AtlasAI-NewsPipeline/1.0 (+https://atlas.ai)',
              Accept:
                'application/rss+xml, application/atom+xml, application/json, text/xml;q=0.9, */*;q=0.8',
            },
          });

          if (!response.ok) {
            throw new Error(
              `HTTP ${response.status} ${response.statusText} fetching feed`,
            );
          }

          content = await response.text();
        }

        // Parse normalized entries
        const parsedEntries = await parseFeedSource(
          source.kind as 'rss' | 'github_releases' | 'api' | 'newsletter',
          content,
          source.url,
        );

        if (parsedEntries.length === 0) {
          continue;
        }

        // 3. Deduplicate by URL and content_hash
        const urls = parsedEntries.map((e) => e.url);
        const hashes = parsedEntries.map((e) => e.content_hash);

        // Check for existing URLs or content hashes in DB
        const { data: existingItems, error: dedupError } = await supabase
          .from('news_items')
          .select('url, content_hash')
          .or(
            `url.in.(${urls.map((u) => `"${u}"`).join(',')}),content_hash.in.(${hashes.map((h) => `"${h}"`).join(',')})`,
          );

        if (dedupError) {
          console.warn(
            `[ingest-news] Batch deduplication query warning for source ${source.name}:`,
            dedupError.message,
          );
        }

        const existingUrls = new Set(existingItems?.map((i) => i.url) || []);
        const existingHashes = new Set(
          existingItems?.map((i) => i.content_hash) || [],
        );

        const newEntries: NormalizedEntry[] = [];
        const seenInBatchUrls = new Set<string>();
        const seenInBatchHashes = new Set<string>();

        for (const entry of parsedEntries) {
          if (
            existingUrls.has(entry.url) ||
            existingHashes.has(entry.content_hash) ||
            seenInBatchUrls.has(entry.url) ||
            seenInBatchHashes.has(entry.content_hash)
          ) {
            itemsSkippedDuplicates++;
            continue;
          }

          seenInBatchUrls.add(entry.url);
          seenInBatchHashes.add(entry.content_hash);
          newEntries.push(entry);
        }

        if (newEntries.length === 0) {
          continue;
        }

        // 4. Insert new items into news_items with status = 'ingested'
        const insertPayload = newEntries.map((entry) => ({
          domain_id: source.domain_id,
          source_id: source.id,
          url: entry.url,
          title: entry.title,
          published_at: entry.published_at,
          raw_text: entry.raw_text,
          content_hash: entry.content_hash,
          status: 'ingested' as const,
          bullets: null,
          impact_score: null,
          tags: [],
          mapped_node_ids: [],
        }));

        const { data: inserted, error: insertError } = await supabase
          .from('news_items')
          .insert(insertPayload)
          .select('id');

        if (insertError) {
          throw new Error(`Failed to insert news_items: ${insertError.message}`);
        }

        if (inserted) {
          itemsIngested += inserted.length;
          for (const row of inserted) {
            ingestedItemIds.push(row.id);
          }
        }
      } catch (err) {
        // Per-source error isolation: broken source does NOT stop other sources
        console.error(
          `[ingest-news] Error processing source "${source.name}" (${source.id}):`,
          err,
        );
        errors.push({
          source_id: source.id,
          source_name: source.name,
          error: (err as Error).message || 'Unknown source error',
        });
      }
    }

    const result: IngestionResult = {
      success: true,
      sources_checked: sources.length,
      items_ingested: itemsIngested,
      items_skipped_duplicates: itemsSkippedDuplicates,
      errors,
      ingested_item_ids: ingestedItemIds,
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[ingest-news] Unhandled fatal error:', err);
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
  return handleIngestNews(req);
}
