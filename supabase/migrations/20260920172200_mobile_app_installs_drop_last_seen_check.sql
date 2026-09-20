-- Client clocks can be slightly behind Postgres now(), which made the first
-- heartbeat fail the last_seen >= first_seen check. Timestamps are set together
-- in the upsert instead.
ALTER TABLE public.mobile_app_installs
  DROP CONSTRAINT IF EXISTS mobile_app_installs_last_seen_after_first;
