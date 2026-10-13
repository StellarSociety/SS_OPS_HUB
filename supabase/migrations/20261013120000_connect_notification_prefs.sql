-- Per-person Connecteam alert preferences (which chat / feed events notify).
-- Missing row = everything on. Keys live in jsonb so new options need no migration.
create table if not exists public.connect_notification_prefs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  prefs jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.connect_notification_prefs enable row level security;

drop policy if exists "connect_notification_prefs_own_select" on public.connect_notification_prefs;
create policy "connect_notification_prefs_own_select"
  on public.connect_notification_prefs for select
  using (user_id = auth.uid());

-- Venue-wide Connecteam defaults set by admins (e.g. alert sounds for everyone).
create table if not exists public.connect_venue_settings (
  venue_id uuid primary key references public.venues (id) on delete cascade,
  sound_defaults jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.connect_venue_settings enable row level security;
