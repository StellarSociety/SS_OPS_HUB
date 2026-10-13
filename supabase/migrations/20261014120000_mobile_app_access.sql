-- Phone (mobile app) access, separate from web app access.
-- One row per person, venue and phone app. Missing row = no access.
--   app_key 'mobile_app'           -> can use the mobile app at all (level 'viewer' = on)
--   app_key 'mobile_employee_hub'  -> Personal Employee Hub; `pages` lists the hub pages
--   any other app_key              -> a welcome-screen app (sales, sentiment, directory, ...)
-- Written only by the server (service role); people can read their own rows.
create table if not exists public.mobile_app_access (
  user_id uuid not null references auth.users (id) on delete cascade,
  venue_id uuid not null references public.venues (id) on delete cascade,
  app_key text not null,
  level text not null default 'none'
    check (level in ('hidden', 'none', 'viewer', 'editor')),
  pages text[],
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (user_id, venue_id, app_key)
);

create index if not exists mobile_app_access_venue_idx
  on public.mobile_app_access (venue_id);

alter table public.mobile_app_access enable row level security;

drop policy if exists "mobile_app_access_own_select" on public.mobile_app_access;
create policy "mobile_app_access_own_select"
  on public.mobile_app_access for select
  using (user_id = auth.uid());
