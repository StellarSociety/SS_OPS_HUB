-- Guest page promotions title: first letter only, not all caps.

UPDATE public.guest_feedback_settings s
SET promotions_heading = 'Orilla Rituals'
FROM public.venues v
WHERE s.venue_id = v.id
  AND v.slug = 'orilla'
  AND s.promotions_heading = 'ORILLA RITUALS';
