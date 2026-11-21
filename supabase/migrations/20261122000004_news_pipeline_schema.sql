-- ==============================================================================
-- 20261122000004_news_pipeline_schema.sql
-- News pipeline enhancements:
-- 1. Allow nullable bullets/impact_score for 'ingested' status while strictly
--    enforcing PRD invariant (exactly 3 non-empty bullets and score 1-10) for 'published'.
-- 2. Add error_record column to track ingest/processing failures.
-- 3. Seed 6 inactive placeholder news_sources for AI-assisted software development.
-- 4. Setup pg_cron trigger every 20 minutes (if pg_cron extension is present).
-- ==============================================================================

-- 1. Relax NOT NULL on bullets and impact_score to permit initial raw ingestion
alter table public.news_items alter column bullets drop not null;
alter table public.news_items alter column impact_score drop not null;

-- Drop inline generated check constraints if present
alter table public.news_items drop constraint if exists news_items_bullets_check;
alter table public.news_items drop constraint if exists news_items_impact_score_check;

-- Enforce PRD invariant: when published or processed, bullets must have exactly 3 non-empty strings
alter table public.news_items add constraint news_items_published_bullets_check
  check (
    status in ('ingested', 'rejected')
    or (
      bullets is not null
      and jsonb_typeof(bullets) = 'array'
      and jsonb_array_length(bullets) = 3
      and (bullets->>0) is not null and trim(bullets->>0) <> ''
      and (bullets->>1) is not null and trim(bullets->>1) <> ''
      and (bullets->>2) is not null and trim(bullets->>2) <> ''
    )
  );

-- Enforce PRD invariant: when published or processed, impact_score must be between 1 and 10
alter table public.news_items add constraint news_items_published_impact_score_check
  check (
    status in ('ingested', 'rejected')
    or (
      impact_score is not null
      and impact_score between 1 and 10
    )
  );

-- 2. Add error_record column for editorial queue and pipeline error diagnosis
alter table public.news_items add column if not exists error_record text;

-- 3. Seed 6 DRAFT/inactive placeholders for AI-assisted software development
do $$
declare
  v_domain_id uuid;
begin
  select id into v_domain_id from public.domains where slug = 'ai-assisted-software-development' limit 1;
  if v_domain_id is null then
    insert into public.domains (slug, name, description)
    values (
      'ai-assisted-software-development',
      'AI-Assisted Software Development',
      'Official knowledge domain for AI-assisted software engineering tools, workflows, and skills.'
    )
    returning id into v_domain_id;
  end if;

  -- Seed 6 inactive placeholders (active = false)
  insert into public.news_sources (domain_id, name, url, kind, active)
  values
    (v_domain_id, 'Anthropic Research & Engineering (Placeholder)', 'https://news.example.com/rss/anthropic-placeholder.xml', 'rss', false),
    (v_domain_id, 'OpenAI Developer Announcements (Placeholder)', 'https://news.example.com/rss/openai-placeholder.xml', 'rss', false),
    (v_domain_id, 'GitHub Copilot Changelog (Placeholder)', 'https://news.example.com/rss/github-copilot-placeholder.xml', 'rss', false),
    (v_domain_id, 'VS Code Release Notes (Placeholder)', 'https://news.example.com/rss/vscode-placeholder.xml', 'rss', false),
    (v_domain_id, 'Cursor Editor Releases (Placeholder)', 'https://api.github.com/repos/getcursor/cursor/releases', 'github_releases', false),
    (v_domain_id, 'LangChain Releases (Placeholder)', 'https://api.github.com/repos/langchain-ai/langchain/releases', 'github_releases', false)
  on conflict do nothing;
end $$;

-- 4. Setup pg_cron schedule every 20 minutes (if pg_cron extension is installed)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('ingest-news-every-20m');
    perform cron.schedule(
      'ingest-news-every-20m',
      '*/20 * * * *',
      $cron$
      select net.http_post(
        url := coalesce(current_setting('app.settings.supabase_url', true), 'http://127.0.0.1:54321') || '/functions/v1/ingest-news',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || coalesce(current_setting('app.settings.service_role_key', true), '')
        ),
        body := '{}'::jsonb
      ) as request_id;
      $cron$
    );
  end if;
exception when others then
  -- In development or minimal environments without pg_cron, silently continue
  null;
end $$;
