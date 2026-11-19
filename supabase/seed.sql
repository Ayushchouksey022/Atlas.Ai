-- ==============================================================================
-- Supabase Database Seed File
-- PRD Section 2 & Appendix A: Launch domain
-- ==============================================================================

insert into public.domains (id, slug, name)
values (
  '00000000-0000-0000-0000-000000000001',
  'ai-assisted-software-development',
  'AI-Assisted Software Development'
)
on conflict (slug) do update set name = excluded.name;
