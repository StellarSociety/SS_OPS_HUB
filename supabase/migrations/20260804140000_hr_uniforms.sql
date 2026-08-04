-- Uniform piece catalog, department/position entitlements, and staff issuances.

CREATE TABLE IF NOT EXISTS public.hr_uniform_pieces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  supplier TEXT NOT NULL DEFAULT '',
  supplier_orders_email TEXT NOT NULL DEFAULT '',
  contact_person TEXT NOT NULL DEFAULT '',
  contact_phone TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  product_status TEXT NOT NULL DEFAULT 'active'
    CHECK (product_status IN ('active', 'old')),
  unit_value NUMERIC(14, 2) NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hr_uniform_piece_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  piece_id UUID NOT NULL REFERENCES public.hr_uniform_pieces(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  position_id UUID REFERENCES public.positions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (piece_id, department_id, position_id)
);

CREATE TABLE IF NOT EXISTS public.hr_uniform_stock_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  piece_id UUID NOT NULL REFERENCES public.hr_uniform_pieces(id) ON DELETE CASCADE,
  received_at DATE NOT NULL DEFAULT CURRENT_DATE,
  quantity INT NOT NULL CHECK (quantity > 0),
  notes TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hr_uniform_staff_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  piece_id UUID NOT NULL REFERENCES public.hr_uniform_pieces(id) ON DELETE RESTRICT,
  quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  provided_at DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hr_uniform_pieces_name_idx
  ON public.hr_uniform_pieces (name);

CREATE INDEX IF NOT EXISTS hr_uniform_pieces_status_idx
  ON public.hr_uniform_pieces (product_status);

CREATE INDEX IF NOT EXISTS hr_uniform_piece_entitlements_piece_idx
  ON public.hr_uniform_piece_entitlements (piece_id);

CREATE INDEX IF NOT EXISTS hr_uniform_piece_entitlements_dept_idx
  ON public.hr_uniform_piece_entitlements (department_id);

CREATE INDEX IF NOT EXISTS hr_uniform_stock_receipts_piece_idx
  ON public.hr_uniform_stock_receipts (piece_id, received_at DESC);

CREATE INDEX IF NOT EXISTS hr_uniform_staff_items_staff_idx
  ON public.hr_uniform_staff_items (staff_id, provided_at DESC);

CREATE INDEX IF NOT EXISTS hr_uniform_staff_items_piece_idx
  ON public.hr_uniform_staff_items (piece_id);

CREATE TRIGGER hr_uniform_pieces_set_updated_at
  BEFORE UPDATE ON public.hr_uniform_pieces
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER hr_uniform_stock_receipts_set_updated_at
  BEFORE UPDATE ON public.hr_uniform_stock_receipts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER hr_uniform_staff_items_set_updated_at
  BEFORE UPDATE ON public.hr_uniform_staff_items
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.hr_uniform_pieces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_uniform_piece_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_uniform_stock_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_uniform_staff_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_uniform_pieces_select"
  ON public.hr_uniform_pieces FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_permissions up
      WHERE up.user_id = auth.uid()
        AND up.module_key = 'hr'
        AND up.feature_key IN ('assets', 'staff')
        AND public.access_level_rank(up.access_level) >= public.access_level_rank('view')
    )
  );

CREATE POLICY "hr_uniform_pieces_write"
  ON public.hr_uniform_pieces FOR ALL TO authenticated
  USING (
    public.is_app_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_permissions up
      WHERE up.user_id = auth.uid()
        AND up.module_key = 'hr'
        AND up.feature_key IN ('assets', 'staff')
        AND public.access_level_rank(up.access_level) >= public.access_level_rank('edit')
    )
  )
  WITH CHECK (
    public.is_app_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_permissions up
      WHERE up.user_id = auth.uid()
        AND up.module_key = 'hr'
        AND up.feature_key IN ('assets', 'staff')
        AND public.access_level_rank(up.access_level) >= public.access_level_rank('edit')
    )
  );

CREATE POLICY "hr_uniform_piece_entitlements_select"
  ON public.hr_uniform_piece_entitlements FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_permissions up
      WHERE up.user_id = auth.uid()
        AND up.module_key = 'hr'
        AND up.feature_key IN ('assets', 'staff')
        AND public.access_level_rank(up.access_level) >= public.access_level_rank('view')
    )
  );

CREATE POLICY "hr_uniform_piece_entitlements_write"
  ON public.hr_uniform_piece_entitlements FOR ALL TO authenticated
  USING (
    public.is_app_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_permissions up
      WHERE up.user_id = auth.uid()
        AND up.module_key = 'hr'
        AND up.feature_key IN ('assets', 'staff')
        AND public.access_level_rank(up.access_level) >= public.access_level_rank('edit')
    )
  )
  WITH CHECK (
    public.is_app_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_permissions up
      WHERE up.user_id = auth.uid()
        AND up.module_key = 'hr'
        AND up.feature_key IN ('assets', 'staff')
        AND public.access_level_rank(up.access_level) >= public.access_level_rank('edit')
    )
  );

CREATE POLICY "hr_uniform_stock_receipts_select"
  ON public.hr_uniform_stock_receipts FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_permissions up
      WHERE up.user_id = auth.uid()
        AND up.module_key = 'hr'
        AND up.feature_key IN ('assets', 'staff')
        AND public.access_level_rank(up.access_level) >= public.access_level_rank('view')
    )
  );

CREATE POLICY "hr_uniform_stock_receipts_write"
  ON public.hr_uniform_stock_receipts FOR ALL TO authenticated
  USING (
    public.is_app_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_permissions up
      WHERE up.user_id = auth.uid()
        AND up.module_key = 'hr'
        AND up.feature_key IN ('assets', 'staff')
        AND public.access_level_rank(up.access_level) >= public.access_level_rank('edit')
    )
  )
  WITH CHECK (
    public.is_app_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_permissions up
      WHERE up.user_id = auth.uid()
        AND up.module_key = 'hr'
        AND up.feature_key IN ('assets', 'staff')
        AND public.access_level_rank(up.access_level) >= public.access_level_rank('edit')
    )
  );

CREATE POLICY "hr_uniform_staff_items_select"
  ON public.hr_uniform_staff_items FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_permissions up
      WHERE up.user_id = auth.uid()
        AND up.module_key = 'hr'
        AND up.feature_key IN ('assets', 'staff')
        AND public.access_level_rank(up.access_level) >= public.access_level_rank('view')
    )
  );

CREATE POLICY "hr_uniform_staff_items_write"
  ON public.hr_uniform_staff_items FOR ALL TO authenticated
  USING (
    public.is_app_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_permissions up
      WHERE up.user_id = auth.uid()
        AND up.module_key = 'hr'
        AND up.feature_key IN ('assets', 'staff')
        AND public.access_level_rank(up.access_level) >= public.access_level_rank('edit')
    )
  )
  WITH CHECK (
    public.is_app_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_permissions up
      WHERE up.user_id = auth.uid()
        AND up.module_key = 'hr'
        AND up.feature_key IN ('assets', 'staff')
        AND public.access_level_rank(up.access_level) >= public.access_level_rank('edit')
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_uniform_pieces TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_uniform_piece_entitlements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_uniform_stock_receipts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_uniform_staff_items TO authenticated;
GRANT ALL ON public.hr_uniform_pieces TO service_role;
GRANT ALL ON public.hr_uniform_piece_entitlements TO service_role;
GRANT ALL ON public.hr_uniform_stock_receipts TO service_role;
GRANT ALL ON public.hr_uniform_staff_items TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'hr-uniform-pieces',
  'hr-uniform-pieces',
  true,
  2097152,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "hr_uniform_pieces_public_read" ON storage.objects;

CREATE POLICY "hr_uniform_pieces_public_read"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'hr-uniform-pieces');

NOTIFY pgrst, 'reload schema';
