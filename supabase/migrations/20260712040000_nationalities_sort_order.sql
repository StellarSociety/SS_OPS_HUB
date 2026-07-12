-- Add sort_order to nationalities so the HR settings lookup can be reordered
-- via drag-and-drop, matching departments/positions/employment_statuses.
ALTER TABLE public.nationalities
  ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;

-- Backfill a stable initial order from the existing alphabetical listing.
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY name) AS rn
  FROM public.nationalities
)
UPDATE public.nationalities AS n
SET sort_order = numbered.rn
FROM numbered
WHERE n.id = numbered.id;

CREATE INDEX IF NOT EXISTS nationalities_sort_order_idx
  ON public.nationalities (sort_order, name);
