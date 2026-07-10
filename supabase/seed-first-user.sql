-- SS Ops Hub — grant an existing auth user Global (superadmin) access.
-- Prereq: migrations applied and the user exists in Supabase Auth.
--
-- Usage: replace the email below, run in the Supabase SQL editor (or pnpm db:seed-admin).

-- 1. Backfill the profile row (safe if the user was created before the
--    handle_new_user trigger existed).
insert into public.profiles (id, email)
select id, email
from auth.users
where email = 'admin@orillarestaurant.com'
on conflict (id) do nothing;

-- 2. Group staff record for the superadmin (home = Global).
insert into public.staff (
  home_venue_id,
  emp_no,
  full_name,
  work_email,
  employment_status_id
)
select
  v.id,
  'GRP0001',
  coalesce(p.full_name, 'Super Admin'),
  u.email,
  (select id from public.employment_statuses where name = 'ON Board' limit 1)
from auth.users u
join public.profiles p on p.id = u.id
cross join public.venues v
where u.email = 'admin@orillarestaurant.com'
  and v.is_global
on conflict (home_venue_id, emp_no) do update set
  full_name = excluded.full_name,
  work_email = excluded.work_email;

-- 3. Link profile to group staff.
update public.profiles p
set staff_id = s.id
from auth.users u
join public.staff s on s.work_email = u.email
join public.venues v on v.id = s.home_venue_id and v.is_global
where p.id = u.id
  and u.email = 'admin@orillarestaurant.com'
  and p.staff_id is null;

-- 4. Grant app-wide Global admin (superadmin).
insert into public.user_permissions (user_id, module_key, feature_key, access_level)
select id, 'app', 'global', 'admin'
from auth.users
where email = 'admin@orillarestaurant.com'
on conflict (user_id, venue_id, module_key, feature_key) do nothing;

-- 5. Grant HR module access (group-wide + Orilla venue).
insert into public.user_permissions (user_id, venue_id, module_key, feature_key, access_level)
select u.id, null, 'hr', f.feature_key, 'admin'
from auth.users u
cross join (values ('staff'), ('lookups'), ('salary')) as f(feature_key)
where u.email = 'admin@orillarestaurant.com'
on conflict (user_id, venue_id, module_key, feature_key) do nothing;

insert into public.user_permissions (user_id, venue_id, module_key, feature_key, access_level)
select u.id, v.id, 'hr', f.feature_key, 'admin'
from auth.users u
cross join public.venues v
cross join (values ('staff'), ('lookups'), ('salary')) as f(feature_key)
where u.email = 'admin@orillarestaurant.com'
  and v.slug = 'orilla'
on conflict (user_id, venue_id, module_key, feature_key) do nothing;

-- 6. Verify.
select u.email, p.status, p.staff_id, s.emp_no, up.module_key, up.feature_key, up.access_level
from auth.users u
left join public.profiles p on p.id = u.id
left join public.staff s on s.id = p.staff_id
left join public.user_permissions up on up.user_id = u.id
where u.email = 'admin@orillarestaurant.com';
