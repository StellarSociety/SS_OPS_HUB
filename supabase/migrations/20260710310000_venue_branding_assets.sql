-- SS Ops Hub — Venue branding assets (icon, favicon) + storage bucket

ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS icon_url TEXT,
  ADD COLUMN IF NOT EXISTS favicon_url TEXT;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'venue-branding',
  'venue-branding',
  true,
  524288,
  ARRAY[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/svg+xml',
    'image/x-icon',
    'image/vnd.microsoft.icon'
  ]
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "venue_branding_public_read" ON storage.objects;

CREATE POLICY "venue_branding_public_read"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'venue-branding');
