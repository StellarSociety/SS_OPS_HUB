-- Phone number field after guest name on the public feedback form.

ALTER TABLE public.guest_feedback_questions
  DROP CONSTRAINT IF EXISTS guest_feedback_questions_question_type_check;

ALTER TABLE public.guest_feedback_questions
  ADD CONSTRAINT guest_feedback_questions_question_type_check
  CHECK (question_type IN (
    'rating', 'text', 'long_text', 'yes_no', 'choice',
    'name', 'email', 'phone', 'date'
  ));

INSERT INTO public.guest_feedback_questions (
  venue_id, question_key, label, helper_text, question_type, required, enabled, sort_order
)
SELECT
  v.id,
  'guest_phone',
  'Phone number',
  NULL,
  'phone',
  false,
  true,
  65
FROM public.venues v
WHERE NOT v.is_global
ON CONFLICT (venue_id, question_key) DO NOTHING;
