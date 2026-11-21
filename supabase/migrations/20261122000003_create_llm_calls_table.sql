-- ==============================================================================
-- LLM Calls Observability Table (PRD Section 9 & Prompt 8)
-- Stores non-sensitive telemetry: prompt name, version, model, tier, latency,
-- token counts, and success/failure. Never stores full user data (PII).
-- ==============================================================================

create table if not exists public.llm_calls (
  id uuid primary key default gen_random_uuid(),
  prompt_name text not null,
  prompt_version text not null,
  model text not null,
  tier text not null check (tier in ('fast', 'strong')),
  latency_ms integer not null,
  prompt_tokens integer,
  completion_tokens integer,
  total_tokens integer,
  success boolean not null default true,
  error text,
  created_at timestamptz not null default now()
);

-- Indexes for performance and dashboard telemetry
create index if not exists idx_llm_calls_prompt_created on public.llm_calls(prompt_name, created_at desc);
create index if not exists idx_llm_calls_model on public.llm_calls(model);
create index if not exists idx_llm_calls_created on public.llm_calls(created_at desc);

-- Row Level Security
alter table public.llm_calls enable row level security;

-- Editors and admins can view LLM metrics
create policy "Editors can view LLM call logs"
  on public.llm_calls
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'editor'
    )
  );

-- Service role has full access
create policy "Service role has full access to llm_calls"
  on public.llm_calls
  for all
  to service_role
  using (true)
  with check (true);
