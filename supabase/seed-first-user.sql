-- SS Ops Hub — grant an existing auth user Global (superadmin) access.
-- Prereq: the initial migration has been applied and the user already exists
-- in Supabase Auth (Dashboard → Authentication → Users → Add user).
--
-- Usage: replace the email below, run in the Supabase SQL editor.

-- 1. Backfill the profile row (safe if the user was created before the
--    handle_new_user trigger existed).
insert into public.profiles (id, email)
select id, email
from auth.users
where email = 'admin@orillarestaurant.com'
on conflict (id) do nothing;

-- 2. Grant app-wide Global admin (superadmin).
insert into public.user_permissions (user_id, module_key, feature_key, access_level)
select id, 'app', 'global', 'admin'
from auth.users
where email = 'admin@orillarestaurant.com'
on conflict (user_id, venue_id, module_key, feature_key) do nothing;

-- 3. Grant HR module access (group-wide + Orilla venue).
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

-- 4. Verify.
select u.email, p.status, up.module_key, up.feature_key, up.access_level
from auth.users u
left join public.profiles p on p.id = u.id
left join public.user_permissions up on up.user_id = u.id
where u.email = 'admin@orillarestaurant.com';
