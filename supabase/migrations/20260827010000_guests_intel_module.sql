-- Guests Intel: guest intake, rewards, and redeemable passes.

UPDATE public.app_module_states
SET state = 'live',
    updated_at = now()
WHERE module_key = 'guests_intel';

INSERT INTO public.app_module_states (module_key, state)
VALUES ('guests_intel', 'live')
ON CONFLICT (module_key) DO UPDATE
SET state = 'live',
    updated_at = now();

INSERT INTO public.venue_modules (venue_id, module_key, enabled)
SELECT v.id, 'guests_intel', true
FROM public.venues v
WHERE NOT v.is_global
ON CONFLICT (venue_id, module_key) DO UPDATE SET enabled = true;

CREATE TABLE IF NOT EXISTS public.guests_intel_settings (
  venue_id UUID PRIMARY KEY REFERENCES public.venues (id) ON DELETE CASCADE,
  public_token TEXT NOT NULL UNIQUE,
  from_email TEXT NOT NULL DEFAULT 'reservations@orillarestaurant.com',
  from_name TEXT NOT NULL DEFAULT 'Orilla Reservations',
  form_title TEXT NOT NULL DEFAULT 'Tell us a little about you',
  form_intro TEXT NOT NULL DEFAULT 'Share your details and we will send you a pass you can redeem on your next visit.',
  thank_you_message TEXT NOT NULL DEFAULT 'Thank you. Screenshot the QR code below and keep it on your phone. We have also sent it to your email.',
  email_subject TEXT NOT NULL DEFAULT 'Your {{venue}} guest pass',
  default_reward_id UUID,
  public_form_enabled BOOLEAN NOT NULL DEFAULT true,
  valid_days INT NOT NULL DEFAULT 90,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.guests_intel_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('promotion', 'voucher', 'discount', 'complimentary')),
  title TEXT NOT NULL,
  description TEXT,
  value_label TEXT,
  terms TEXT,
  valid_days INT,
  active BOOLEAN NOT NULL DEFAULT true,
  archived_at TIMESTAMPTZ,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS guests_intel_rewards_venue_idx
  ON public.guests_intel_rewards (venue_id, sort_order);

ALTER TABLE public.guests_intel_settings
  DROP CONSTRAINT IF EXISTS guests_intel_settings_default_reward_fkey;

ALTER TABLE public.guests_intel_settings
  ADD CONSTRAINT guests_intel_settings_default_reward_fkey
  FOREIGN KEY (default_reward_id)
  REFERENCES public.guests_intel_rewards (id)
  ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.guests_intel_guests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues (id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('hub', 'public')),
  first_name TEXT NOT NULL,
  last_name TEXT,
  email TEXT NOT NULL,
  phone TEXT,
  visit_date DATE,
  party_size INT,
  occasion TEXT,
  notes TEXT,
  marketing_opt_in BOOLEAN NOT NULL DEFAULT false,
  submitted_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS guests_intel_guests_venue_created_idx
  ON public.guests_intel_guests (venue_id, created_at DESC);

CREATE INDEX IF NOT EXISTS guests_intel_guests_venue_email_idx
  ON public.guests_intel_guests (venue_id, email);

CREATE TABLE IF NOT EXISTS public.guests_intel_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues (id) ON DELETE CASCADE,
  guest_id UUID NOT NULL REFERENCES public.guests_intel_guests (id) ON DELETE CASCADE,
  reward_id UUID NOT NULL REFERENCES public.guests_intel_rewards (id) ON DELETE RESTRICT,
  code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'issued'
    CHECK (status IN ('issued', 'redeemed', 'expired', 'void')),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  redeemed_at TIMESTAMPTZ,
  redeemed_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  email_sent_at TIMESTAMPTZ,
  email_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT guests_intel_issues_code_unique UNIQUE (code)
);

CREATE INDEX IF NOT EXISTS guests_intel_issues_venue_status_idx
  ON public.guests_intel_issues (venue_id, status, issued_at DESC);

CREATE INDEX IF NOT EXISTS guests_intel_issues_guest_idx
  ON public.guests_intel_issues (guest_id, issued_at DESC);

CREATE TRIGGER guests_intel_settings_set_updated_at
  BEFORE UPDATE ON public.guests_intel_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER guests_intel_rewards_set_updated_at
  BEFORE UPDATE ON public.guests_intel_rewards
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER guests_intel_guests_set_updated_at
  BEFORE UPDATE ON public.guests_intel_guests
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER guests_intel_issues_set_updated_at
  BEFORE UPDATE ON public.guests_intel_issues
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.guests_intel_settings (
  venue_id, public_token, from_email, from_name
)
SELECT
  v.id,
  encode(gen_random_bytes(9), 'hex'),
  'reservations@orillarestaurant.com',
  CASE
    WHEN v.slug = 'orilla' THEN 'Orilla Reservations'
    ELSE v.name || ' Reservations'
  END
FROM public.venues v
WHERE NOT v.is_global
ON CONFLICT (venue_id) DO NOTHING;

INSERT INTO public.guests_intel_rewards (
  venue_id, kind, title, description, value_label, sort_order, active
)
SELECT
  v.id,
  d.kind,
  d.title,
  d.description,
  d.value_label,
  d.sort_order,
  true
FROM public.venues v
CROSS JOIN (
  VALUES
    ('complimentary', 'Welcome drink', 'A complementary welcome drink on us.', '1 complimentary drink', 10),
    ('discount', '10% off food', 'Ten percent off food on your next visit.', '10% off food', 20),
    ('complimentary', 'Complementary dessert', 'A complementary dessert for the table.', '1 complimentary dessert', 30)
) AS d(kind, title, description, value_label, sort_order)
WHERE NOT v.is_global
  AND NOT EXISTS (
    SELECT 1 FROM public.guests_intel_rewards r WHERE r.venue_id = v.id
  );

UPDATE public.guests_intel_settings s
SET default_reward_id = r.id
FROM public.guests_intel_rewards r
WHERE s.venue_id = r.venue_id
  AND s.default_reward_id IS NULL
  AND r.sort_order = 10
  AND r.archived_at IS NULL;

ALTER TABLE public.guests_intel_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guests_intel_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guests_intel_guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guests_intel_issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "guests_intel_settings_select"
  ON public.guests_intel_settings FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'guests_intel', 'overview', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'guests_intel', 'collect', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'guests_intel', 'guests', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'guests_intel', 'rewards', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'guests_intel', 'redeem', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'guests_intel', 'settings', 'view', venue_id)
  );

CREATE POLICY "guests_intel_rewards_select"
  ON public.guests_intel_rewards FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'guests_intel', 'overview', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'guests_intel', 'collect', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'guests_intel', 'guests', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'guests_intel', 'rewards', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'guests_intel', 'redeem', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'guests_intel', 'settings', 'view', venue_id)
  );

CREATE POLICY "guests_intel_guests_select"
  ON public.guests_intel_guests FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'guests_intel', 'overview', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'guests_intel', 'collect', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'guests_intel', 'guests', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'guests_intel', 'redeem', 'view', venue_id)
  );

CREATE POLICY "guests_intel_issues_select"
  ON public.guests_intel_issues FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'guests_intel', 'overview', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'guests_intel', 'collect', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'guests_intel', 'guests', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'guests_intel', 'redeem', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'guests_intel', 'rewards', 'view', venue_id)
  );

GRANT SELECT ON public.guests_intel_settings TO authenticated;
GRANT SELECT ON public.guests_intel_rewards TO authenticated;
GRANT SELECT ON public.guests_intel_guests TO authenticated;
GRANT SELECT ON public.guests_intel_issues TO authenticated;
GRANT ALL ON public.guests_intel_settings TO service_role;
GRANT ALL ON public.guests_intel_rewards TO service_role;
GRANT ALL ON public.guests_intel_guests TO service_role;
GRANT ALL ON public.guests_intel_issues TO service_role;

NOTIFY pgrst, 'reload schema';
