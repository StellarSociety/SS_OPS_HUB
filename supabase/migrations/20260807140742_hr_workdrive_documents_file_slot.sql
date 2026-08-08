-- Track which training-certificate slot a WorkDrive file belongs to
-- (e.g. pic, basic_food_safety, fire_safety, first_aid; ohc uses default).

ALTER TABLE public.hr_staff_workdrive_documents
  ADD COLUMN IF NOT EXISTS file_slot_id TEXT;

CREATE INDEX IF NOT EXISTS hr_staff_workdrive_documents_slot_idx
  ON public.hr_staff_workdrive_documents (venue_id, staff_id, doc_kind, file_slot_id);
