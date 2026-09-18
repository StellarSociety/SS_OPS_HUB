-- Hiring application forms, public replies, and interview appointments.

CREATE TABLE IF NOT EXISTS public.hiring_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  public_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'paused'
    CHECK (status IN ('live', 'paused', 'scheduled')),
  accept_from DATE,
  accept_until DATE,
  max_entries INT
    CHECK (max_entries IS NULL OR max_entries > 0),
  intro_image_url TEXT,
  intro_description TEXT NOT NULL DEFAULT '',
  intro_button_label TEXT NOT NULL DEFAULT 'Apply here',
  end_message TEXT NOT NULL DEFAULT
    'Thank you — we have received your application and will be in touch.',
  show_socials BOOLEAN NOT NULL DEFAULT true,
  table_column_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  sort_field_id UUID,
  sort_direction TEXT NOT NULL DEFAULT 'desc'
    CHECK (sort_direction IN ('asc', 'desc')),
  interview_request_subject TEXT NOT NULL DEFAULT '',
  interview_request_body TEXT NOT NULL DEFAULT '',
  interview_confirm_subject TEXT NOT NULL DEFAULT '',
  interview_confirm_body TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS hiring_forms_public_code_lower_idx
  ON public.hiring_forms (lower(public_code));

CREATE INDEX IF NOT EXISTS hiring_forms_venue_updated_idx
  ON public.hiring_forms (venue_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.hiring_form_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES public.hiring_forms (id) ON DELETE CASCADE,
  sort_order INT NOT NULL DEFAULT 0,
  kind TEXT NOT NULL
    CHECK (kind IN ('title', 'description', 'field')),
  title TEXT,
  description TEXT,
  field_key TEXT,
  field_label TEXT,
  field_type TEXT
    CHECK (
      field_type IS NULL
      OR field_type IN (
        'short_text',
        'long_text',
        'date',
        'number',
        'email',
        'picture',
        'file'
      )
    ),
  required BOOLEAN NOT NULL DEFAULT false,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hiring_form_blocks_form_sort_idx
  ON public.hiring_form_blocks (form_id, sort_order);

CREATE TABLE IF NOT EXISTS public.hiring_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES public.hiring_forms (id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES public.venues (id) ON DELETE CASCADE,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  category TEXT
    CHECK (
      category IS NULL
      OR category IN ('not_fit', 'maybe', 'good_candidate')
    ),
  status TEXT NOT NULL DEFAULT 'no_interaction'
    CHECK (status IN (
      'no_interaction',
      'interview_request_sent',
      'interview_scheduled',
      'final_assessment',
      'to_be_hired'
    )),
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  applicant_name TEXT,
  applicant_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hiring_applications_form_submitted_idx
  ON public.hiring_applications (form_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS hiring_applications_venue_status_idx
  ON public.hiring_applications (venue_id, status, submitted_at DESC);

CREATE TABLE IF NOT EXISTS public.hiring_application_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL
    REFERENCES public.hiring_applications (id) ON DELETE CASCADE,
  block_id UUID REFERENCES public.hiring_form_blocks (id) ON DELETE SET NULL,
  storage_path TEXT NOT NULL,
  public_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  content_type TEXT,
  byte_size INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hiring_application_files_app_idx
  ON public.hiring_application_files (application_id);

CREATE TABLE IF NOT EXISTS public.hiring_appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues (id) ON DELETE CASCADE,
  form_id UUID NOT NULL REFERENCES public.hiring_forms (id) ON DELETE CASCADE,
  application_id UUID NOT NULL
    REFERENCES public.hiring_applications (id) ON DELETE CASCADE,
  format TEXT NOT NULL
    CHECK (format IN ('in_person', 'video')),
  location_details TEXT,
  meeting_link TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('confirmed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hiring_appointments_venue_starts_idx
  ON public.hiring_appointments (venue_id, starts_at);

CREATE TRIGGER hiring_forms_set_updated_at
  BEFORE UPDATE ON public.hiring_forms
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER hiring_form_blocks_set_updated_at
  BEFORE UPDATE ON public.hiring_form_blocks
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER hiring_applications_set_updated_at
  BEFORE UPDATE ON public.hiring_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER hiring_appointments_set_updated_at
  BEFORE UPDATE ON public.hiring_appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.hiring_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hiring_form_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hiring_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hiring_application_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hiring_appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hiring_forms_select"
  ON public.hiring_forms FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'hiring', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', venue_id)
  );

CREATE POLICY "hiring_form_blocks_select"
  ON public.hiring_form_blocks FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.hiring_forms f
      WHERE f.id = form_id
        AND (
          public.is_app_admin()
          OR public.has_feature_permission(auth.uid(), 'hr', 'hiring', 'view', f.venue_id)
          OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', f.venue_id)
        )
    )
  );

CREATE POLICY "hiring_applications_select"
  ON public.hiring_applications FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'hiring', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', venue_id)
  );

CREATE POLICY "hiring_application_files_select"
  ON public.hiring_application_files FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.hiring_applications a
      WHERE a.id = application_id
        AND (
          public.is_app_admin()
          OR public.has_feature_permission(auth.uid(), 'hr', 'hiring', 'view', a.venue_id)
          OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', a.venue_id)
        )
    )
  );

CREATE POLICY "hiring_appointments_select"
  ON public.hiring_appointments FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'hiring', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', venue_id)
  );

GRANT SELECT ON public.hiring_forms TO authenticated;
GRANT SELECT ON public.hiring_form_blocks TO authenticated;
GRANT SELECT ON public.hiring_applications TO authenticated;
GRANT SELECT ON public.hiring_application_files TO authenticated;
GRANT SELECT ON public.hiring_appointments TO authenticated;

GRANT ALL ON public.hiring_forms TO service_role;
GRANT ALL ON public.hiring_form_blocks TO service_role;
GRANT ALL ON public.hiring_applications TO service_role;
GRANT ALL ON public.hiring_application_files TO service_role;
GRANT ALL ON public.hiring_appointments TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'hiring',
  'hiring',
  true,
  15728640,
  ARRAY[
    'image/webp',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/heic',
    'image/heif',
    'image/avif',
    'image/tiff',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "hiring_public_read" ON storage.objects;
CREATE POLICY "hiring_public_read"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'hiring');

NOTIFY pgrst, 'reload schema';
