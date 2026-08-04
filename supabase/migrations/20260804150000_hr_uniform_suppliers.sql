-- Uniform suppliers catalog + link from uniform pieces.

CREATE TABLE IF NOT EXISTS public.hr_uniform_suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  orders_email TEXT NOT NULL DEFAULT '',
  contact_person TEXT NOT NULL DEFAULT '',
  contact_phone TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.hr_uniform_pieces
  ADD COLUMN IF NOT EXISTS supplier_id UUID
    REFERENCES public.hr_uniform_suppliers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS hr_uniform_suppliers_name_idx
  ON public.hr_uniform_suppliers (name);

CREATE INDEX IF NOT EXISTS hr_uniform_pieces_supplier_idx
  ON public.hr_uniform_pieces (supplier_id);

CREATE TRIGGER hr_uniform_suppliers_set_updated_at
  BEFORE UPDATE ON public.hr_uniform_suppliers
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.hr_uniform_suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_uniform_suppliers_select"
  ON public.hr_uniform_suppliers FOR SELECT TO authenticated
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

CREATE POLICY "hr_uniform_suppliers_write"
  ON public.hr_uniform_suppliers FOR ALL TO authenticated
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

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_uniform_suppliers TO authenticated;
GRANT ALL ON public.hr_uniform_suppliers TO service_role;

NOTIFY pgrst, 'reload schema';
