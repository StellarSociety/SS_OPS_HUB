-- Editable promotions heading, plus Orilla Rituals wordmark on the guest page.

ALTER TABLE public.guest_feedback_settings
  ADD COLUMN IF NOT EXISTS promotions_heading TEXT NOT NULL DEFAULT 'Current promotions';

ALTER TABLE public.guest_feedback_settings
  ADD COLUMN IF NOT EXISTS promotions_mark_url TEXT;

UPDATE public.guest_feedback_settings s
SET
  promotions_heading = 'ORILLA RITUALS',
  promotions_mark_url = '/venues/orilla-rituals.webp'
FROM public.venues v
WHERE s.venue_id = v.id
  AND v.slug = 'orilla';
