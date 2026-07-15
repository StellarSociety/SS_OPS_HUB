-- Staff profile photos (passport-ratio) + public storage bucket

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS photo_url TEXT;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'staff-photos',
  'staff-photos',
  true,
  2097152,
  ARRAY[
    'image/png',
    'image/jpeg',
    'image/webp'
  ]
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "staff_photos_public_read" ON storage.objects;

CREATE POLICY "staff_photos_public_read"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'staff-photos');
