-- Remove staff profile photo column and storage (upload UI retired).
-- Display surfaces keep avatar shells and fall back to initials.

DROP POLICY IF EXISTS "staff_photos_public_read" ON storage.objects;

DELETE FROM storage.objects WHERE bucket_id = 'staff-photos';
DELETE FROM storage.buckets WHERE id = 'staff-photos';

ALTER TABLE public.staff
  DROP COLUMN IF EXISTS photo_url;
