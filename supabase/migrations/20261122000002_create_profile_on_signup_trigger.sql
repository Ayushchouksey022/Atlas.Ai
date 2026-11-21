-- Migration: Auto-create public.profiles record when auth.users is created
-- PRD Section 7 & Prompt 4 (Record choice in /docs/decisions.md)

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  default_domain_id uuid;
begin
  -- Resolve launch domain if available
  select id into default_domain_id
  from public.domains
  where slug = 'ai-assisted-software-development'
  limit 1;

  insert into public.profiles (id, display_name, domain_id, onboarding_completed)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1),
      'User'
    ),
    default_domain_id,
    false
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Attach trigger to auth.users (guarded for environments where auth schema exists)
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'auth' and table_name = 'users'
  ) then
    drop trigger if exists on_auth_user_created on auth.users;
    create trigger on_auth_user_created
      after insert on auth.users
      for each row execute function public.handle_new_user();
  end if;
end;
$$;
