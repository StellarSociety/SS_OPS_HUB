-- Store the sent email snapshot on acknowledgement records so Communications
-- can reopen the exact message. Backfill from hr_email_messages when a close
-- match exists.

ALTER TABLE public.hr_email_acknowledgements
  ADD COLUMN IF NOT EXISTS from_email TEXT,
  ADD COLUMN IF NOT EXISTS body_html TEXT,
  ADD COLUMN IF NOT EXISTS body_text TEXT;

UPDATE public.hr_email_acknowledgements AS a
SET
  from_email = COALESCE(a.from_email, m.from_email),
  body_html = COALESCE(NULLIF(btrim(a.body_html), ''), m.body_html),
  body_text = COALESCE(NULLIF(btrim(a.body_text), ''), m.body_text)
FROM (
  SELECT DISTINCT ON (a2.id)
    a2.id,
    m.from_email,
    m.body_html,
    m.body_text
  FROM public.hr_email_acknowledgements a2
  INNER JOIN public.hr_email_messages m
    ON m.venue_id = a2.venue_id
   AND m.direction = 'outbound'
   AND m.subject = a2.subject
   AND (
     (a2.staff_id IS NOT NULL AND m.staff_id = a2.staff_id)
     OR (
       a2.staff_id IS NULL
       AND a2.recipient_email IS NOT NULL
       AND lower(m.to_email) = lower(a2.recipient_email)
     )
   )
   AND m.occurred_at BETWEEN a2.sent_at - interval '30 minutes'
                         AND a2.sent_at + interval '30 minutes'
  ORDER BY a2.id, abs(extract(epoch FROM (m.occurred_at - a2.sent_at)))
) AS m
WHERE a.id = m.id
  AND a.body_html IS NULL;
