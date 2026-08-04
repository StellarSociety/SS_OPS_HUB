-- Ensure staff profile photo column + public storage bucket (idempotent).
-- Original: 20260715120000_staff_profile_photos.sql
-- Cropped passport photos + optional *-source.webp originals land in staff-photos.

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS photo_url TEXT;

COMMENT ON COLUMN public.staff.photo_url IS
  'Public HTTPS URL of the cropped passport-ratio staff photo (WebP in staff-photos).';

-- 8 MiB covers cropped WebP and resized source originals uploaded after convertImageToWebp.
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
