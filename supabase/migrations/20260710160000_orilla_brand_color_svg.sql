-- Align Orilla venue brand color and logo paths with vector SVG assets.
UPDATE public.venues
SET
  primary_color = '#818a40',
  logo_url = '/venues/orilla-badge.svg'
WHERE slug = 'orilla';
