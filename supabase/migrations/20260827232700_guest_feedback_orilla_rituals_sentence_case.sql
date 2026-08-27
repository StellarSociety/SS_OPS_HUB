-- Guest page promotions title: first letter only.

UPDATE public.guest_feedback_settings s
SET promotions_heading = 'Orilla rituals'
FROM public.venues v
WHERE s.venue_id = v.id
  AND v.slug = 'orilla';
