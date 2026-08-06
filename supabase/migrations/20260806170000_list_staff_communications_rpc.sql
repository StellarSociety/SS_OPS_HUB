-- Speed up staff communications trail: one RPC round-trip + invite/audit indexes.

CREATE INDEX IF NOT EXISTS audit_log_entity_entity_id_created_idx
  ON public.audit_log (entity, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_log_venue_staff_email_actions_idx
  ON public.audit_log (venue_id, entity, entity_id, created_at DESC)
  WHERE entity = 'staff'
    AND action IN (
      'work_anniversary_email.sent',
      'updated_docs_request_email.sent',
      'uniform_terms_email.sent',
      'uniform_replacement_email.sent'
    );

CREATE OR REPLACE FUNCTION public.list_staff_communication_rows(
  p_venue_id uuid,
  p_staff_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH profile_ids AS (
    SELECT id
    FROM public.profiles
    WHERE staff_id = p_staff_id
    LIMIT 20
  ),
  boarding AS (
    SELECT COALESCE(jsonb_agg(row_to_json(b)::jsonb ORDER BY b.recorded_at DESC), '[]'::jsonb) AS rows
    FROM (
      SELECT id, action, status, to_email, subject, recorded_at, sent_at, scheduled_at
      FROM public.hr_boarding_emails
      WHERE venue_id = p_venue_id
        AND staff_id = p_staff_id
      ORDER BY recorded_at DESC
      LIMIT 50
    ) b
  ),
  payslips AS (
    SELECT COALESCE(jsonb_agg(row_to_json(p)::jsonb ORDER BY p.sort_at DESC NULLS LAST), '[]'::jsonb) AS rows
    FROM (
      SELECT
        s.id,
        s.version,
        s.email_status,
        s.email_sent_at,
        s.email_error,
        s.created_at,
        s.email_sent_at AS sort_at,
        r.payroll_month
      FROM public.hr_payslips s
      LEFT JOIN public.hr_payroll_runs r ON r.id = s.run_id
      WHERE s.venue_id = p_venue_id
        AND s.staff_id = p_staff_id
        AND s.email_status IN ('sent', 'failed', 'queued', 'bounced')
      ORDER BY s.email_sent_at DESC NULLS LAST
      LIMIT 50
    ) p
  ),
  audits AS (
    SELECT COALESCE(jsonb_agg(row_to_json(a)::jsonb ORDER BY a.created_at DESC), '[]'::jsonb) AS rows
    FROM (
      SELECT id, action, after, created_at
      FROM public.audit_log
      WHERE venue_id = p_venue_id
        AND entity = 'staff'
        AND entity_id = p_staff_id::text
        AND action IN (
          'work_anniversary_email.sent',
          'updated_docs_request_email.sent',
          'uniform_terms_email.sent',
          'uniform_replacement_email.sent'
        )
      ORDER BY created_at DESC
      LIMIT 50
    ) a
  ),
  invites AS (
    SELECT COALESCE(jsonb_agg(row_to_json(i)::jsonb ORDER BY i.created_at DESC), '[]'::jsonb) AS rows
    FROM (
      SELECT id, action, entity, entity_id, after, created_at
      FROM public.audit_log
      WHERE (
          (entity = 'user' AND action = 'create' AND entity_id IN (SELECT id::text FROM profile_ids))
          OR (entity = 'user_invite' AND entity_id IN (SELECT id::text FROM profile_ids))
          OR (
            entity = 'user'
            AND action = 'create'
            AND after->>'staff_id' = p_staff_id::text
          )
        )
      ORDER BY created_at DESC
      LIMIT 50
    ) i
  ),
  threads AS (
    SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) AS rows
    FROM (
      SELECT id, thread_id, direction, source_kind, source_id
      FROM public.hr_email_messages
      WHERE venue_id = p_venue_id
        AND staff_id = p_staff_id
      LIMIT 500
    ) t
  )
  SELECT jsonb_build_object(
    'boarding', (SELECT rows FROM boarding),
    'payslips', (SELECT rows FROM payslips),
    'audits', (SELECT rows FROM audits),
    'invites', (SELECT rows FROM invites),
    'threads', (SELECT rows FROM threads)
  );
$$;

REVOKE ALL ON FUNCTION public.list_staff_communication_rows(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_staff_communication_rows(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_staff_communication_rows(uuid, uuid) TO authenticated;
