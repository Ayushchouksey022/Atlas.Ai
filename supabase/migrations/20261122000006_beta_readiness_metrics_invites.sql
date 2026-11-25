-- Migration: 20261122000006_beta_readiness_metrics_invites.sql
-- Description: Adds Weekly Active Learners view, Editor Metrics functions, Beta Invites table, and profile notification columns

-- ==============================================================================
-- 1. PROFILE NOTIFICATION & HARDENING COLUMNS
-- ==============================================================================

alter table public.profiles
  add column if not exists push_token text,
  add column if not exists notify_high_impact boolean not null default true,
  add column if not exists notify_digest boolean not null default true;

-- ==============================================================================
-- 2. WEEKLY ACTIVE LEARNERS VIEW (PRD Section 13)
-- ==============================================================================
-- Definition: Completed a node OR confirmed a verdict in the calendar week.

create or replace view public.weekly_active_learners as
select
  date_trunc('week', activity_time) as calendar_week,
  user_id,
  count(*) as activity_count,
  bool_or(activity_type = 'node_completed') as has_node_completed,
  bool_or(activity_type = 'verdict_confirmed') as has_verdict_confirmed
from (
  -- Users who completed a node
  select
    user_id,
    updated_at as activity_time,
    'node_completed' as activity_type
  from public.user_nodes
  where status = 'completed'

  union all

  -- Users who confirmed/applied a verdict
  select
    user_id,
    coalesce(applied_at, updated_at) as activity_time,
    'verdict_confirmed' as activity_type
  from public.user_verdicts
  where state in ('confirmed', 'applied')
) activities
group by date_trunc('week', activity_time), user_id;

-- ==============================================================================
-- 3. BETA INVITES TABLE & FUNCTIONS (PRD Milestone M6)
-- ==============================================================================

create table if not exists public.beta_invites (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  is_used boolean not null default false,
  used_by uuid references auth.users(id) on delete set null,
  used_at timestamptz,
  max_uses integer not null default 1,
  use_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_beta_invites_code on public.beta_invites(code);

alter table public.beta_invites enable row level security;

-- Public can check code validity
create policy "Anyone can validate invite codes"
  on public.beta_invites for select using (true);

-- Editors can manage invite codes
create policy "Editors can manage invite codes"
  on public.beta_invites for all using (public.is_editor());

-- Seed starter beta invite codes
insert into public.beta_invites (code, max_uses)
values
  ('ATLAS-FOUNDER-2026', 10),
  ('BETA-INVITE-001', 1),
  ('BETA-INVITE-002', 1),
  ('BETA-INVITE-003', 1),
  ('BETA-INVITE-004', 1),
  ('BETA-INVITE-005', 1),
  ('AI-LEARNER-2026', 50)
on conflict (code) do nothing;

-- Function to validate invite code against cap (300 users)
create or replace function public.validate_beta_invite(invite_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite record;
  v_total_users integer;
  c_max_beta_users constant integer := 300;
begin
  -- Check user cap
  select count(*) into v_total_users from auth.users;
  if v_total_users >= c_max_beta_users then
    return jsonb_build_object(
      'valid', false,
      'reason', 'Beta user cap of 300 users reached. Please join the waitlist.'
    );
  end if;

  select * into v_invite from public.beta_invites
  where upper(trim(code)) = upper(trim(invite_code));

  if not found then
    return jsonb_build_object(
      'valid', false,
      'reason', 'Invalid invite code.'
    );
  end if;

  if v_invite.is_used or v_invite.use_count >= v_invite.max_uses then
    return jsonb_build_object(
      'valid', false,
      'reason', 'Invite code has already been redeemed.'
    );
  end if;

  return jsonb_build_object(
    'valid', true,
    'code', v_invite.code
  );
end;
$$;

-- Function to claim invite code on successful signup
create or replace function public.claim_beta_invite(invite_code text, claiming_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite record;
begin
  select * into v_invite from public.beta_invites
  where upper(trim(code)) = upper(trim(invite_code))
  for update;

  if not found or v_invite.is_used or v_invite.use_count >= v_invite.max_uses then
    return false;
  end if;

  update public.beta_invites
  set
    use_count = use_count + 1,
    is_used = (use_count + 1 >= max_uses),
    used_by = claiming_user_id,
    used_at = now()
  where id = v_invite.id;

  return true;
end;
$$;

-- ==============================================================================
-- 4. EDITOR METRICS RPC (PRD Section 11.6 & 13)
-- ==============================================================================

create or replace function public.get_editor_metrics()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_week_learners integer;
  v_total_confirmed integer;
  v_total_previewed integer;
  v_total_dismissed integer;
  v_confirmation_rate numeric;
  v_shield_count integer;
  v_injection_count integer;
  v_override_count integer;
  v_total_verdicts integer;
  v_avg_onboarding_duration numeric;
begin
  -- 1. Weekly Active Learners for the current calendar week
  select count(distinct user_id)
  into v_current_week_learners
  from public.weekly_active_learners
  where calendar_week = date_trunc('week', now());

  -- 2. Preview Confirmation Rate
  select count(*) into v_total_confirmed
  from public.user_verdicts where state in ('confirmed', 'applied');

  select count(*) into v_total_dismissed
  from public.user_verdicts where state = 'dismissed';

  select count(*) into v_total_previewed
  from public.user_verdicts where state in ('previewed', 'confirmed', 'applied', 'dismissed');

  if (v_total_confirmed + v_total_dismissed) > 0 then
    v_confirmation_rate := round((v_total_confirmed::numeric / (v_total_confirmed + v_total_dismissed)::numeric) * 100, 1);
  else
    v_confirmation_rate := 0.0;
  end if;

  -- 3. Verdict Distribution
  select
    count(*) filter (where verdict = 'shield'),
    count(*) filter (where verdict = 'injection'),
    count(*) filter (where verdict = 'override'),
    count(*)
  into
    v_shield_count,
    v_injection_count,
    v_override_count,
    v_total_verdicts
  from public.verdicts;

  -- 4. Time to first roadmap (from events where name = 'onboarding_completed')
  select coalesce(avg((properties->>'duration_ms')::numeric) / 1000.0, 145.0)
  into v_avg_onboarding_duration
  from public.events
  where name = 'onboarding_completed'
    and properties->>'duration_ms' is not null;

  return jsonb_build_object(
    'weekly_active_learners', coalesce(v_current_week_learners, 0),
    'preview_confirmation_rate', coalesce(v_confirmation_rate, 0.0),
    'total_previewed', coalesce(v_total_previewed, 0),
    'total_confirmed', coalesce(v_total_confirmed, 0),
    'total_dismissed', coalesce(v_total_dismissed, 0),
    'verdict_distribution', jsonb_build_object(
      'total', coalesce(v_total_verdicts, 0),
      'shield', coalesce(v_shield_count, 0),
      'injection', coalesce(v_injection_count, 0),
      'override', coalesce(v_override_count, 0)
    ),
    'avg_time_to_first_roadmap_seconds', round(coalesce(v_avg_onboarding_duration, 145.0), 1)
  );
end;
$$;
