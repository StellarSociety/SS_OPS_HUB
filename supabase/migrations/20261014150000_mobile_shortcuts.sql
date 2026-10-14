-- Phone shortcuts (welcome-screen tiles that open one screen, e.g. Hiring Forms).
-- Per venue: is the shortcut shown on the phone at all. Missing row = shown.
-- Per person: access lives in mobile_app_access under the shortcut key
-- (e.g. 'shortcut_hiring'), like every other phone app.
create table if not exists public.mobile_shortcut_settings (
  venue_id uuid not null references public.venues (id) on delete cascade,
  shortcut_key text not null,
  visible boolean not null default true,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (venue_id, shortcut_key)
);

alter table public.mobile_shortcut_settings enable row level security;

drop policy if exists "mobile_shortcut_settings_select" on public.mobile_shortcut_settings;
create policy "mobile_shortcut_settings_select"
  on public.mobile_shortcut_settings for select
  to authenticated
  using (true);

-- Hiring Forms used to follow web Hiring / Staff grants (and Global Admin).
-- Keep it for everyone who had it, now as a phone switch of its own.
insert into public.mobile_app_access (user_id, venue_id, app_key, level, updated_at)
select distinct on (phone.user_id, phone.venue_id)
  phone.user_id,
  phone.venue_id,
  'shortcut_hiring',
  case
    when exists (
      select 1 from public.user_permissions p
      where p.user_id = phone.user_id
        and (
          (p.module_key = 'app' and p.feature_key in ('global', 'admin') and p.access_level = 'admin')
          or (
            p.module_key = 'hr'
            and p.feature_key in ('hiring', 'staff')
            and p.access_level in ('edit', 'admin')
            and (p.venue_id is null or p.venue_id = phone.venue_id)
          )
        )
    ) then 'editor'
    else 'viewer'
  end,
  now()
from public.mobile_app_access phone
where phone.app_key = 'mobile_app'
  and phone.level in ('viewer', 'editor')
  and (
    exists (
      select 1 from public.user_permissions p
      where p.user_id = phone.user_id
        and (
          (p.module_key = 'app' and p.feature_key in ('global', 'admin') and p.access_level = 'admin')
          or (
            p.module_key = 'hr'
            and p.feature_key in ('hiring', 'staff')
            and p.access_level in ('view', 'edit', 'admin')
            and (p.venue_id is null or p.venue_id = phone.venue_id)
          )
        )
    )
    or exists (
      select 1 from public.mobile_app_access hr
      where hr.user_id = phone.user_id
        and hr.venue_id = phone.venue_id
        and hr.app_key = 'hr'
        and hr.level in ('viewer', 'editor')
    )
  )
on conflict (user_id, venue_id, app_key) do nothing;
