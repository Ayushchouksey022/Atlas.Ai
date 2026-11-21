import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRssOrAtom, parseGitHubReleases } from './ingest-news/parsers';
import { handleIngestNews } from './ingest-news/index';
import { handleProcessNewsItem } from './process-news-item/index';
import { retrieveCandidateNodes } from './process-news-item/mapping';
import { MockProvider } from '../../packages/llm/src/providers/mock';
import type { Database } from '@repo/schemas';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read fixtures
const sampleRssXml = fs.readFileSync(
  path.resolve(__dirname, './fixtures/sample-rss.xml'),
  'utf-8',
);
const sampleGitHubJson = fs.readFileSync(
  path.resolve(__dirname, './fixtures/sample-github-releases.json'),
  'utf-8',
);

type NewsSourceRow = Database['public']['Tables']['news_sources']['Row'];
type NewsItemRow = Database['public']['Tables']['news_items']['Row'];
type CanonicalNodeRow = Database['public']['Tables']['canonical_nodes']['Row'];
type ProposedChangeRow = Database['public']['Tables']['proposed_graph_changes']['Row'];

describe('News Pipeline Edge Functions (Ingestion & Processing)', () => {
  const domainId = '00000000-0000-0000-0000-000000000001';

  let dbSources: NewsSourceRow[] = [];
  let dbNewsItems: NewsItemRow[] = [];
  let dbCanonicalNodes: CanonicalNodeRow[] = [];
  let dbProposedChanges: ProposedChangeRow[] = [];

  beforeEach(() => {
    // Reset in-memory database tables
    dbSources = [
      {
        id: '10000000-0000-0000-0000-000000000001',
        domain_id: domainId,
        name: 'AI Engineering RSS',
        url: 'https://news.example.com/feed.xml',
        kind: 'rss',
        active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: '10000000-0000-0000-0000-000000000002',
        domain_id: domainId,
        name: 'Cursor Releases',
        url: 'https://api.github.com/repos/getcursor/cursor/releases',
        kind: 'github_releases',
        active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: '10000000-0000-0000-0000-000000000003',
        domain_id: domainId,
        name: 'Broken Feed (Offline)',
        url: 'https://broken.invalid/404-feed.xml',
        kind: 'rss',
        active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    dbNewsItems = [];

    dbCanonicalNodes = [
      {
        id: '20000000-0000-0000-0000-000000000001',
        domain_id: domainId,
        slug: 'cursor-ide',
        name: 'Cursor IDE',
        description: 'AI-first code editor with agent mode and multi-file editing',
        node_type: 'tool',
        level: 1,
        area: 'editors-ides',
        status: 'approved',
        external_url: null,
        version_tag: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: '20000000-0000-0000-0000-000000000002',
        domain_id: domainId,
        slug: 'terminal-basics',
        name: 'Terminal Basics',
        description: 'Command line terminal navigation and shell commands',
        node_type: 'skill',
        level: 0,
        area: 'editors-ides',
        status: 'approved',
        external_url: null,
        version_tag: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    dbProposedChanges = [];
  });

  // Mock Supabase Client that executes against in-memory tables
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function createMockSupabaseClient(): any {
    return {
      from: (table: string) => {
        if (table === 'news_sources') {
          return {
            select: (_fields: string) => {
              let filterActive = false;
              let filterIds: string[] | null = null;
              const chain = {
                eq: (col: string, val: unknown) => {
                  if (col === 'active') filterActive = Boolean(val);
                  return chain;
                },
                in: (col: string, vals: string[]) => {
                  if (col === 'id') filterIds = vals;
                  return chain;
                },
                // eslint-disable-next-line @typescript-eslint/require-await
                then: async (resolve: (val: unknown) => void) => {
                  let res = [...dbSources];
                  if (filterActive) res = res.filter((s) => s.active);
                  if (filterIds) res = res.filter((s) => filterIds!.includes(s.id));
                  resolve({ data: res, error: null });
                },
              };
              return chain;
            },
          };
        }

        if (table === 'news_items') {
          return {
            select: (_fields: string) => {
              let filterId: string | null = null;
              let filterStatus: string | null = null;
              let filterOrStr: string | null = null;

              const chain = {
                eq: (col: string, val: string) => {
                  if (col === 'id') filterId = val;
                  if (col === 'status') filterStatus = val;
                  return chain;
                },
                or: (orCondition: string) => {
                  filterOrStr = orCondition;
                  return chain;
                },
                order: () => chain,
                limit: (lim: number) => {
                  return {
                    // eslint-disable-next-line @typescript-eslint/require-await
                    then: async (resolve: (val: unknown) => void) => {
                      let items = [...dbNewsItems];
                      if (filterStatus) items = items.filter((i) => i.status === filterStatus);
                      if (filterId) items = items.filter((i) => i.id === filterId);
                      resolve({ data: items.slice(0, lim), error: null });
                    },
                  };
                },
                // eslint-disable-next-line @typescript-eslint/require-await
                then: async (resolve: (val: unknown) => void) => {
                  let items = [...dbNewsItems];
                  if (filterStatus) items = items.filter((i) => i.status === filterStatus);
                  if (filterId) items = items.filter((i) => i.id === filterId);

                  if (filterOrStr) {
                    // Parse simple or condition: url.in.(...),content_hash.in.(...)
                    const urlMatches = filterOrStr.match(/url\.in\.\(([^)]+)\)/);
                    const hashMatches = filterOrStr.match(/content_hash\.in\.\(([^)]+)\)/);
                    const targetUrls = new Set(
                      urlMatches
                        ? urlMatches[1]
                            .split(',')
                            .map((s) => s.replace(/^"|"$/g, '').trim())
                        : [],
                    );
                    const targetHashes = new Set(
                      hashMatches
                        ? hashMatches[1]
                            .split(',')
                            .map((s) => s.replace(/^"|"$/g, '').trim())
                        : [],
                    );
                    items = items.filter(
                      (i) => targetUrls.has(i.url) || targetHashes.has(i.content_hash),
                    );
                  }

                  resolve({ data: items, error: null });
                },
              };
              return chain;
            },
            insert: (rows: Record<string, unknown>[]) => {
              const insertedRows: NewsItemRow[] = [];
              for (const r of rows) {
                const newRow: NewsItemRow = {
                  id: (r.id as string) || `30000000-0000-0000-0000-${String(dbNewsItems.length + 1).padStart(12, '0')}`,
                  domain_id: (r.domain_id as string) || domainId,
                  source_id: (r.source_id as string) || null,
                  url: r.url as string,
                  title: r.title as string,
                  published_at: (r.published_at as string) || new Date().toISOString(),
                  raw_text: (r.raw_text as string) || null,
                  content_hash: r.content_hash as string,
                  bullets: (r.bullets as [string, string, string]) || null,
                  impact_score: (r.impact_score as number) || null,
                  impact_rationale: (r.impact_rationale as string) || null,
                  tags: (r.tags as string[]) || [],
                  mapped_node_ids: (r.mapped_node_ids as string[]) || [],
                  proposed_new_tool: (r.proposed_new_tool as any) || null,
                  status: (r.status as any) || 'ingested',
                  error_record: (r.error_record as string) || null,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                };
                dbNewsItems.push(newRow);
                insertedRows.push(newRow);
              }
              return {
                select: () => ({
                  // eslint-disable-next-line @typescript-eslint/require-await
                  then: async (resolve: (val: unknown) => void) => {
                    resolve({ data: insertedRows, error: null });
                  },
                }),
                // eslint-disable-next-line @typescript-eslint/require-await
                then: async (resolve: (val: unknown) => void) => {
                  resolve({ data: insertedRows, error: null });
                },
              };
            },
            update: (updates: Record<string, unknown>) => {
              return {
                eq: (_col: string, val: string) => ({
                  // eslint-disable-next-line @typescript-eslint/require-await
                  then: async (resolve: (val: unknown) => void) => {
                    const idx = dbNewsItems.findIndex((i) => i.id === val);
                    if (idx !== -1) {
                      dbNewsItems[idx] = {
                        ...dbNewsItems[idx],
                        ...updates,
                        updated_at: new Date().toISOString(),
                      };
                      resolve({ data: [dbNewsItems[idx]], error: null });
                    } else {
                      resolve({ data: [], error: null });
                    }
                  },
                }),
              };
            },
          };
        }

        if (table === 'canonical_nodes') {
          return {
            select: () => {
              const chain = {
                eq: () => chain,
                // eslint-disable-next-line @typescript-eslint/require-await
                then: async (resolve: (val: unknown) => void) => {
                  resolve({ data: dbCanonicalNodes, error: null });
                },
              };
              return chain;
            },
          };
        }

        if (table === 'proposed_graph_changes') {
          return {
            insert: (row: Record<string, unknown>) => {
              const newChange: ProposedChangeRow = {
                id: `40000000-0000-0000-0000-${String(dbProposedChanges.length + 1).padStart(12, '0')}`,
                news_item_id: (row.news_item_id as string) || null,
                change_type: (row.change_type as any) || 'add_node',
                payload: (row.payload as any) || {},
                status: (row.status as any) || 'pending',
                reviewed_by: null,
                reviewed_at: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              };
              dbProposedChanges.push(newChange);
              return {
                // eslint-disable-next-line @typescript-eslint/require-await
                then: async (resolve: (val: unknown) => void) => {
                  resolve({ data: [newChange], error: null });
                },
              };
            },
          };
        }

        throw new Error(`Unhandled mock table: ${table}`);
      },
    };
  }

  describe('Feed Parsers (RSS & GitHub Releases)', () => {
    it('parses standard RSS items with title, link, date, and clean text', async () => {
      const entries = await parseRssOrAtom(sampleRssXml, 'https://news.example.com/feed.xml');
      expect(entries).toHaveLength(2);

      const first = entries[0];
      expect(first.title).toBe('Anthropic Introduces Claude 3.5 Sonnet');
      expect(first.url).toBe('https://news.example.com/posts/claude-3-5-sonnet');
      expect(first.raw_text).toContain('Anthropic announced Claude 3.5 Sonnet');
      expect(first.content_hash).toBeDefined();
      expect(first.content_hash.length).toBe(64); // SHA-256
    });

    it('parses GitHub releases JSON payload with release name, url, and body', async () => {
      const entries = await parseGitHubReleases(
        sampleGitHubJson,
        'https://api.github.com/repos/getcursor/cursor/releases',
      );
      expect(entries).toHaveLength(2);

      const first = entries[0];
      expect(first.title).toBe('Cursor 0.42: Multi-file Agentic Edits');
      expect(first.url).toBe('https://github.com/getcursor/cursor/releases/tag/v0.42.0');
      expect(first.raw_text).toContain('Introducing background codebase indexing');
      expect(first.content_hash).toBeDefined();
    });
  });

  describe('ingest-news Edge Function', () => {
    it('ingests active sources, normalizes entries, and stores status ingested with null bullets', async () => {
      const mockClient = createMockSupabaseClient();

      const testPayloads = {
        'https://news.example.com/feed.xml': sampleRssXml,
        'https://api.github.com/repos/getcursor/cursor/releases': sampleGitHubJson,
      };

      const req = new Request('http://localhost/functions/v1/ingest-news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_ids: [
            '10000000-0000-0000-0000-000000000001',
            '10000000-0000-0000-0000-000000000002',
          ],
          test_feed_payloads: testPayloads,
        }),
      });

      const res = await handleIngestNews(req, mockClient);
      expect(res.status).toBe(200);

      const result = await res.json();
      expect(result.success).toBe(true);
      expect(result.items_ingested).toBe(4); // 2 RSS + 2 GitHub releases
      expect(result.items_skipped_duplicates).toBe(0);

      // Verify stored items in DB
      expect(dbNewsItems).toHaveLength(4);
      for (const item of dbNewsItems) {
        expect(item.status).toBe('ingested');
        expect(item.bullets).toBeNull();
        expect(item.impact_score).toBeNull();
        expect(item.content_hash).toBeTruthy();
        expect(item.raw_text).toBeTruthy();
      }
    });

    it('enforces idempotency: re-running ingestion creates zero duplicates and skips existing items', async () => {
      const mockClient = createMockSupabaseClient();

      const testPayloads = {
        'https://news.example.com/feed.xml': sampleRssXml,
        'https://api.github.com/repos/getcursor/cursor/releases': sampleGitHubJson,
      };

      const req1 = new Request('http://localhost/functions/v1/ingest-news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_ids: [
            '10000000-0000-0000-0000-000000000001',
            '10000000-0000-0000-0000-000000000002',
          ],
          test_feed_payloads: testPayloads,
        }),
      });
      await handleIngestNews(req1, mockClient);
      expect(dbNewsItems).toHaveLength(4);

      // Run 2: identical payloads
      const req2 = new Request('http://localhost/functions/v1/ingest-news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_ids: [
            '10000000-0000-0000-0000-000000000001',
            '10000000-0000-0000-0000-000000000002',
          ],
          test_feed_payloads: testPayloads,
        }),
      });
      const res2 = await handleIngestNews(req2, mockClient);
      const result2 = await res2.json();

      expect(result2.success).toBe(true);
      expect(result2.items_ingested).toBe(0);
      expect(result2.items_skipped_duplicates).toBe(4);
      expect(dbNewsItems).toHaveLength(4); // Still 4 total rows
    });

    it('enforces per-source error isolation: broken source does not stop healthy sources', async () => {
      const mockClient = createMockSupabaseClient();

      // Only supply test payload for healthy source; broken source will try fetch and throw
      const testPayloads = {
        'https://news.example.com/feed.xml': sampleRssXml,
      };

      const req = new Request('http://localhost/functions/v1/ingest-news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_ids: [
            '10000000-0000-0000-0000-000000000001', // healthy
            '10000000-0000-0000-0000-000000000003', // broken offline
          ],
          test_feed_payloads: testPayloads,
        }),
      });

      const res = await handleIngestNews(req, mockClient);
      expect(res.status).toBe(200);

      const result = await res.json();
      expect(result.success).toBe(true);
      expect(result.items_ingested).toBe(2); // Ingested the healthy feed
      expect(result.errors).toHaveLength(1); // Recorded error for broken feed
      expect(result.errors[0].source_id).toBe('10000000-0000-0000-0000-000000000003');
    });
  });

  describe('process-news-item Edge Function', () => {
    it('processes an ingested item, validates 3 bullets and score 1-10, maps nodes, and publishes', async () => {
      const mockClient = createMockSupabaseClient();
      const mockProvider = new MockProvider();

      // Seed 1 ingested item
      dbNewsItems.push({
        id: '30000000-0000-0000-0000-000000000001',
        domain_id: domainId,
        source_id: dbSources[0].id,
        url: 'https://news.example.com/posts/claude-3-5-sonnet',
        title: 'Claude 3.5 Sonnet Release',
        published_at: new Date().toISOString(),
        raw_text: 'Anthropic releases Claude 3.5 Sonnet with strong coding abilities and agentic features.',
        content_hash: 'hash-claude-35',
        bullets: null,
        impact_score: null,
        impact_rationale: null,
        tags: [],
        mapped_node_ids: [],
        proposed_new_tool: null,
        status: 'ingested',
        error_record: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const req = new Request('http://localhost/functions/v1/process-news-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ news_item_id: '30000000-0000-0000-0000-000000000001' }),
      });

      const res = await handleProcessNewsItem(req, mockClient, mockProvider);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.processed_count).toBe(1);

      const processed = dbNewsItems[0];
      expect(processed.status).toBe('published');
      expect(processed.bullets).toHaveLength(3);
      expect(processed.bullets![0].length).toBeGreaterThan(0);
      expect(processed.impact_score).toBe(8);
      expect(processed.error_record).toBeNull();
    });

    it('rejects invalid output (violating 3-bullet invariant): stays ingested with error record and never publishes', async () => {
      const mockClient = createMockSupabaseClient();
      const mockProvider = new MockProvider();

      const invalidPayload = {
        bullets: ['Only bullet 1', 'Only bullet 2'], // Violates 3 bullets!
        impact_score: 8,
        impact_rationale: 'Invalid bullet count',
        tags: ['ai'],
        proposed_new_tool: null,
      };

      // Enqueue 3 invalid responses so all retry attempts fail
      mockProvider
        .enqueueResponse(invalidPayload)
        .enqueueResponse(invalidPayload)
        .enqueueResponse(invalidPayload);

      dbNewsItems.push({
        id: '30000000-0000-0000-0000-000000000002',
        domain_id: domainId,
        source_id: dbSources[0].id,
        url: 'https://news.example.com/posts/bad-format',
        title: 'Bad Format Release',
        published_at: new Date().toISOString(),
        raw_text: 'Raw text of release',
        content_hash: 'hash-bad-format',
        bullets: null,
        impact_score: null,
        impact_rationale: null,
        tags: [],
        mapped_node_ids: [],
        proposed_new_tool: null,
        status: 'ingested',
        error_record: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const req = new Request('http://localhost/functions/v1/process-news-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ news_item_id: '30000000-0000-0000-0000-000000000002' }),
      });

      const res = await handleProcessNewsItem(req, mockClient, mockProvider);
      expect(res.status).toBe(200);

      const item = dbNewsItems[0];
      expect(item.status).toBe('ingested'); // Invariant: invalid output NEVER published!
      expect(item.error_record).toContain('failed schema validation');
    });

    it('creates proposed_graph_changes row when proposed_new_tool does not match existing canonical node', async () => {
      const mockClient = createMockSupabaseClient();
      const mockProvider = new MockProvider();

      // Configure mock provider to propose a brand new tool ("Agentic CLI")
      mockProvider.enqueueResponse({
        bullets: [
          'Brand new autonomous terminal agent announced.',
          'Operates directly inside git repositories.',
          'Evaluate in experimental development environments.',
        ],
        impact_score: 9,
        impact_rationale: 'Major breakthrough agentic tool category.',
        tags: ['agents', 'cli'],
        proposed_new_tool: {
          name: 'Agentic CLI',
          category: 'ai-assistants',
          supersedes_slugs: [],
        },
      });

      dbNewsItems.push({
        id: '30000000-0000-0000-0000-000000000003',
        domain_id: domainId,
        source_id: dbSources[0].id,
        url: 'https://news.example.com/posts/agentic-cli',
        title: 'Agentic CLI Released',
        published_at: new Date().toISOString(),
        raw_text: 'Announcement of Agentic CLI tool for autonomous workflows.',
        content_hash: 'hash-agentic-cli',
        bullets: null,
        impact_score: null,
        impact_rationale: null,
        tags: [],
        mapped_node_ids: [],
        proposed_new_tool: null,
        status: 'ingested',
        error_record: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const req = new Request('http://localhost/functions/v1/process-news-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ news_item_id: '30000000-0000-0000-0000-000000000003' }),
      });

      const res = await handleProcessNewsItem(req, mockClient, mockProvider);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.items[0].proposed_graph_change_created).toBe(true);

      // Verify row inserted in proposed_graph_changes table
      expect(dbProposedChanges).toHaveLength(1);
      const change = dbProposedChanges[0];
      expect(change.news_item_id).toBe('30000000-0000-0000-0000-000000000003');
      expect(change.change_type).toBe('add_node');
      expect(change.status).toBe('pending');
      expect(change.payload).toHaveProperty('proposed_node');
    });

    it('correctly retrieves candidates and maps to canonical node UUIDs', () => {
      const candidates = retrieveCandidateNodes(
        dbCanonicalNodes as any,
        {
          title: 'Cursor editor multi-file mode',
          bullets: ['Cursor introduces new multi-file editor features.'],
          tags: ['editors-ides', 'ai'],
          raw_text: 'Cursor IDE is an AI editor.',
        },
      );

      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates[0].slug).toBe('cursor-ide');
    });
  });
});
