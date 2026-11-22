import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4Mzg3OTYwMH0.local-service-role-key';

async function grantEditorRole() {
  const email = process.argv[2]?.trim().toLowerCase();

  if (!email) {
    console.error('Error: Please provide a user email address.\nUsage: pnpm grant-editor <email>');
    process.exit(1);
  }

  console.log(`Connecting to Supabase at ${supabaseUrl}...`);
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  try {
    // 1. Look up user by email via admin API
    const { data: userData, error: listError } = await supabase.auth.admin.listUsers();

    if (listError) {
      console.error('Failed to query auth.users:', listError.message);
      process.exit(1);
    }

    const matchedUser = userData.users.find(
      (u) => u.email?.toLowerCase() === email,
    );

    if (!matchedUser) {
      console.error(`User with email "${email}" was not found in auth.users.`);
      console.log('Available user emails:');
      for (const u of userData.users.slice(0, 10)) {
        console.log(` - ${u.email} (${u.id})`);
      }
      process.exit(1);
    }

    // 2. Insert or update user_roles row
    const { error: roleError } = await supabase.from('user_roles').upsert(
      {
        user_id: matchedUser.id,
        role: 'editor',
      },
      { onConflict: 'user_id,role' },
    );

    if (roleError) {
      console.error('Failed to grant editor role:', roleError.message);
      process.exit(1);
    }

    console.log(`✓ Successfully granted 'editor' role to ${email} (User ID: ${matchedUser.id})`);
  } catch (err) {
    console.error('Unexpected error granting role:', err);
    process.exit(1);
  }
}

void grantEditorRole();
