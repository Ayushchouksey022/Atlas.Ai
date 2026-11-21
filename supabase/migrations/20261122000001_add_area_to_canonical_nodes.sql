-- Migration: add area to canonical_nodes for onboarding and domain filtering
-- PRD Section 7, 8, 11.1 & Prompt 3

alter table public.canonical_nodes
  add column if not exists area text;

create index if not exists idx_canonical_nodes_area on public.canonical_nodes(area);

comment on column public.canonical_nodes.area is 'Area grouping for onboarding structured picker (e.g., editors-ides, ai-assistants, languages-frameworks, testing, deployment, agents-automation)';
