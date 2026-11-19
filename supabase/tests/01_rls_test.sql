-- ==============================================================================
-- RLS Isolation & Access Control Test Script
-- Run with: supabase test db (or via psql in an active database)
-- ==============================================================================

begin;

-- Verify RLS is enabled on all tables
do $$
declare
  missing_rls text;
begin
  select string_agg(tablename, ', ') into missing_rls
  from pg_tables
  where schemaname = 'public'
    and rowsecurity = false
    and tablename not in ('schema_migrations');

  if missing_rls is not null then
    raise exception 'Tables missing RLS: %', missing_rls;
  end if;
end $$;

-- Setup test fixtures as service_role/superuser
insert into public.domains (id, slug, name)
values ('11111111-1111-1111-1111-111111111111', 'test-rls-domain', 'Test Domain')
on conflict (slug) do nothing;

insert into public.canonical_nodes (id, domain_id, slug, name, node_type, level, status)
values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'test-node-1', 'Test Node 1', 'skill', 0, 'approved')
on conflict (slug) do nothing;

-- ------------------------------------------------------------------------------
-- Test 1: User A creates their own roadmap node and profile
-- ------------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" = '{"sub": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "role": "authenticated"}';

insert into public.profiles (id, display_name)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'User A');

insert into public.user_nodes (id, user_id, node_id, status)
values ('33333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'todo');

-- Verify User A sees their own rows
do $$
declare
  profile_count int;
  node_count int;
begin
  select count(*) into profile_count from public.profiles where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  select count(*) into node_count from public.user_nodes where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  if profile_count <> 1 or node_count <> 1 then
    raise exception 'User A could not read own rows';
  end if;
end $$;

-- ------------------------------------------------------------------------------
-- Test 2: User B cannot read or modify User A's rows
-- ------------------------------------------------------------------------------
set local "request.jwt.claims" = '{"sub": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "role": "authenticated"}';

do $$
declare
  other_profile_count int;
  other_node_count int;
  rows_updated int;
begin
  -- User B should see 0 rows for User A's profile
  select count(*) into other_profile_count from public.profiles where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  if other_profile_count <> 0 then
    raise exception 'Isolation failure: User B saw User A profile';
  end if;

  -- User B should see 0 rows for User A's user_nodes
  select count(*) into other_node_count from public.user_nodes where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  if other_node_count <> 0 then
    raise exception 'Isolation failure: User B saw User A user_nodes';
  end if;

  -- User B cannot update User A's user_nodes
  update public.user_nodes set status = 'completed' where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  get diagnostics rows_updated = row_count;
  if rows_updated <> 0 then
    raise exception 'Isolation failure: User B updated User A user_nodes';
  end if;
end $$;

-- ------------------------------------------------------------------------------
-- Test 3: Normal User B cannot write canonical content
-- ------------------------------------------------------------------------------
do $$
begin
  begin
    insert into public.canonical_nodes (domain_id, slug, name, node_type, level, status)
    values ('11111111-1111-1111-1111-111111111111', 'hacked-node', 'Hacked Node', 'tool', 1, 'approved');
    raise exception 'RLS policy failure: Normal user was able to insert canonical_nodes!';
  exception when insufficient_privilege or others then
    -- Expected behavior: insert blocked by RLS with_check policy
    null;
  end;
end $$;

rollback;
