-- ==============================================================================
-- Migration: 20261119000001_initial_schema.sql
-- Description: Implement full data model (PRD Section 7), app_role, RLS, and invariants
-- ==============================================================================

-- Extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ==============================================================================
-- 1. UTILITY FUNCTIONS & TRIGGERS
-- ==============================================================================

-- Trigger function to automatically maintain updated_at timestamps
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ==============================================================================
-- 2. DOMAINS TABLE
-- ==============================================================================
-- Domains (one row at launch: 'ai-assisted-software-development')
create table if not exists public.domains (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger tr_domains_updated_at
  before update on public.domains
  for each row
  execute function public.handle_updated_at();

-- ==============================================================================
-- 3. APP ROLES & USER ROLES
-- ==============================================================================
-- Task 4: Create an app_role concept: a user_roles table or JWT claim for role 'editor'.
create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('editor', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, role)
);

create index if not exists idx_user_roles_user_id on public.user_roles(user_id);

create trigger tr_user_roles_updated_at
  before update on public.user_roles
  for each row
  execute function public.handle_updated_at();

-- Task 4: Helper SQL function is_editor()
create or replace function public.is_editor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'editor'
  );
$$;

-- ==============================================================================
-- 4. PROFILES TABLE
-- ==============================================================================
-- Users profiles linked to auth.users
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  domain_id uuid references public.domains(id) on delete set null,
  experience jsonb default '{}'::jsonb, -- {area_slug: 'beginner'|'working'|'expert'}
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_profiles_domain_id on public.profiles(domain_id);

create trigger tr_profiles_updated_at
  before update on public.profiles
  for each row
  execute function public.handle_updated_at();

-- ==============================================================================
-- 5. CANONICAL GRAPH TABLES
-- ==============================================================================

-- PRD Section 7: Canonical nodes
-- INVARIANT: Canonical nodes form the hand-maintained ground truth graph for each domain.
create table if not exists public.canonical_nodes (
  id uuid primary key default gen_random_uuid(),
  domain_id uuid not null references public.domains(id) on delete cascade,
  slug text not null unique,
  name text not null,
  description text,
  node_type text not null check (node_type in ('skill', 'tool', 'workflow')),
  level integer not null default 0 check (level >= 0), -- topological layer hint (0 = foundation)
  status text not null default 'approved' check (status in ('draft', 'approved', 'deprecated')),
  external_url text,
  version_tag text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_canonical_nodes_domain_id on public.canonical_nodes(domain_id);
create index if not exists idx_canonical_nodes_status on public.canonical_nodes(status);
create index if not exists idx_canonical_nodes_slug on public.canonical_nodes(slug);

create trigger tr_canonical_nodes_updated_at
  before update on public.canonical_nodes
  for each row
  execute function public.handle_updated_at();

-- PRD Section 7: Canonical edges (prerequisite: from_node must come before to_node)
-- INVARIANT: The canonical graph is acyclic. Self-loops are strictly disallowed.
create table if not exists public.canonical_edges (
  id uuid primary key default gen_random_uuid(),
  from_node uuid not null references public.canonical_nodes(id) on delete cascade,
  to_node uuid not null references public.canonical_nodes(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (from_node, to_node),
  check (from_node <> to_node)
);

create index if not exists idx_canonical_edges_from_node on public.canonical_edges(from_node);
create index if not exists idx_canonical_edges_to_node on public.canonical_edges(to_node);

create trigger tr_canonical_edges_updated_at
  before update on public.canonical_edges
  for each row
  execute function public.handle_updated_at();

-- PRD Section 7: Node supersedes (new_node makes old_node obsolete)
create table if not exists public.node_supersedes (
  id uuid primary key default gen_random_uuid(),
  old_node uuid not null references public.canonical_nodes(id) on delete cascade,
  new_node uuid not null references public.canonical_nodes(id) on delete cascade,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (old_node, new_node),
  check (old_node <> new_node)
);

create index if not exists idx_node_supersedes_old_node on public.node_supersedes(old_node);
create index if not exists idx_node_supersedes_new_node on public.node_supersedes(new_node);

create trigger tr_node_supersedes_updated_at
  before update on public.node_supersedes
  for each row
  execute function public.handle_updated_at();

-- ==============================================================================
-- 6. USER ROADMAP (USER_NODES)
-- ==============================================================================

-- PRD Section 7: user_nodes
-- INVARIANT 1: Only 'approved' canonical nodes may appear in a user roadmap.
-- INVARIANT 2: user_nodes of status 'completed' or 'archived' are never hard-deleted.
create table if not exists public.user_nodes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  node_id uuid not null references public.canonical_nodes(id) on delete cascade,
  status text not null check (status in ('known', 'todo', 'in_progress', 'completed', 'archived')),
  origin text not null default 'baseline' check (origin in ('baseline', 'injection', 'override')),
  fast_track boolean not null default false,
  replaced_node_id uuid references public.canonical_nodes(id) on delete set null,
  completed_at timestamptz,
  version integer not null default 1, -- optimistic concurrency / sync
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, node_id)
);

create index if not exists idx_user_nodes_user_id on public.user_nodes(user_id);
create index if not exists idx_user_nodes_node_id on public.user_nodes(node_id);
create index if not exists idx_user_nodes_status on public.user_nodes(status);

create trigger tr_user_nodes_updated_at
  before update on public.user_nodes
  for each row
  execute function public.handle_updated_at();

-- Trigger enforcing: Only 'approved' canonical nodes may appear in a user roadmap
create or replace function public.enforce_approved_canonical_node()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from public.canonical_nodes
    where id = new.node_id and status = 'approved'
  ) then
    raise exception 'Invariant violated: Only approved canonical nodes may appear in a user roadmap (node_id: %)', new.node_id;
  end if;
  return new;
end;
$$;

create trigger tr_user_nodes_approved_canonical
  before insert or update of node_id on public.user_nodes
  for each row
  execute function public.enforce_approved_canonical_node();

-- Trigger enforcing: user_nodes of status 'completed' or 'archived' are never hard-deleted
-- except through the safe account-deletion path.
create or replace function public.prevent_user_nodes_hard_delete()
returns trigger
language plpgsql
as $$
declare
  is_account_deletion text;
begin
  is_account_deletion := current_setting('app.allow_account_deletion', true);

  if is_account_deletion is distinct from 'true' then
    if old.status in ('completed', 'archived') then
      raise exception 'Invariant violated: user_nodes with status completed or archived cannot be hard-deleted. Use status archiving or account deletion.';
    end if;
  end if;

  return old;
end;
$$;

create trigger tr_prevent_user_nodes_hard_delete
  before delete on public.user_nodes
  for each row
  execute function public.prevent_user_nodes_hard_delete();

-- Task 3: Documented SQL function for account deletion that cascades safely
/**
 * Safe account deletion procedure (PRD Section 14).
 * Cascades delete of all user-owned data while allowing completed/archived user_nodes
 * to be removed through a transaction-local setting.
 */
create or replace function public.delete_user_account(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Check permission: caller must be target user or an editor or service_role
  if auth.uid() <> target_user_id and not public.is_editor() and auth.role() <> 'service_role' then
    raise exception 'Permission denied: Cannot delete account for another user.';
  end if;

  -- Set transaction-local flag allowing hard delete of completed/archived user_nodes
  perform set_config('app.allow_account_deletion', 'true', true);

  -- Safe cascade deletions
  delete from public.events where user_id = target_user_id;
  delete from public.usage_counters where user_id = target_user_id;
  delete from public.user_verdicts where user_id = target_user_id;
  delete from public.user_nodes where user_id = target_user_id;
  delete from public.user_roles where user_id = target_user_id;
  delete from public.profiles where id = target_user_id;

  -- If executed with elevated privileges, also remove auth record
  if auth.role() = 'service_role' or public.is_editor() then
    delete from auth.users where id = target_user_id;
  end if;
end;
$$;

-- ==============================================================================
-- 7. NEWS PIPELINE TABLES
-- ==============================================================================

-- PRD Section 7: news_sources
create table if not exists public.news_sources (
  id uuid primary key default gen_random_uuid(),
  domain_id uuid not null references public.domains(id) on delete cascade,
  name text not null,
  url text not null,
  kind text not null check (kind in ('rss', 'github_releases', 'api', 'newsletter')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_news_sources_domain_id on public.news_sources(domain_id);

create trigger tr_news_sources_updated_at
  before update on public.news_sources
  for each row
  execute function public.handle_updated_at();

-- PRD Section 7: news_items
-- INVARIANT: bullets always has exactly 3 non-empty strings.
create table if not exists public.news_items (
  id uuid primary key default gen_random_uuid(),
  domain_id uuid not null references public.domains(id) on delete cascade,
  source_id uuid references public.news_sources(id) on delete set null,
  url text not null unique,
  title text not null,
  published_at timestamptz,
  raw_text text,
  content_hash text not null unique,
  bullets jsonb not null check (
    jsonb_typeof(bullets) = 'array'
    and jsonb_array_length(bullets) = 3
    and (bullets->>0) is not null and trim(bullets->>0) <> ''
    and (bullets->>1) is not null and trim(bullets->>1) <> ''
    and (bullets->>2) is not null and trim(bullets->>2) <> ''
  ),
  impact_score integer not null check (impact_score between 1 and 10),
  impact_rationale text,
  tags text[] default '{}'::text[],
  mapped_node_ids uuid[] default '{}'::uuid[],
  proposed_new_tool jsonb, -- {name, category, supersedes_slugs[]}
  status text not null default 'ingested' check (status in ('ingested', 'processed', 'published', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_news_items_domain_id on public.news_items(domain_id);
create index if not exists idx_news_items_source_id on public.news_items(source_id);
create index if not exists idx_news_items_url on public.news_items(url);
create index if not exists idx_news_items_content_hash on public.news_items(content_hash);
create index if not exists idx_news_items_status_published on public.news_items(status, published_at desc);

create trigger tr_news_items_updated_at
  before update on public.news_items
  for each row
  execute function public.handle_updated_at();

-- ==============================================================================
-- 8. VERDICTS ENGINE TABLES
-- ==============================================================================

-- PRD Section 7: verdicts (cache + per-user result)
create table if not exists public.verdicts (
  id uuid primary key default gen_random_uuid(),
  news_item_id uuid not null references public.news_items(id) on delete cascade,
  cache_key text not null, -- hash(news_item_id + sorted relevant node ids + experience bucket)
  verdict text not null check (verdict in ('shield', 'injection', 'override')),
  target_node_id uuid references public.canonical_nodes(id) on delete set null,
  new_node_id uuid references public.canonical_nodes(id) on delete set null,
  insert_after_node_ids uuid[] default '{}'::uuid[],
  reasoning text,
  confidence numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (news_item_id, cache_key)
);

create index if not exists idx_verdicts_news_item_id on public.verdicts(news_item_id);
create index if not exists idx_verdicts_cache_key on public.verdicts(cache_key);

create trigger tr_verdicts_updated_at
  before update on public.verdicts
  for each row
  execute function public.handle_updated_at();

-- PRD Section 7: user_verdicts
create table if not exists public.user_verdicts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  news_item_id uuid not null references public.news_items(id) on delete cascade,
  verdict_id uuid not null references public.verdicts(id) on delete cascade,
  state text not null check (state in ('precomputed', 'previewed', 'confirmed', 'dismissed', 'applied', 'failed')),
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_verdicts_user_id on public.user_verdicts(user_id);
create index if not exists idx_user_verdicts_news_item_id on public.user_verdicts(news_item_id);
create index if not exists idx_user_verdicts_verdict_id on public.user_verdicts(verdict_id);

create trigger tr_user_verdicts_updated_at
  before update on public.user_verdicts
  for each row
  execute function public.handle_updated_at();

-- ==============================================================================
-- 9. GUIDES TABLE
-- ==============================================================================

-- PRD Section 7: guides (auto-generated 20-minute quickstart guide)
create table if not exists public.guides (
  id uuid primary key default gen_random_uuid(),
  node_id uuid not null unique references public.canonical_nodes(id) on delete cascade,
  markdown text not null,
  source_urls text[] default '{}'::text[],
  last_verified_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'approved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_guides_node_id on public.guides(node_id);
create index if not exists idx_guides_status on public.guides(status);

create trigger tr_guides_updated_at
  before update on public.guides
  for each row
  execute function public.handle_updated_at();

-- ==============================================================================
-- 10. EDITORIAL QUEUE TABLE
-- ==============================================================================

-- PRD Section 7: proposed_graph_changes
create table if not exists public.proposed_graph_changes (
  id uuid primary key default gen_random_uuid(),
  news_item_id uuid references public.news_items(id) on delete set null,
  change_type text not null check (change_type in ('add_node', 'add_edge', 'add_supersedes', 'deprecate_node')),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_proposed_graph_changes_news_item_id on public.proposed_graph_changes(news_item_id);
create index if not exists idx_proposed_graph_changes_status on public.proposed_graph_changes(status);

create trigger tr_proposed_graph_changes_updated_at
  before update on public.proposed_graph_changes
  for each row
  execute function public.handle_updated_at();

-- ==============================================================================
-- 11. MONETIZATION (SPONSORED PLACEMENTS)
-- ==============================================================================

-- PRD Section 7: sponsored_placements
-- INVARIANT: Sponsored placements have no foreign key to news_items, verdicts or nodes (structural separation).
create table if not exists public.sponsored_placements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  cta_url text not null,
  sponsor_name text not null,
  domain_id uuid not null references public.domains(id) on delete cascade,
  active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_sponsored_placements_domain_id on public.sponsored_placements(domain_id);
create index if not exists idx_sponsored_placements_active on public.sponsored_placements(active);

create trigger tr_sponsored_placements_updated_at
  before update on public.sponsored_placements
  for each row
  execute function public.handle_updated_at();

-- ==============================================================================
-- 12. LIMITS & ANALYTICS TABLES
-- ==============================================================================

-- PRD Section 7: usage_counters
create table if not exists public.usage_counters (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null default current_date,
  on_demand_analyses integer not null default 0 check (on_demand_analyses >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

create index if not exists idx_usage_counters_user_id on public.usage_counters(user_id);

create trigger tr_usage_counters_updated_at
  before update on public.usage_counters
  for each row
  execute function public.handle_updated_at();

-- PRD Section 7: events
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_events_user_id on public.events(user_id);
create index if not exists idx_events_created_at on public.events(created_at desc);

-- ==============================================================================
-- 13. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

-- Enable RLS on every table
alter table public.domains enable row level security;
alter table public.user_roles enable row level security;
alter table public.profiles enable row level security;
alter table public.canonical_nodes enable row level security;
alter table public.canonical_edges enable row level security;
alter table public.node_supersedes enable row level security;
alter table public.user_nodes enable row level security;
alter table public.news_sources enable row level security;
alter table public.news_items enable row level security;
alter table public.verdicts enable row level security;
alter table public.user_verdicts enable row level security;
alter table public.guides enable row level security;
alter table public.proposed_graph_changes enable row level security;
alter table public.sponsored_placements enable row level security;
alter table public.usage_counters enable row level security;
alter table public.events enable row level security;

-- ------------------------------------------------------------------------------
-- 13.1 Domains Policies
-- Authenticated users can read domains. Only editors can write.
-- ------------------------------------------------------------------------------
create policy "Authenticated users can view domains"
  on public.domains for select
  to authenticated
  using (true);

create policy "Editors can insert domains"
  on public.domains for insert
  to authenticated
  with check (public.is_editor());

create policy "Editors can update domains"
  on public.domains for update
  to authenticated
  using (public.is_editor())
  with check (public.is_editor());

create policy "Editors can delete domains"
  on public.domains for delete
  to authenticated
  using (public.is_editor());

-- ------------------------------------------------------------------------------
-- 13.2 User Roles Policies
-- Users can see their own roles; editors can manage roles.
-- ------------------------------------------------------------------------------
create policy "Users and editors can view user_roles"
  on public.user_roles for select
  to authenticated
  using (auth.uid() = user_id or public.is_editor());

create policy "Editors can insert user_roles"
  on public.user_roles for insert
  to authenticated
  with check (public.is_editor());

create policy "Editors can update user_roles"
  on public.user_roles for update
  to authenticated
  using (public.is_editor())
  with check (public.is_editor());

create policy "Editors can delete user_roles"
  on public.user_roles for delete
  to authenticated
  using (public.is_editor());

-- ------------------------------------------------------------------------------
-- 13.3 Profiles Policies
-- Users can read/write only their own profile. Editors can read profiles.
-- ------------------------------------------------------------------------------
create policy "Users can view own profile or editors view all"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id or public.is_editor());

create policy "Users can insert own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "Users or editors can delete own profile"
  on public.profiles for delete
  to authenticated
  using (auth.uid() = id or public.is_editor());

-- ------------------------------------------------------------------------------
-- 13.4 Canonical Nodes Policies
-- All authenticated users can read approved nodes. Editors can read/write all.
-- ------------------------------------------------------------------------------
create policy "Authenticated users can read approved canonical nodes"
  on public.canonical_nodes for select
  to authenticated
  using (status = 'approved' or public.is_editor());

create policy "Only editors can insert canonical nodes"
  on public.canonical_nodes for insert
  to authenticated
  with check (public.is_editor());

create policy "Only editors can update canonical nodes"
  on public.canonical_nodes for update
  to authenticated
  using (public.is_editor())
  with check (public.is_editor());

create policy "Only editors can delete canonical nodes"
  on public.canonical_nodes for delete
  to authenticated
  using (public.is_editor());

-- ------------------------------------------------------------------------------
-- 13.5 Canonical Edges Policies
-- All authenticated users can read canonical edges. Only editors can write.
-- ------------------------------------------------------------------------------
create policy "Authenticated users can read canonical edges"
  on public.canonical_edges for select
  to authenticated
  using (true);

create policy "Only editors can insert canonical edges"
  on public.canonical_edges for insert
  to authenticated
  with check (public.is_editor());

create policy "Only editors can update canonical edges"
  on public.canonical_edges for update
  to authenticated
  using (public.is_editor())
  with check (public.is_editor());

create policy "Only editors can delete canonical edges"
  on public.canonical_edges for delete
  to authenticated
  using (public.is_editor());

-- ------------------------------------------------------------------------------
-- 13.6 Node Supersedes Policies
-- All authenticated users can read node_supersedes. Only editors can write.
-- ------------------------------------------------------------------------------
create policy "Authenticated users can read node_supersedes"
  on public.node_supersedes for select
  to authenticated
  using (true);

create policy "Only editors can insert node_supersedes"
  on public.node_supersedes for insert
  to authenticated
  with check (public.is_editor());

create policy "Only editors can update node_supersedes"
  on public.node_supersedes for update
  to authenticated
  using (public.is_editor())
  with check (public.is_editor());

create policy "Only editors can delete node_supersedes"
  on public.node_supersedes for delete
  to authenticated
  using (public.is_editor());

-- ------------------------------------------------------------------------------
-- 13.7 User Nodes Policies
-- Users can read/write ONLY their own roadmap nodes.
-- ------------------------------------------------------------------------------
create policy "Users can view own user_nodes"
  on public.user_nodes for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert own user_nodes"
  on public.user_nodes for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own user_nodes"
  on public.user_nodes for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own user_nodes"
  on public.user_nodes for delete
  to authenticated
  using (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- 13.8 News Sources Policies
-- Only editors can view and manage news sources.
-- ------------------------------------------------------------------------------
create policy "Only editors can view news sources"
  on public.news_sources for select
  to authenticated
  using (public.is_editor());

create policy "Only editors can insert news sources"
  on public.news_sources for insert
  to authenticated
  with check (public.is_editor());

create policy "Only editors can update news sources"
  on public.news_sources for update
  to authenticated
  using (public.is_editor())
  with check (public.is_editor());

create policy "Only editors can delete news sources"
  on public.news_sources for delete
  to authenticated
  using (public.is_editor());

-- ------------------------------------------------------------------------------
-- 13.9 News Items Policies
-- Authenticated users can read published items. Editors can read all.
-- Written only by service role (Edge Functions) / editors.
-- ------------------------------------------------------------------------------
create policy "Authenticated users can read published news items"
  on public.news_items for select
  to authenticated
  using (status = 'published' or public.is_editor());

create policy "Only editors or service role can modify news items"
  on public.news_items for update
  to authenticated
  using (public.is_editor())
  with check (public.is_editor());

-- ------------------------------------------------------------------------------
-- 13.10 Verdicts Policies
-- Authenticated users can read cached verdicts.
-- Written only by service role (Edge Functions).
-- ------------------------------------------------------------------------------
create policy "Authenticated users can read verdicts"
  on public.verdicts for select
  to authenticated
  using (true);

-- ------------------------------------------------------------------------------
-- 13.11 User Verdicts Policies
-- Users can read/write only their own user_verdicts.
-- ------------------------------------------------------------------------------
create policy "Users can view own user_verdicts"
  on public.user_verdicts for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert own user_verdicts"
  on public.user_verdicts for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own user_verdicts"
  on public.user_verdicts for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own user_verdicts"
  on public.user_verdicts for delete
  to authenticated
  using (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- 13.12 Guides Policies
-- All authenticated users can read approved guides. Editors can read/write all.
-- ------------------------------------------------------------------------------
create policy "Authenticated users can read approved guides"
  on public.guides for select
  to authenticated
  using (status = 'approved' or public.is_editor());

create policy "Only editors can insert guides"
  on public.guides for insert
  to authenticated
  with check (public.is_editor());

create policy "Only editors can update guides"
  on public.guides for update
  to authenticated
  using (public.is_editor())
  with check (public.is_editor());

create policy "Only editors can delete guides"
  on public.guides for delete
  to authenticated
  using (public.is_editor());

-- ------------------------------------------------------------------------------
-- 13.13 Proposed Graph Changes Policies
-- Only editors can view and manage proposed graph changes queue.
-- ------------------------------------------------------------------------------
create policy "Only editors can view proposed graph changes"
  on public.proposed_graph_changes for select
  to authenticated
  using (public.is_editor());

create policy "Only editors can insert proposed graph changes"
  on public.proposed_graph_changes for insert
  to authenticated
  with check (public.is_editor());

create policy "Only editors can update proposed graph changes"
  on public.proposed_graph_changes for update
  to authenticated
  using (public.is_editor())
  with check (public.is_editor());

create policy "Only editors can delete proposed graph changes"
  on public.proposed_graph_changes for delete
  to authenticated
  using (public.is_editor());

-- ------------------------------------------------------------------------------
-- 13.14 Sponsored Placements Policies
-- Authenticated users can read active sponsored placements within valid dates.
-- Only editors can write.
-- ------------------------------------------------------------------------------
create policy "Authenticated users can read active sponsored placements"
  on public.sponsored_placements for select
  to authenticated
  using (
    (
      active = true
      and (starts_at is null or starts_at <= now())
      and (ends_at is null or ends_at >= now())
    )
    or public.is_editor()
  );

create policy "Only editors can insert sponsored placements"
  on public.sponsored_placements for insert
  to authenticated
  with check (public.is_editor());

create policy "Only editors can update sponsored placements"
  on public.sponsored_placements for update
  to authenticated
  using (public.is_editor())
  with check (public.is_editor());

create policy "Only editors can delete sponsored placements"
  on public.sponsored_placements for delete
  to authenticated
  using (public.is_editor());

-- ------------------------------------------------------------------------------
-- 13.15 Usage Counters Policies
-- Users can read and update only their own usage counters.
-- ------------------------------------------------------------------------------
create policy "Users can view own usage counters"
  on public.usage_counters for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert own usage counters"
  on public.usage_counters for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own usage counters"
  on public.usage_counters for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- 13.16 Events Policies
-- Users can view and insert only their own analytics events.
-- ------------------------------------------------------------------------------
create policy "Users can view own events"
  on public.events for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert own events"
  on public.events for insert
  to authenticated
  with check (auth.uid() = user_id);

-- ==============================================================================
-- 14. SUPABASE REALTIME PUBLICATION
-- ==============================================================================
-- Task 6: Enable Supabase Realtime publication on user_nodes, profiles and user_verdicts.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.user_nodes;
    alter publication supabase_realtime add table public.profiles;
    alter publication supabase_realtime add table public.user_verdicts;
  end if;
end $$;
