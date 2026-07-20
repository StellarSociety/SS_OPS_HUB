-- Profile avatars (round, for shell / external users) + public storage bucket

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'user-avatars',
  'user-avatars',
  true,
  1048576,
  ARRAY[
    'image/png',
    'image/jpeg',
    'image/webp'
  ]
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "user_avatars_public_read" ON storage.objects;

CREATE POLICY "user_avatars_public_read"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'user-avatars');
