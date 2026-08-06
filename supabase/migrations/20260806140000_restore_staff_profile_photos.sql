-- Restore staff profile photo column + public storage bucket.
-- Reverses 20260805190000_drop_staff_profile_photos.sql.
-- Cropped circular WebP photos land in staff-photos; DB stores public URL only.

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS photo_url TEXT;

COMMENT ON COLUMN public.staff.photo_url IS
  'Public HTTPS URL of the cropped staff profile photo (WebP in staff-photos).';

-- 8 MiB covers cropped WebP uploads after convertImageToWebp.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'staff-photos',
  'staff-photos',
  true,
  8388608,
  ARRAY[
    'image/png',
    'image/jpeg',
    'image/webp'
  ]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Public read so photo_url can be shown in the app without signed URLs.
-- Writes use the service role (bypasses RLS).
DROP POLICY IF EXISTS "staff_photos_public_read" ON storage.objects;

CREATE POLICY "staff_photos_public_read"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'staff-photos');
