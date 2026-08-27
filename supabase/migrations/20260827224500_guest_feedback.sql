-- Guest Feedback: configurable public review form, promotions, and a Direct
-- (guest) channel that lands on the Sentiment reviews page.

ALTER TABLE public.sentiment_review_sources
  DROP CONSTRAINT IF EXISTS sentiment_review_sources_channel_check;
ALTER TABLE public.sentiment_review_sources
  ADD CONSTRAINT sentiment_review_sources_channel_check
  CHECK (channel IN ('google', 'tripadvisor', 'guest'));

ALTER TABLE public.sentiment_reviews
  DROP CONSTRAINT IF EXISTS sentiment_reviews_channel_check;
ALTER TABLE public.sentiment_reviews
  ADD CONSTRAINT sentiment_reviews_channel_check
  CHECK (channel IN ('google', 'tripadvisor', 'guest'));

INSERT INTO public.sentiment_review_sources (
  venue_id, channel, label, status
)
SELECT v.id, 'guest', 'Guest feedback', 'connected'
FROM public.venues v
WHERE NOT v.is_global
ON CONFLICT (venue_id, channel) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.guest_feedback_settings (
  venue_id UUID PRIMARY KEY REFERENCES public.venues (id) ON DELETE CASCADE,
  public_code TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  form_title TEXT NOT NULL DEFAULT 'How was your visit?',
  form_intro TEXT NOT NULL DEFAULT 'We''d love to hear about your dining experience.',
  thank_you_message TEXT NOT NULL DEFAULT 'Thank you — your feedback helps us make every visit better.',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS guest_feedback_settings_public_code_lower_idx
  ON public.guest_feedback_settings (lower(public_code));

CREATE TABLE IF NOT EXISTS public.guest_feedback_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues (id) ON DELETE CASCADE,
  question_key TEXT NOT NULL,
  label TEXT NOT NULL,
  helper_text TEXT,
  question_type TEXT NOT NULL
    CHECK (question_type IN (
      'rating', 'text', 'long_text', 'yes_no', 'choice', 'name', 'email', 'date'
    )),
  required BOOLEAN NOT NULL DEFAULT false,
  enabled BOOLEAN NOT NULL DEFAULT true,
  choices TEXT[] NOT NULL DEFAULT '{}',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT guest_feedback_questions_venue_key_unique UNIQUE (venue_id, question_key)
);

CREATE INDEX IF NOT EXISTS guest_feedback_questions_venue_sort_idx
  ON public.guest_feedback_questions (venue_id, sort_order);

CREATE TABLE IF NOT EXISTS public.guest_feedback_promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  value_label TEXT,
  image_url TEXT,
  starts_on DATE,
  ends_on DATE,
  visible BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS guest_feedback_promotions_venue_sort_idx
  ON public.guest_feedback_promotions (venue_id, sort_order, visible);

CREATE TRIGGER guest_feedback_settings_set_updated_at
  BEFORE UPDATE ON public.guest_feedback_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER guest_feedback_questions_set_updated_at
  BEFORE UPDATE ON public.guest_feedback_questions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER guest_feedback_promotions_set_updated_at
  BEFORE UPDATE ON public.guest_feedback_promotions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.guest_feedback_settings (venue_id, public_code)
SELECT
  v.id,
  upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 4))
FROM public.venues v
WHERE NOT v.is_global
ON CONFLICT (venue_id) DO NOTHING;

INSERT INTO public.guest_feedback_questions (
  venue_id, question_key, label, helper_text, question_type, required, enabled, sort_order
)
SELECT
  v.id,
  d.question_key,
  d.label,
  d.helper_text,
  d.question_type,
  d.required,
  true,
  d.sort_order
FROM public.venues v
CROSS JOIN (
  VALUES
    ('overall_rating', 'Overall experience', 'How was your visit overall?', 'rating', true, 10),
    ('food_rating', 'Food', 'Quality, taste, and presentation.', 'rating', false, 20),
    ('service_rating', 'Service', 'Warmth, pace, and attention.', 'rating', false, 30),
    ('atmosphere_rating', 'Atmosphere', 'Ambience, music, and comfort.', 'rating', false, 40),
    ('comment', 'Tell us more', 'What stood out — or what could we improve?', 'long_text', false, 50),
    ('guest_name', 'Your name', NULL, 'name', false, 60),
    ('guest_email', 'Email', 'Optional — only if you would like us to follow up.', 'email', false, 70),
    ('visit_date', 'When did you visit?', NULL, 'date', false, 80)
) AS d(question_key, label, helper_text, question_type, required, sort_order)
WHERE NOT v.is_global
ON CONFLICT (venue_id, question_key) DO NOTHING;

INSERT INTO public.user_permissions (
  user_id, venue_id, module_key, feature_key, access_level
)
SELECT
  up.user_id,
  up.venue_id,
  'sentiment',
  'guest_feedback',
  up.access_level
FROM public.user_permissions up
WHERE up.module_key = 'sentiment'
  AND up.feature_key = 'reviews'
ON CONFLICT (user_id, venue_id, module_key, feature_key) DO NOTHING;

ALTER TABLE public.guest_feedback_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_feedback_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_feedback_promotions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "guest_feedback_settings_select"
  ON public.guest_feedback_settings FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'sentiment', 'guest_feedback', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'sentiment', 'reviews', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'sentiment', 'overview', 'view', venue_id)
  );

CREATE POLICY "guest_feedback_questions_select"
  ON public.guest_feedback_questions FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'sentiment', 'guest_feedback', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'sentiment', 'reviews', 'view', venue_id)
  );

CREATE POLICY "guest_feedback_promotions_select"
  ON public.guest_feedback_promotions FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'sentiment', 'guest_feedback', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'sentiment', 'reviews', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'sentiment', 'overview', 'view', venue_id)
  );

GRANT SELECT ON public.guest_feedback_settings TO authenticated;
GRANT SELECT ON public.guest_feedback_questions TO authenticated;
GRANT SELECT ON public.guest_feedback_promotions TO authenticated;
GRANT ALL ON public.guest_feedback_settings TO service_role;
GRANT ALL ON public.guest_feedback_questions TO service_role;
GRANT ALL ON public.guest_feedback_promotions TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'guest-feedback',
  'guest-feedback',
  true,
  5242880,
  ARRAY[
    'image/webp',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/heic',
    'image/heif',
    'image/avif',
    'image/tiff'
  ]
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "guest_feedback_public_read" ON storage.objects;
CREATE POLICY "guest_feedback_public_read"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'guest-feedback');

NOTIFY pgrst, 'reload schema';
