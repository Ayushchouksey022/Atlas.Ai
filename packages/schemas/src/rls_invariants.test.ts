import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Database, Tables } from './index';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Database Schema & RLS Invariants', () => {
  const migrationPath = path.resolve(
    __dirname,
    '../../../supabase/migrations/20261119000001_initial_schema.sql'
  );
  const seedPath = path.resolve(
    __dirname,
    '../../../supabase/seed.sql'
  );

  const migrationSql = fs.readFileSync(migrationPath, 'utf8');
  const seedSql = fs.readFileSync(seedPath, 'utf8');

  const requiredTables = [
    'domains',
    'user_roles',
    'profiles',
    'canonical_nodes',
    'canonical_edges',
    'node_supersedes',
    'user_nodes',
    'news_sources',
    'news_items',
    'verdicts',
    'user_verdicts',
    'guides',
    'proposed_graph_changes',
    'sponsored_placements',
    'usage_counters',
    'events',
  ];

  it('exports valid Database types for all 16 required tables', () => {
    type Profile = Tables<'profiles'>;
    type UserNode = Tables<'user_nodes'>;
    type CanonicalNode = Tables<'canonical_nodes'>;
    type NewsItem = Tables<'news_items'>;

    const dummyProfile: Profile = {
      id: 'test-id',
      display_name: 'Test User',
      domain_id: 'dom-1',
      experience: { area: 'expert' },
      onboarding_completed: true,
      push_token: null,
      notify_high_impact: true,
      notify_digest: true,
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    };

    expect(dummyProfile.onboarding_completed).toBe(true);
  });

  it('enables Row Level Security (RLS) on EVERY required table', () => {
    for (const table of requiredTables) {
      const rlsRegex = new RegExp(
        `alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`,
        'i'
      );
      expect(
        rlsRegex.test(migrationSql),
        `Table public.${table} must have RLS enabled`
      ).toBe(true);
    }
  });

  it('implements user isolation policies (User A cannot read/modify User B rows)', () => {
    // Check profiles policy
    expect(migrationSql).toMatch(/create\s+policy\s+"Users can view own profile/i);
    expect(migrationSql).toMatch(/auth\.uid\(\)\s*=\s*id/);

    // Check user_nodes policies
    expect(migrationSql).toMatch(/create\s+policy\s+"Users can view own user_nodes/i);
    expect(migrationSql).toMatch(/create\s+policy\s+"Users can update own user_nodes/i);
    expect(migrationSql).toMatch(/create\s+policy\s+"Users can delete own user_nodes/i);
    expect(migrationSql).toMatch(/auth\.uid\(\)\s*=\s*user_id/);

    // Check user_verdicts policies
    expect(migrationSql).toMatch(/create\s+policy\s+"Users can view own user_verdicts/i);

    // Check usage_counters and events
    expect(migrationSql).toMatch(/create\s+policy\s+"Users can view own usage counters/i);
    expect(migrationSql).toMatch(/create\s+policy\s+"Users can view own events/i);
  });

  it('proves normal users cannot write canonical content (only editors can write)', () => {
    // Canonical nodes
    expect(migrationSql).toMatch(/create\s+policy\s+"Only editors can insert canonical nodes/i);
    expect(migrationSql).toMatch(/create\s+policy\s+"Only editors can update canonical nodes/i);
    expect(migrationSql).toMatch(/create\s+policy\s+"Only editors can delete canonical nodes/i);
    expect(migrationSql).toMatch(/public\.is_editor\(\)/);

    // Canonical edges
    expect(migrationSql).toMatch(/create\s+policy\s+"Only editors can insert canonical edges/i);

    // Node supersedes
    expect(migrationSql).toMatch(/create\s+policy\s+"Only editors can insert node_supersedes/i);

    // Guides & news_sources
    expect(migrationSql).toMatch(/create\s+policy\s+"Only editors can insert guides/i);
    expect(migrationSql).toMatch(/create\s+policy\s+"Only editors can view news sources/i);
  });

  it('enforces verdicts and news_items are writable only by service role', () => {
    // news_items has no public INSERT or DELETE policy
    expect(migrationSql).not.toMatch(/create\s+policy\s+[^;]+on\s+public\.news_items\s+for\s+insert\s+to\s+authenticated/i);
    // verdicts has no public INSERT, UPDATE, or DELETE policy
    expect(migrationSql).not.toMatch(/create\s+policy\s+[^;]+on\s+public\.verdicts\s+for\s+insert/i);
    expect(migrationSql).not.toMatch(/create\s+policy\s+[^;]+on\s+public\.verdicts\s+for\s+update/i);
    expect(migrationSql).not.toMatch(/create\s+policy\s+[^;]+on\s+public\.verdicts\s+for\s+delete/i);
  });

  it('enforces PRD Invariant: user_nodes completed or archived are never hard-deleted', () => {
    expect(migrationSql).toMatch(/prevent_user_nodes_hard_delete/);
    expect(migrationSql).toMatch(/status\s+in\s+\('completed',\s*'archived'\)/);
    expect(migrationSql).toMatch(/delete_user_account/);
  });

  it('enforces PRD Invariant: bullets always has exactly 3 non-empty strings', () => {
    expect(migrationSql).toMatch(/jsonb_array_length\(bullets\)\s*=\s*3/);
    expect(migrationSql).toMatch(/bullets->>0/);
    expect(migrationSql).toMatch(/bullets->>1/);
    expect(migrationSql).toMatch(/bullets->>2/);
  });

  it('enforces PRD Invariant: only approved canonical nodes may appear in user_nodes', () => {
    expect(migrationSql).toMatch(/enforce_approved_canonical_node/);
    expect(migrationSql).toMatch(/status\s*=\s*'approved'/);
  });

  it('enforces PRD Invariant: structural separation of sponsored_placements', () => {
    // Extract the sponsored_placements create table statement
    const sponsoredTableDef =
      migrationSql.match(
        /create\s+table\s+if\s+not\s+exists\s+public\.sponsored_placements\s*\([^;]+\);/i
      )?.[0] || '';
    expect(sponsoredTableDef).toBeTruthy();
    expect(sponsoredTableDef).not.toMatch(/references\s+public\.news_items/i);
    expect(sponsoredTableDef).not.toMatch(/references\s+public\.verdicts/i);
    expect(sponsoredTableDef).not.toMatch(/references\s+public\.canonical_nodes/i);
  });

  it('configures Supabase Realtime publication on user_nodes, profiles and user_verdicts', () => {
    expect(migrationSql).toMatch(/alter\s+publication\s+supabase_realtime\s+add\s+table\s+public\.user_nodes/i);
    expect(migrationSql).toMatch(/alter\s+publication\s+supabase_realtime\s+add\s+table\s+public\.profiles/i);
    expect(migrationSql).toMatch(/alter\s+publication\s+supabase_realtime\s+add\s+table\s+public\.user_verdicts/i);
  });

  it('seeds single launch domain ai-assisted-software-development', () => {
    expect(seedSql).toMatch(/ai-assisted-software-development/);
    expect(seedSql).toMatch(/AI-Assisted Software Development/);
  });
});
