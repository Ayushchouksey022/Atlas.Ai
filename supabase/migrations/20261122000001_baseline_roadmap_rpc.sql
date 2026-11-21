-- Migration: 20261122000001_baseline_roadmap_rpc.sql
-- Transactional RPC function for atomic baseline roadmap creation (Prompt 5 / PRD Section 8.1)

create or replace function public.save_baseline_roadmap(
  p_user_id uuid,
  p_domain_id uuid,
  p_experience jsonb,
  p_user_nodes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted_count integer := 0;
begin
  -- 1. Security Check: Ensure caller is the owner or editor / service role
  if auth.uid() is not null and auth.uid() <> p_user_id and not public.is_editor() then
    raise exception 'Unauthorized: Cannot create baseline roadmap for another user (auth.uid=%, target=%)',
      auth.uid(), p_user_id;
  end if;

  -- 2. Upsert user_nodes in a single transaction (idempotent: running twice updates, never duplicates)
  insert into public.user_nodes (
    user_id,
    node_id,
    status,
    origin,
    fast_track,
    version
  )
  select
    p_user_id,
    (node->>'node_id')::uuid,
    (node->>'status')::text,
    coalesce((node->>'origin')::text, 'baseline'),
    coalesce((node->>'fast_track')::boolean, false),
    1
  from jsonb_array_elements(p_user_nodes) as node
  on conflict (user_id, node_id) do update set
    status = excluded.status,
    origin = excluded.origin,
    fast_track = excluded.fast_track,
    version = public.user_nodes.version + 1,
    updated_at = now();

  get diagnostics v_inserted_count = row_count;

  -- 3. Upsert / update profile experience and onboarding_completed atomically
  insert into public.profiles (
    id,
    domain_id,
    experience,
    onboarding_completed,
    updated_at
  )
  values (
    p_user_id,
    p_domain_id,
    p_experience,
    true,
    now()
  )
  on conflict (id) do update set
    domain_id = excluded.domain_id,
    experience = excluded.experience,
    onboarding_completed = true,
    updated_at = now();

  return jsonb_build_object(
    'success', true,
    'nodes_saved', v_inserted_count,
    'user_id', p_user_id
  );
end;
$$;

-- Grant execution to authenticated users and service_role
grant execute on function public.save_baseline_roadmap(uuid, uuid, jsonb, jsonb) to authenticated;
grant execute on function public.save_baseline_roadmap(uuid, uuid, jsonb, jsonb) to service_role;
