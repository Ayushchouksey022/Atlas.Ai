-- Migration: 20261122000005_apply_verdict_rpc.sql
-- Atomic, transactional apply_verdict RPC function (Prompt 12 / PRD Section 10.3)

create or replace function public.apply_verdict_transaction(
  p_user_id uuid,
  p_news_item_id uuid,
  p_verdict_id uuid,
  p_verdict_type text,
  p_target_node_id uuid default null,
  p_new_node_id uuid default null,
  p_insert_after_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_state text;
  v_new_node_status text;
  v_target_user_node record;
begin
  -- 1. Security check: caller must be user or editor or service role
  if auth.uid() is not null and auth.uid() <> p_user_id and not public.is_editor() then
    raise exception 'Unauthorized: Cannot apply verdict for another user (auth.uid=%, target=%)',
      auth.uid(), p_user_id;
  end if;

  -- 2. Idempotency Check: check if already applied
  select state into v_existing_state
  from public.user_verdicts
  where user_id = p_user_id and news_item_id = p_news_item_id;

  if v_existing_state = 'applied' then
    return jsonb_build_object(
      'success', true,
      'already_applied', true,
      'message', 'Verdict has already been applied',
      'verdict_id', p_verdict_id
    );
  end if;

  -- 3. Execute based on verdict_type
  if p_verdict_type = 'shield' then
    -- Shield: no graph mutation
    insert into public.user_verdicts (
      user_id, news_item_id, verdict_id, state, applied_at, updated_at
    )
    values (
      p_user_id, p_news_item_id, p_verdict_id, 'applied', now(), now()
    )
    on conflict (user_id, news_item_id) do update set
      verdict_id = excluded.verdict_id,
      state = 'applied',
      applied_at = now(),
      updated_at = now();

    return jsonb_build_object(
      'success', true,
      'verdict_type', 'shield',
      'mutated', false
    );

  elsif p_verdict_type = 'injection' then
    -- Injection: validate new node is approved
    if p_new_node_id is null then
      raise exception 'Invariant violated: Injection requires a valid new_node_id';
    end if;

    select status into v_new_node_status
    from public.canonical_nodes
    where id = p_new_node_id;

    if v_new_node_status is distinct from 'approved' then
      raise exception 'Invariant violated: Only approved canonical nodes can be injected (node_id=%)', p_new_node_id;
    end if;

    -- Insert new user_node (todo, origin=injection, fast_track=false)
    insert into public.user_nodes (
      user_id,
      node_id,
      status,
      origin,
      fast_track,
      replaced_node_id,
      version,
      updated_at
    )
    values (
      p_user_id,
      p_new_node_id,
      'todo',
      'injection',
      false,
      null,
      1,
      now()
    )
    on conflict (user_id, node_id) do update set
      status = excluded.status,
      origin = excluded.origin,
      version = public.user_nodes.version + 1,
      updated_at = now();

    -- Mark user_verdicts as applied
    insert into public.user_verdicts (
      user_id, news_item_id, verdict_id, state, applied_at, updated_at
    )
    values (
      p_user_id, p_news_item_id, p_verdict_id, 'applied', now(), now()
    )
    on conflict (user_id, news_item_id) do update set
      verdict_id = excluded.verdict_id,
      state = 'applied',
      applied_at = now(),
      updated_at = now();

    return jsonb_build_object(
      'success', true,
      'verdict_type', 'injection',
      'mutated', true,
      'new_node_id', p_new_node_id
    );

  elsif p_verdict_type = 'override' then
    -- Override: validate target node and new node
    if p_target_node_id is null or p_new_node_id is null then
      raise exception 'Invariant violated: Override requires both target_node_id and new_node_id';
    end if;

    -- Verify target node exists in user's roadmap and is not archived
    select * into v_target_user_node
    from public.user_nodes
    where user_id = p_user_id and node_id = p_target_node_id;

    if not found then
      raise exception 'Invariant violated: Target node not found in user roadmap (target_node_id=%)', p_target_node_id;
    end if;

    if v_target_user_node.status = 'archived' then
      raise exception 'Invariant violated: Target node is already archived (target_node_id=%)', p_target_node_id;
    end if;

    -- Verify approved supersedes relationship
    if not exists (
      select 1 from public.node_supersedes
      where old_node = p_target_node_id and new_node = p_new_node_id
    ) then
      raise exception 'Invariant violated: No approved supersedes relationship exists between % and %',
        p_target_node_id, p_new_node_id;
    end if;

    -- 1. Archive old node in user_nodes (never hard-deleted!)
    update public.user_nodes
    set status = 'archived',
        version = version + 1,
        updated_at = now()
    where user_id = p_user_id and node_id = p_target_node_id;

    -- 2. Insert new node (todo, origin=override, fast_track=true, replaced_node_id=target_node_id)
    insert into public.user_nodes (
      user_id,
      node_id,
      status,
      origin,
      fast_track,
      replaced_node_id,
      version,
      updated_at
    )
    values (
      p_user_id,
      p_new_node_id,
      'todo',
      'override',
      true,
      p_target_node_id,
      1,
      now()
    )
    on conflict (user_id, node_id) do update set
      status = excluded.status,
      origin = excluded.origin,
      fast_track = true,
      replaced_node_id = excluded.replaced_node_id,
      version = public.user_nodes.version + 1,
      updated_at = now();

    -- 3. Mark user_verdicts as applied
    insert into public.user_verdicts (
      user_id, news_item_id, verdict_id, state, applied_at, updated_at
    )
    values (
      p_user_id, p_news_item_id, p_verdict_id, 'applied', now(), now()
    )
    on conflict (user_id, news_item_id) do update set
      verdict_id = excluded.verdict_id,
      state = 'applied',
      applied_at = now(),
      updated_at = now();

    return jsonb_build_object(
      'success', true,
      'verdict_type', 'override',
      'mutated', true,
      'old_node_id', p_target_node_id,
      'new_node_id', p_new_node_id
    );

  else
    raise exception 'Invalid verdict_type: %', p_verdict_type;
  end if;
end;
$$;

grant execute on function public.apply_verdict_transaction(uuid, uuid, uuid, text, uuid, uuid, uuid[]) to authenticated;
grant execute on function public.apply_verdict_transaction(uuid, uuid, uuid, text, uuid, uuid, uuid[]) to service_role;
