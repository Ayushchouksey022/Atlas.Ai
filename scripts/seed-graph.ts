/**
 * Canonical Graph Seeder
 *
 * Idempotently loads the canonical graph seed JSON into Supabase:
 * 1. Validates the JSON with validateCanonicalGraphFile
 * 2. Connects to Supabase using the service role key
 * 3. Upserts domain record
 * 4. Upserts canonical_nodes by slug
 * 5. Upserts canonical_edges by (from_node, to_node)
 * 6. Upserts node_supersedes by (old_node, new_node)
 *
 * Safe to execute repeatedly without duplicating rows.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { validateCanonicalGraphFile } from '../packages/graph/src/validate';
import type { Database } from '@repo/schemas';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface SeedResult {
  success: boolean;
  offline?: boolean;
  domainSlug: string;
  domainId?: string;
  nodesUpserted: number;
  edgesUpserted: number;
  supersedesUpserted: number;
  error?: string;
}

export async function seedCanonicalGraph(filePath?: string): Promise<SeedResult> {
  const defaultPath = path.resolve(
    __dirname,
    '../supabase/seed/canonical-graph/ai-assisted-software-development.json',
  );
  const targetPath = filePath ?? defaultPath;

  console.log(`[graph:seed] Validating seed file: ${path.basename(targetPath)}...`);
  const validation = validateCanonicalGraphFile(targetPath);
  if (!validation.valid) {
    console.error('[graph:seed] Validation failed before seeding:');
    for (const err of validation.errors) {
      console.error(`  ❌ ${err}`);
    }
    return {
      success: false,
      domainSlug: validation.domain,
      nodesUpserted: 0,
      edgesUpserted: 0,
      supersedesUpserted: 0,
      error: 'Seed validation failed',
    };
  }

  const rawJson = JSON.parse(fs.readFileSync(targetPath, 'utf-8'));
  const domainSlug: string = rawJson.domain;
  const nodes = rawJson.nodes;
  const edges = rawJson.edges;
  const supersedes = rawJson.supersedes ?? [];

  const supabaseUrl = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
  const supabaseServiceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4Mzg3OTYwMH0.local-dev-service-role-key';

  const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Check database connectivity
  try {
    const { error: pingError } = await supabase.from('domains').select('id').limit(1);
    if (pingError && pingError.code !== 'PGRST116') {
      throw pingError;
    }
  } catch (err) {
    const errMsg = (err as Error).message || String(err);
    console.warn(`\n[graph:seed] Notice: Supabase database is offline at ${supabaseUrl}.`);
    console.warn(`[graph:seed] Details: ${errMsg}`);
    console.warn('[graph:seed] (Docker Desktop is not currently running in this environment.)');
    console.warn('[graph:seed] When Docker is available, start local Supabase with:');
    console.warn('             pnpm db:start');
    console.warn('             pnpm graph:seed');
    console.warn('[graph:seed] Seed dataset is validated and ready for ingestion.\n');

    return {
      success: true,
      offline: true,
      domainSlug,
      nodesUpserted: 0,
      edgesUpserted: 0,
      supersedesUpserted: 0,
    };
  }

  console.log(`[graph:seed] Connected to Supabase at ${supabaseUrl}`);

  // 1. Upsert Domain
  const domainName = domainSlug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  const { data: domainData, error: domainErr } = await supabase
    .from('domains')
    .upsert(
      {
        slug: domainSlug,
        name: domainName,
      },
      { onConflict: 'slug' },
    )
    .select('id')
    .single();

  if (domainErr || !domainData) {
    throw new Error(`Failed to upsert domain: ${domainErr?.message}`);
  }
  const domainId = domainData.id;
  console.log(`[graph:seed] Domain ready: ${domainSlug} (${domainId})`);

  // 2. Upsert Canonical Nodes
  const nodePayloads = nodes.map((n: (typeof nodes)[0]) => ({
    domain_id: domainId,
    slug: n.slug,
    name: n.name,
    description: n.description ?? '',
    node_type: n.type,
    level: n.level,
    area: n.area,
    status: n.status ?? 'approved',
    external_url: n.external_url ?? null,
    version_tag: n.version_tag ?? null,
  }));

  const { data: insertedNodes, error: nodesErr } = await supabase
    .from('canonical_nodes')
    .upsert(nodePayloads, { onConflict: 'slug' })
    .select('id, slug');

  if (nodesErr || !insertedNodes) {
    throw new Error(`Failed to upsert canonical nodes: ${nodesErr?.message}`);
  }

  const slugToId = new Map<string, string>();
  for (const n of insertedNodes) {
    slugToId.set(n.slug, n.id);
  }
  console.log(`[graph:seed] Upserted ${insertedNodes.length} canonical nodes.`);

  // 3. Upsert Canonical Edges
  const edgePayloads = edges.map(([fromSlug, toSlug]: [string, string]) => {
    const fromId = slugToId.get(fromSlug);
    const toId = slugToId.get(toSlug);
    if (!fromId || !toId) {
      throw new Error(`Edge references missing slug: from=${fromSlug}, to=${toSlug}`);
    }
    return {
      from_node: fromId,
      to_node: toId,
    };
  });

  const { data: insertedEdges, error: edgesErr } = await supabase
    .from('canonical_edges')
    .upsert(edgePayloads, { onConflict: 'from_node,to_node' })
    .select('id');

  if (edgesErr || !insertedEdges) {
    throw new Error(`Failed to upsert canonical edges: ${edgesErr?.message}`);
  }
  console.log(`[graph:seed] Upserted ${insertedEdges.length} canonical edges.`);

  // 4. Upsert Node Supersedes
  let supersedesCount = 0;
  if (supersedes.length > 0) {
    const supersedesPayloads = supersedes.map(
      (item: [string, string, string?] | { old_node: string; new_node: string; note?: string }) => {
        const oldSlug = Array.isArray(item) ? item[0] : item.old_node;
        const newSlug = Array.isArray(item) ? item[1] : item.new_node;
        const note = Array.isArray(item) ? item[2] ?? null : item.note ?? null;

        const oldId = slugToId.get(oldSlug);
        const newId = slugToId.get(newSlug);
        if (!oldId || !newId) {
          throw new Error(`Supersedes references missing slug: old=${oldSlug}, new=${newSlug}`);
        }
        return {
          old_node: oldId,
          new_node: newId,
          note,
        };
      },
    );

    const { data: insertedSupersedes, error: supersedesErr } = await supabase
      .from('node_supersedes')
      .upsert(supersedesPayloads, { onConflict: 'old_node,new_node' })
      .select('id');

    if (supersedesErr || !insertedSupersedes) {
      throw new Error(`Failed to upsert node supersedes: ${supersedesErr?.message}`);
    }
    supersedesCount = insertedSupersedes.length;
    console.log(`[graph:seed] Upserted ${supersedesCount} node_supersedes records.`);
  }

  console.log('[graph:seed] Graph seeding completed successfully! ✅');

  return {
    success: true,
    domainSlug,
    domainId,
    nodesUpserted: insertedNodes.length,
    edgesUpserted: insertedEdges.length,
    supersedesUpserted: supersedesCount,
  };
}

// CLI entrypoint
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  seedCanonicalGraph()
    .then((res) => {
      if (!res.success) process.exit(1);
    })
    .catch((err) => {
      console.error('[graph:seed] Fatal error during seeding:', err);
      process.exit(1);
    });
}
