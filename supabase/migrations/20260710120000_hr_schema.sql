-- SS Ops Hub — HR module: lookups, staff, RLS, seed data

-- ---------------------------------------------------------------------------
-- Permission helpers (shared across HR policies)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.access_level_rank(level TEXT)
RETURNS INT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE level
    WHEN 'submit' THEN 1
    WHEN 'view' THEN 2
    WHEN 'edit' THEN 3
    WHEN 'admin' THEN 4
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION public.has_feature_permission(
  check_user_id UUID,
  p_module_key TEXT,
  p_feature_key TEXT,
  p_min_level TEXT,
  p_venue_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_app_admin(check_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.user_permissions up
      WHERE up.user_id = check_user_id
        AND up.module_key = p_module_key
        AND up.feature_key = p_feature_key
        AND public.access_level_rank(up.access_level) >= public.access_level_rank(p_min_level)
        AND (
          up.venue_id IS NULL
          OR p_venue_id IS NULL
          OR up.venue_id = p_venue_id
        )
    );
$$;

-- ---------------------------------------------------------------------------
-- Global lookups
-- ---------------------------------------------------------------------------
CREATE TABLE public.employment_statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.nationalities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  fly_home_ticket_value NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Venue-scoped lookups
-- ---------------------------------------------------------------------------
CREATE TABLE public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (venue_id, name)
);

CREATE TABLE public.positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (venue_id, department_id, name)
);

-- ---------------------------------------------------------------------------
-- Staff (source of truth for people)
-- ---------------------------------------------------------------------------
CREATE TABLE public.staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  home_venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE RESTRICT,
  emp_no TEXT NOT NULL,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  position_id UUID REFERENCES public.positions(id) ON DELETE SET NULL,
  employment_status_id UUID REFERENCES public.employment_statuses(id) ON DELETE SET NULL,
  nationality_id UUID REFERENCES public.nationalities(id) ON DELETE SET NULL,
  first_name TEXT,
  last_name TEXT,
  full_name TEXT NOT NULL,
  contact_phone TEXT,
  personal_email TEXT,
  work_email TEXT,
  gender TEXT,
  civil_status TEXT,
  dob DATE,
  passport_no TEXT,
  passport_expiry DATE,
  eid_no TEXT,
  eid_expiry DATE,
  iban TEXT,
  swift_code TEXT,
  bank_name TEXT,
  joining_date DATE,
  termination_date DATE,
  unpaid_leave_days_total NUMERIC(8, 2) DEFAULT 0,
  vacations_entitle NUMERIC(8, 2) DEFAULT 0,
  vacations_balance NUMERIC(8, 2) DEFAULT 0,
  wage_package NUMERIC(14, 2),
  company_accommodation TEXT,
  basic_salary_60 NUMERIC(14, 2),
  accom_all_25 NUMERIC(14, 2),
  transp_all_15 NUMERIC(14, 2),
  fly_home_ticket_per_year NUMERIC(14, 2),
  provisional_leave NUMERIC(14, 2),
  provisional_eosb NUMERIC(14, 2),
  visa_expenses NUMERIC(14, 2),
  visa_penalties_paid NUMERIC(14, 2),
  ohc_date DATE,
  pic_date DATE,
  basic_food_safety_date DATE,
  fire_safety_date DATE,
  first_aid_date DATE,
  insurance_category TEXT,
  medical_insurance_value NUMERIC(14, 2),
  medical_insurance_issue_date DATE,
  medical_insurance_expiry_date DATE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (home_venue_id, emp_no)
);

CREATE INDEX staff_home_venue_idx ON public.staff (home_venue_id);
CREATE INDEX staff_department_idx ON public.staff (department_id);
CREATE INDEX staff_status_idx ON public.staff (employment_status_id);
CREATE INDEX staff_passport_expiry_idx ON public.staff (passport_expiry);
CREATE INDEX staff_eid_expiry_idx ON public.staff (eid_expiry);
CREATE INDEX staff_insurance_expiry_idx ON public.staff (medical_insurance_expiry_date);

-- Link app users to staff records
ALTER TABLE public.profiles
  ADD COLUMN staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL;

CREATE INDEX profiles_staff_id_idx ON public.profiles (staff_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER staff_set_updated_at
  BEFORE UPDATE ON public.staff
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.employment_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nationalities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

-- Global lookups: any authenticated user with hr/staff view at any venue
CREATE POLICY "employment_statuses_select"
  ON public.employment_statuses FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_permissions up
      WHERE up.user_id = auth.uid()
        AND up.module_key = 'hr'
        AND up.feature_key IN ('staff', 'lookups')
        AND public.access_level_rank(up.access_level) >= public.access_level_rank('view')
    )
  );

CREATE POLICY "nationalities_select"
  ON public.nationalities FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_permissions up
      WHERE up.user_id = auth.uid()
        AND up.module_key = 'hr'
        AND up.feature_key IN ('staff', 'lookups')
        AND public.access_level_rank(up.access_level) >= public.access_level_rank('view')
    )
  );

CREATE POLICY "employment_statuses_admin_write"
  ON public.employment_statuses FOR ALL TO authenticated
  USING (public.has_feature_permission(auth.uid(), 'hr', 'lookups', 'admin', NULL))
  WITH CHECK (public.has_feature_permission(auth.uid(), 'hr', 'lookups', 'admin', NULL));

CREATE POLICY "nationalities_admin_write"
  ON public.nationalities FOR ALL TO authenticated
  USING (public.has_feature_permission(auth.uid(), 'hr', 'lookups', 'admin', NULL))
  WITH CHECK (public.has_feature_permission(auth.uid(), 'hr', 'lookups', 'admin', NULL));

-- Departments / positions
CREATE POLICY "departments_select"
  ON public.departments FOR SELECT TO authenticated
  USING (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'lookups', 'view', venue_id)
  );

CREATE POLICY "departments_write"
  ON public.departments FOR ALL TO authenticated
  USING (public.has_feature_permission(auth.uid(), 'hr', 'lookups', 'admin', venue_id))
  WITH CHECK (public.has_feature_permission(auth.uid(), 'hr', 'lookups', 'admin', venue_id));

CREATE POLICY "positions_select"
  ON public.positions FOR SELECT TO authenticated
  USING (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'lookups', 'view', venue_id)
  );

CREATE POLICY "positions_write"
  ON public.positions FOR ALL TO authenticated
  USING (public.has_feature_permission(auth.uid(), 'hr', 'lookups', 'admin', venue_id))
  WITH CHECK (public.has_feature_permission(auth.uid(), 'hr', 'lookups', 'admin', venue_id));

-- Staff: visible by home_venue_id scope
CREATE POLICY "staff_select"
  ON public.staff FOR SELECT TO authenticated
  USING (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', home_venue_id)
  );

CREATE POLICY "staff_insert"
  ON public.staff FOR INSERT TO authenticated
  WITH CHECK (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', home_venue_id)
  );

CREATE POLICY "staff_update"
  ON public.staff FOR UPDATE TO authenticated
  USING (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', home_venue_id)
  )
  WITH CHECK (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', home_venue_id)
  );

CREATE POLICY "staff_delete"
  ON public.staff FOR DELETE TO authenticated
  USING (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'admin', home_venue_id)
  );

-- ---------------------------------------------------------------------------
-- Seed employment statuses
-- ---------------------------------------------------------------------------
INSERT INTO public.employment_statuses (name, sort_order) VALUES
  ('Hiring', 1),
  ('ON Board', 2),
  ('OFF Board', 3),
  ('OUT', 4);

-- ---------------------------------------------------------------------------
-- Seed nationalities (fly-home ticket values in AED)
-- ---------------------------------------------------------------------------
INSERT INTO public.nationalities (name, fly_home_ticket_value) VALUES
  ('Afghanistan', 2000),
  ('Albania', 2500),
  ('Algeria', 2000),
  ('Argentina', 3500),
  ('Armenia', 2500),
  ('Australia', 4000),
  ('Austria', 3000),
  ('Azerbaijan', 2500),
  ('Bangladesh', 1500),
  ('Belarus', 2500),
  ('Belgium', 3500),
  ('Brazil', 3500),
  ('Bulgaria', 2500),
  ('Cambodia', 2000),
  ('Cameroon', 2500),
  ('Canada', 4000),
  ('Chile', 3500),
  ('China', 2500),
  ('Colombia', 3000),
  ('Croatia', 2500),
  ('Czech Republic', 3000),
  ('Denmark', 3500),
  ('Egypt', 1300),
  ('Estonia', 3000),
  ('Ethiopia', 2000),
  ('Finland', 3500),
  ('France', 3500),
  ('Georgia', 2500),
  ('Germany', 3500),
  ('Ghana', 2500),
  ('Greece', 1500),
  ('Hungary', 2500),
  ('India', 1700),
  ('Indonesia', 2500),
  ('Iran', 2000),
  ('Iraq', 2000),
  ('Ireland', 3500),
  ('Italy', 3500),
  ('Japan', 3500),
  ('Jordan', 1500),
  ('Kazakhstan', 2500),
  ('Kenya', 2500),
  ('Korea', 2500),
  ('Kuwait', 1500),
  ('Kyrgyzstan', 2000),
  ('Latvia', 3000),
  ('Lebanon', 2000),
  ('Lithuania', 3000),
  ('Malaysia', 2500),
  ('Mexico', 3500),
  ('Morocco', 2000),
  ('Nepal', 1500),
  ('Netherlands', 3500),
  ('New Zealand', 4000),
  ('Nigeria', 2500),
  ('Norway', 4000),
  ('Pakistan', 1500),
  ('Palestine', 1500),
  ('Peru', 3500),
  ('Philippines', 2500),
  ('Poland', 3000),
  ('Portugal', 3000),
  ('Romania', 2500),
  ('Russia', 3000),
  ('Saudi Arabia', 1500),
  ('Serbia', 2500),
  ('Singapore', 3000),
  ('Slovakia', 3000),
  ('South Africa', 1700),
  ('Spain', 3500),
  ('Sri Lanka', 1700),
  ('Sudan', 2000),
  ('Sweden', 3500),
  ('Switzerland', 4000),
  ('Syria', 2000),
  ('Taiwan', 3000),
  ('Tanzania', 2500),
  ('Thailand', 2500),
  ('Tunisia', 2000),
  ('Turkey', 1500),
  ('Uganda', 2500),
  ('Ukraine', 2500),
  ('United Kingdom', 3500),
  ('United States', 4500),
  ('Uzbekistan', 2000),
  ('Venezuela', 3500),
  ('Vietnam', 2000),
  ('Yemen', 2000),
  ('Zimbabwe', 2500);

-- ---------------------------------------------------------------------------
-- Seed Orilla departments & positions
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_orilla_id UUID;
  d_culinary UUID;
  d_beverages UUID;
  d_fnb UUID;
  d_receptions UUID;
  d_social UUID;
  d_entertainments UUID;
  d_finance UUID;
  d_hr UUID;
BEGIN
  SELECT id INTO v_orilla_id FROM public.venues WHERE slug = 'orilla';

  INSERT INTO public.departments (venue_id, name, sort_order) VALUES
    (v_orilla_id, 'Culinary', 1),
    (v_orilla_id, 'Beverages', 2),
    (v_orilla_id, 'F&B Service', 3),
    (v_orilla_id, 'Receptions & Reservations', 4),
    (v_orilla_id, 'Social Media & Marketing', 5),
    (v_orilla_id, 'Entertainments', 6),
    (v_orilla_id, 'Finance & Accounts', 7),
    (v_orilla_id, 'Human Resources', 8);

  SELECT id INTO d_culinary FROM public.departments WHERE venue_id = v_orilla_id AND name = 'Culinary';
  SELECT id INTO d_beverages FROM public.departments WHERE venue_id = v_orilla_id AND name = 'Beverages';
  SELECT id INTO d_fnb FROM public.departments WHERE venue_id = v_orilla_id AND name = 'F&B Service';
  SELECT id INTO d_receptions FROM public.departments WHERE venue_id = v_orilla_id AND name = 'Receptions & Reservations';
  SELECT id INTO d_social FROM public.departments WHERE venue_id = v_orilla_id AND name = 'Social Media & Marketing';
  SELECT id INTO d_entertainments FROM public.departments WHERE venue_id = v_orilla_id AND name = 'Entertainments';
  SELECT id INTO d_finance FROM public.departments WHERE venue_id = v_orilla_id AND name = 'Finance & Accounts';
  SELECT id INTO d_hr FROM public.departments WHERE venue_id = v_orilla_id AND name = 'Human Resources';

  INSERT INTO public.positions (venue_id, department_id, name, sort_order) VALUES
    (v_orilla_id, d_culinary, 'Head Chef', 1),
    (v_orilla_id, d_culinary, 'Jr. Sous Chef', 2),
    (v_orilla_id, d_culinary, 'Sr. Chef de Partie', 3),
    (v_orilla_id, d_culinary, 'Chef de Partie', 4),
    (v_orilla_id, d_culinary, 'Demi Chef de Partie', 5),
    (v_orilla_id, d_culinary, 'Commis Chef 1', 6),
    (v_orilla_id, d_culinary, 'Commis Chef 2', 7),
    (v_orilla_id, d_culinary, 'Commis Chef 3', 8),
    (v_orilla_id, d_culinary, 'Commis Trainee', 9),
    (v_orilla_id, d_culinary, 'Steward', 10),
    (v_orilla_id, d_beverages, 'Bar Manager', 1),
    (v_orilla_id, d_beverages, 'Asst Bar Manager', 2),
    (v_orilla_id, d_beverages, 'Head Bartender', 3),
    (v_orilla_id, d_beverages, 'Bartender', 4),
    (v_orilla_id, d_beverages, 'Bar Back', 5),
    (v_orilla_id, d_fnb, 'Restaurant Manager', 1),
    (v_orilla_id, d_fnb, 'Assistant Manager', 2),
    (v_orilla_id, d_fnb, 'Floor Supervisor', 3),
    (v_orilla_id, d_fnb, 'Head Waiter', 4),
    (v_orilla_id, d_fnb, 'Waiter', 5),
    (v_orilla_id, d_fnb, 'F&B Runner', 6),
    (v_orilla_id, d_receptions, 'Receptions & Reservations Manager', 1),
    (v_orilla_id, d_receptions, 'Hostess', 2),
    (v_orilla_id, d_social, 'Social Media & Marketing Manager', 1),
    (v_orilla_id, d_entertainments, 'DJ', 1),
    (v_orilla_id, d_finance, 'Accountant', 1),
    (v_orilla_id, d_hr, 'Human Resources Coordinator', 1);
END $$;
