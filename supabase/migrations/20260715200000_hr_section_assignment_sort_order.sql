-- Allow stable ordering of staff within a weekly schedule section.

ALTER TABLE public.hr_schedule_section_assignments
  ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;

-- Backfill existing rows: stable order per section by created_at.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY section_id
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.hr_schedule_section_assignments
)
UPDATE public.hr_schedule_section_assignments AS a
SET sort_order = ranked.rn
FROM ranked
WHERE a.id = ranked.id;

CREATE INDEX IF NOT EXISTS hr_schedule_section_assignments_section_sort_idx
  ON public.hr_schedule_section_assignments (section_id, sort_order);
