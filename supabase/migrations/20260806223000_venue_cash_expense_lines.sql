-- Cash expense justification lines (references against journal cash_expenses_gs)

CREATE TABLE public.venue_cash_expense_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  sale_date DATE NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  amount_gs NUMERIC(14, 2) NOT NULL DEFAULT 0,
  pchase_portal BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX venue_cash_expense_lines_venue_date_idx
  ON public.venue_cash_expense_lines (venue_id, sale_date DESC, sort_order ASC);

CREATE TRIGGER venue_cash_expense_lines_set_updated_at
  BEFORE UPDATE ON public.venue_cash_expense_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.venue_cash_expense_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "venue_cash_expense_lines_select"
  ON public.venue_cash_expense_lines FOR SELECT TO authenticated
  USING (
    public.has_feature_permission(
      auth.uid(), 'sales', 'cash_up', 'view', venue_id
    )
    OR public.has_feature_permission(
      auth.uid(), 'sales', 'venue_daily', 'view', venue_id
    )
  );

CREATE POLICY "venue_cash_expense_lines_insert"
  ON public.venue_cash_expense_lines FOR INSERT TO authenticated
  WITH CHECK (
    public.has_feature_permission(
      auth.uid(), 'sales', 'cash_up', 'edit', venue_id
    )
    OR public.has_feature_permission(
      auth.uid(), 'sales', 'venue_daily', 'edit', venue_id
    )
  );

CREATE POLICY "venue_cash_expense_lines_update"
  ON public.venue_cash_expense_lines FOR UPDATE TO authenticated
  USING (
    public.has_feature_permission(
      auth.uid(), 'sales', 'cash_up', 'edit', venue_id
    )
    OR public.has_feature_permission(
      auth.uid(), 'sales', 'venue_daily', 'edit', venue_id
    )
  )
  WITH CHECK (
    public.has_feature_permission(
      auth.uid(), 'sales', 'cash_up', 'edit', venue_id
    )
    OR public.has_feature_permission(
      auth.uid(), 'sales', 'venue_daily', 'edit', venue_id
    )
  );

CREATE POLICY "venue_cash_expense_lines_delete"
  ON public.venue_cash_expense_lines FOR DELETE TO authenticated
  USING (
    public.has_feature_permission(
      auth.uid(), 'sales', 'cash_up', 'edit', venue_id
    )
    OR public.has_feature_permission(
      auth.uid(), 'sales', 'venue_daily', 'edit', venue_id
    )
  );
