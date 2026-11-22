import { describe, it, expect, beforeEach } from 'vitest';
import { handleGenerateGuide } from './generate-guide/index';
import { MockProvider } from '../../packages/llm/src/providers/mock';
import {
  QuickstartGuideOutputSchema,
  type Database,
} from '@repo/schemas';

type CanonicalNodeRow = Database['public']['Tables']['canonical_nodes']['Row'];
type GuideRow = Database['public']['Tables']['guides']['Row'];
type ProposedGraphChangeRow = Database['public']['Tables']['proposed_graph_changes']['Row'];

describe('Prompt 13: Quickstart Guide Generation & Structure Validation', () => {
  const domainId = '00000000-0000-0000-0000-000000000001';

  let dbCanonicalNodes: CanonicalNodeRow[] = [];
  let dbGuides: GuideRow[] = [];
  let dbProposedChanges: ProposedGraphChangeRow[] = [];
  let mockProvider: MockProvider;

  beforeEach(() => {
    mockProvider = new MockProvider();
    dbGuides = [];
    dbProposedChanges = [];

    dbCanonicalNodes = [
      {
        id: 'node-cursor-agent',
        domain_id: domainId,
        slug: 'cursor-agent',
        name: 'Cursor Agentic Editor',
        description: 'Next-gen AI code editor with background agentic multi-file workflow.',
        category: 'tool',
        area: 'editors-ides',
        level: 2,
        status: 'approved',
        external_url: 'https://docs.cursor.com/agent/overview',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'node-no-source',
        domain_id: domainId,
        slug: 'undocumented-tool',
        name: 'Undocumented Proprietary Tool',
        description: 'Tool without public release notes or doc URL.',
        category: 'tool',
        area: 'ai-assistants',
        level: 2,
        status: 'approved',
        external_url: null, // NO external doc URL!
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];
  });

  // Mock Supabase client
  function createMockSupabaseClient() {
    return {
      from: (tableName: string) => {
        let filters: Array<(row: any) => boolean> = [];

        const builder: any = {
          select: () => builder,
          eq: (field: string, val: any) => {
            filters.push((row: any) => row[field] === val);
            return builder;
          },
          single: async () => {
            const table = getTable(tableName);
            const matches = table.filter((r) => filters.every((fn) => fn(r)));
            if (matches.length === 0) {
              return { data: null, error: { message: 'Row not found' } };
            }
            return { data: matches[0], error: null };
          },
          maybeSingle: async () => {
            const table = getTable(tableName);
            const matches = table.filter((r) => filters.every((fn) => fn(r)));
            if (matches.length === 0) {
              return { data: null, error: null };
            }
            return { data: matches[0], error: null };
          },
          insert: async (records: any | any[]) => {
            const arr = Array.isArray(records) ? records : [records];
            for (const r of arr) {
              if (tableName === 'proposed_graph_changes') {
                dbProposedChanges.push({
                  id: `pgc-${Date.now()}-${Math.random()}`,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                  reviewed_by: null,
                  reviewed_at: null,
                  news_item_id: null,
                  ...r,
                });
              } else if (tableName === 'guides') {
                dbGuides.push({
                  id: `guide-${Date.now()}`,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                  ...r,
                });
              }
            }
            return { data: records, error: null };
          },
          upsert: (record: any) => {
            if (tableName === 'guides') {
              const idx = dbGuides.findIndex((g) => g.node_id === record.node_id);
              let saved: GuideRow;
              if (idx >= 0) {
                dbGuides[idx] = { ...dbGuides[idx], ...record, updated_at: new Date().toISOString() };
                saved = dbGuides[idx];
              } else {
                saved = {
                  id: `guide-${Date.now()}`,
                  node_id: record.node_id,
                  markdown: record.markdown,
                  source_urls: record.source_urls || [],
                  last_verified_at: record.last_verified_at || new Date().toISOString(),
                  status: record.status || 'draft',
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                };
                dbGuides.push(saved);
              }
              return {
                select: () => ({
                  single: async () => ({ data: saved, error: null }),
                }),
              };
            }
            return {
              select: () => ({
                single: async () => ({ data: record, error: null }),
              }),
            };
          },
        };

        return builder;
      },
    } as any;
  }

  function getTable(name: string): any[] {
    if (name === 'canonical_nodes') return dbCanonicalNodes;
    if (name === 'guides') return dbGuides;
    if (name === 'proposed_graph_changes') return dbProposedChanges;
    return [];
  }

  // --- TESTS ---

  it('1. Structure Validation: Rejects invalid guide outputs (violating 1-line goal, step counts, or minute sums)', () => {
    // Valid output test
    const validGuide = {
      goal: 'Set up Cursor multi-file agentic editing in under 20 minutes.',
      prerequisites: ['Node.js 20+', 'Git repository'],
      steps: [
        {
          step_number: 1,
          title: 'Install Cursor IDE',
          instruction: 'Download and install Cursor.',
          estimated_minutes: 3,
          code_snippet: 'brew install --cask cursor',
        },
        {
          step_number: 2,
          title: 'Open project repository',
          instruction: 'Open workspace root.',
          estimated_minutes: 4,
          code_snippet: 'cursor .',
        },
        {
          step_number: 3,
          title: 'Configure agentic permissions',
          instruction: 'Enable terminal execution permissions.',
          estimated_minutes: 4,
          code_snippet: null,
        },
        {
          step_number: 4,
          title: 'Trigger multi-file refactor',
          instruction: 'Use Command+I to prompt across files.',
          estimated_minutes: 5,
          code_snippet: 'cursor-agent --refactor',
        },
        {
          step_number: 5,
          title: 'Review diff and save',
          instruction: 'Inspect visual diff before accepting changes.',
          estimated_minutes: 4,
          code_snippet: 'git diff',
        },
      ],
      verification: 'Run pnpm test to verify all changes pass without regressions.',
      common_pitfalls: ['Running in untrusted directories without sandbox'],
      source_links: ['https://docs.cursor.com/agent'],
    };

    const validResult = QuickstartGuideOutputSchema.safeParse(validGuide);
    expect(validResult.success).toBe(true);

    // Violation A: Multi-line goal
    const multiLineGoal = {
      ...validGuide,
      goal: 'Line 1\nLine 2',
    };
    expect(QuickstartGuideOutputSchema.safeParse(multiLineGoal).success).toBe(false);

    // Violation B: Fewer than 5 steps (e.g. 4 steps)
    const tooFewSteps = {
      ...validGuide,
      steps: validGuide.steps.slice(0, 4),
    };
    expect(QuickstartGuideOutputSchema.safeParse(tooFewSteps).success).toBe(false);

    // Violation C: More than 8 steps (e.g. 9 steps)
    const tooManySteps = {
      ...validGuide,
      steps: [
        ...validGuide.steps,
        { step_number: 6, title: 'Step 6', instruction: 'inst', estimated_minutes: 2 },
        { step_number: 7, title: 'Step 7', instruction: 'inst', estimated_minutes: 2 },
        { step_number: 8, title: 'Step 8', instruction: 'inst', estimated_minutes: 2 },
        { step_number: 9, title: 'Step 9', instruction: 'inst', estimated_minutes: 2 },
      ],
    };
    expect(QuickstartGuideOutputSchema.safeParse(tooManySteps).success).toBe(false);

    // Violation D: Total minutes too low (e.g. 8 minutes total)
    const tooShortMinutes = {
      ...validGuide,
      steps: validGuide.steps.map((s) => ({ ...s, estimated_minutes: 1 })), // 5 minutes total
    };
    expect(QuickstartGuideOutputSchema.safeParse(tooShortMinutes).success).toBe(false);

    // Violation E: Total minutes too high (e.g. 40 minutes total)
    const tooLongMinutes = {
      ...validGuide,
      steps: validGuide.steps.map((s) => ({ ...s, estimated_minutes: 8 })), // 40 minutes total
    };
    expect(QuickstartGuideOutputSchema.safeParse(tooLongMinutes).success).toBe(false);
  });

  it('2. No-Source Path: If no external documentation URL is configured, does not generate and flags for editor review', async () => {
    const mockClient = createMockSupabaseClient();

    const req = new Request('http://localhost:54321/functions/v1/generate-guide', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        node_id: 'node-no-source',
      }),
    });

    const res = await handleGenerateGuide(req, mockClient, mockProvider);
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe('NO_SOURCE_AVAILABLE');
    expect(json.message).toContain('Flagged for editor review');

    // Verify NO guide row was generated in guides table
    expect(dbGuides.length).toBe(0);

    // Verify node was flagged in proposed_graph_changes
    expect(dbProposedChanges.length).toBe(1);
    expect(dbProposedChanges[0].payload.flag).toBe('MISSING_SOURCE_FOR_GUIDE');
    expect(dbProposedChanges[0].payload.node_id).toBe('node-no-source');
    expect(dbProposedChanges[0].status).toBe('pending');
  });

  it('3. Generation & Caching: Generates draft guide from documentation and caches per canonical node', async () => {
    const mockClient = createMockSupabaseClient();

    // Mock documentation fetch
    const fixtureHtml = `
      <html>
        <head><title>Cursor Agent Documentation</title></head>
        <body>
          <h1>Cursor Agent Multi-File Mode</h1>
          <p>Install Cursor and use Command+I for multi-file background refactoring.</p>
        </body>
      </html>
    `;

    const customFetch = async () =>
      new Response(fixtureHtml, {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });

    const makeRequest = () =>
      new Request('http://localhost:54321/functions/v1/generate-guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          node_id: 'node-cursor-agent',
        }),
      });

    // First call: generates draft guide
    const res1 = await handleGenerateGuide(makeRequest(), mockClient, mockProvider, customFetch as any);
    expect(res1.status).toBe(200);

    const json1 = await res1.json();
    expect(json1.success).toBe(true);
    expect(json1.cached).toBe(false);
    expect(json1.guide).toBeDefined();
    expect(json1.guide.status).toBe('draft'); // Created as draft!
    expect(json1.guide.last_verified_at).toBeDefined();
    expect(json1.guide.markdown).toContain('## Goal');
    expect(json1.guide.markdown).toContain('## Steps');
    expect(json1.guide.markdown).toContain('## Verify it worked');

    // Verify row in database
    expect(dbGuides.length).toBe(1);
    expect(dbGuides[0].node_id).toBe('node-cursor-agent');
    expect(dbGuides[0].status).toBe('draft');

    // Second call: returns cached guide without re-invoking LLM
    const res2 = await handleGenerateGuide(makeRequest(), mockClient, mockProvider, customFetch as any);
    expect(res2.status).toBe(200);

    const json2 = await res2.json();
    expect(json2.success).toBe(true);
    expect(json2.cached).toBe(true);
    expect(json2.guide.id).toBe(json1.guide.id);
  });
});
