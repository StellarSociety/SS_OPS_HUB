-- Accounting reads daily sales gross for Revenue and Cash Flow income.
-- Sales venue_daily policies stay in place; Postgres ORs SELECT policies.

CREATE POLICY "venue_daily_sales_select_accounting"
  ON public.venue_daily_sales
  FOR SELECT
  TO authenticated
  USING (
    NOT public.is_module_suspended(auth.uid(), 'accounting', venue_id)
    AND (
      public.is_app_admin(auth.uid())
      OR EXISTS (
        SELECT 1
        FROM public.user_permissions up
        WHERE up.user_id = auth.uid()
          AND up.module_key = 'accounting'
          AND public.access_level_rank(up.access_level) >= public.access_level_rank('view')
          AND (
            up.venue_id IS NULL
            OR up.venue_id = venue_daily_sales.venue_id
          )
      )
    )
  );
