-- Save Log module: HACCP daily records, log types, and storage.

UPDATE public.app_module_states
SET state = 'live',
    updated_at = now()
WHERE module_key = 'save_log';

INSERT INTO public.app_module_states (module_key, state)
VALUES ('save_log', 'live')
ON CONFLICT (module_key) DO UPDATE
SET state = 'live',
    updated_at = now();

INSERT INTO public.venue_modules (venue_id, module_key, enabled)
SELECT v.id, 'save_log', true
FROM public.venues v
WHERE NOT v.is_global
ON CONFLICT (venue_id, module_key) DO UPDATE SET enabled = true;

CREATE TABLE IF NOT EXISTS public.save_log_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues (id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  required_daily BOOLEAN NOT NULL DEFAULT true,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT save_log_types_venue_key_unique UNIQUE (venue_id, key)
);

CREATE INDEX IF NOT EXISTS save_log_types_venue_idx
  ON public.save_log_types (venue_id, sort_order);

CREATE TABLE IF NOT EXISTS public.save_log_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues (id) ON DELETE CASCADE,
  type_id UUID NOT NULL REFERENCES public.save_log_types (id) ON DELETE RESTRICT,
  log_date DATE NOT NULL,
  original_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_url TEXT NOT NULL,
  content_type TEXT NOT NULL,
  file_size INT,
  notes TEXT,
  uploaded_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT save_log_records_storage_path_unique UNIQUE (storage_path)
);

CREATE INDEX IF NOT EXISTS save_log_records_venue_date_idx
  ON public.save_log_records (venue_id, log_date DESC);

CREATE INDEX IF NOT EXISTS save_log_records_type_date_idx
  ON public.save_log_records (venue_id, type_id, log_date DESC);

CREATE TRIGGER save_log_types_set_updated_at
  BEFORE UPDATE ON public.save_log_types
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER save_log_records_set_updated_at
  BEFORE UPDATE ON public.save_log_records
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.save_log_types (
  venue_id, key, label, description, sort_order, required_daily
)
SELECT
  v.id,
  d.key,
  d.label,
  d.description,
  d.sort_order,
  d.required_daily
FROM public.venues v
CROSS JOIN (
  VALUES
    ('fridge_temps', 'Fridge temperatures', 'Daily fridge temperature checks.', 10, true),
    ('freezer_temps', 'Freezer temperatures', 'Daily freezer temperature checks.', 20, true),
    ('hot_holding', 'Hot holding', 'Hot-holding temperature records.', 30, true),
    ('cooking_cooling', 'Cooking & cooling', 'Cooking and cooling temperature logs.', 40, true),
    ('receiving', 'Receiving', 'Goods-in and delivery checks.', 50, true),
    ('cleaning', 'Cleaning & sanitation', 'Daily cleaning and sanitation records.', 60, true),
    ('staff_hygiene', 'Staff hygiene', 'Staff illness and hygiene checks.', 70, true),
    ('probe_calibration', 'Probe calibration', 'Thermometer and probe calibration records.', 80, false)
) AS d(key, label, description, sort_order, required_daily)
WHERE NOT v.is_global
ON CONFLICT (venue_id, key) DO NOTHING;

ALTER TABLE public.save_log_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.save_log_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "save_log_types_select"
  ON public.save_log_types FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'save_log', 'overview', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'save_log', 'logs', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'save_log', 'settings', 'view', venue_id)
  );

CREATE POLICY "save_log_records_select"
  ON public.save_log_records FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'save_log', 'overview', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'save_log', 'logs', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'save_log', 'settings', 'view', venue_id)
  );

GRANT SELECT ON public.save_log_types TO authenticated;
GRANT SELECT ON public.save_log_records TO authenticated;
GRANT ALL ON public.save_log_types TO service_role;
GRANT ALL ON public.save_log_records TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'save-log-records',
  'save-log-records',
  true,
  15728640,
  ARRAY[
    'application/pdf',
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

DROP POLICY IF EXISTS "save_log_records_public_read" ON storage.objects;
CREATE POLICY "save_log_records_public_read"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'save-log-records');

NOTIFY pgrst, 'reload schema';
