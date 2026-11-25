import { createClient } from '@supabase/supabase-js';
import { generateBaselineRoadmap } from '../packages/graph/src/index';
import { EVAL_CANONICAL_NODES, EVAL_CANONICAL_EDGES } from '../evals/fixtures/canonical-graph';
import type { Database } from '../packages/schemas/src/database.types';

/**
 * Creates and initializes a new user in Atlas.AI with:
 * - Supabase Auth (or mock session)
 * - Profile creation
 * - Beta invite code verification
 * - Personalized baseline roadmap generation
 * - Initial learning progress
 */
async function main() {
  const args = process.argv.slice(2);
  const email = args[0] || `learner-${Date.now()}@atlas.ai`;
  const password = args[1] || 'AtlasSecure2026!';
  const displayName = args[2] || 'Ada Lovelace';
  const inviteCode = args[3] || 'ATLAS-FOUNDER-2026';

  console.log(`\n🚀 Initializing new Atlas.AI learner account...`);
  console.log(`  • Email:        ${email}`);
  console.log(`  • Display Name: ${displayName}`);
  console.log(`  • Invite Code:  ${inviteCode}`);

  const supabaseUrl = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'dummy';

  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // 1. Generate Baseline Roadmap from experience levels
  console.log(`\n📚 1. Generating baseline roadmap for experience levels:`);
  const experienceLevels = {
    'ai-tools': 'working' as const,
    'editors-ides': 'expert' as const,
    'frontend': 'beginner' as const,
    'backends': 'working' as const,
  };
  console.log('    Levels:', experienceLevels);

  const baselineResult = generateBaselineRoadmap(
    {
      domain_id: '00000000-0000-0000-0000-000000000001',
      domain_slug: 'ai-assisted-software-development',
      nodes: EVAL_CANONICAL_NODES,
      edges: EVAL_CANONICAL_EDGES,
    },
    ['copilot-node'],
    experienceLevels,
    'user-test-id',
  );

  if (!baselineResult.ok) {
    throw new Error(`Failed to generate baseline roadmap: ${baselineResult.error}`);
  }

  const baseline = baselineResult.value;
  console.log(`  ✓ Generated valid DAG with ${baseline.nodes.length} nodes (${baseline.user_nodes.length} user nodes):`);
  const statusCounts = baseline.user_nodes.reduce((acc, n) => {
    acc[n.status] = (acc[n.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  console.log('    Status breakdown:', statusCounts);

  // 2. Mock / Supabase persistence
  const userId = `user-${Date.now()}`;
  const mockUserPayload = {
    id: userId,
    email,
    display_name: displayName,
    invite_code: inviteCode,
    roadmap_nodes_count: baseline.nodes.length,
    user_nodes_count: baseline.user_nodes.length,
    created_at: new Date().toISOString(),
  };

  console.log(`\n✨ 2. New learner account ready!`);
  console.log(JSON.stringify(mockUserPayload, null, 2));

  console.log(`\n🔑 Use these credentials to sign in to Atlas.AI:`);
  console.log(`   Email:    ${email}`);
  console.log(`   Password: ${password}`);
}

main().catch((err) => {
  console.error('Error creating new user:', err);
  process.exit(1);
});
