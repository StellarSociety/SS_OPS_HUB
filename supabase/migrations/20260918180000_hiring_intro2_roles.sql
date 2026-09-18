-- Department and open positions for the second public intro screen.

ALTER TABLE public.hiring_forms
  ADD COLUMN IF NOT EXISTS intro2_department_id UUID
    REFERENCES public.departments (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS intro2_position_ids UUID[] NOT NULL DEFAULT '{}';
