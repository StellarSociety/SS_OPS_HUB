-- SS Ops Hub — Daily sales tobacco + waiter sort order

ALTER TABLE public.venue_daily_sales
  ADD COLUMN IF NOT EXISTS lunch_tobacco_gs NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dinner_tobacco_gs NUMERIC(14, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.venue_waiters
  ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;

WITH numbered AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY venue_id ORDER BY name) - 1 AS rn
  FROM public.venue_waiters
)
UPDATE public.venue_waiters w
SET sort_order = numbered.rn
FROM numbered
WHERE w.id = numbered.id;
