-- Add Beverages rating after Food on the guest questionnaire.

INSERT INTO public.guest_feedback_questions (
  venue_id, question_key, label, helper_text, question_type, required, enabled, sort_order
)
SELECT
  v.id,
  'beverages_rating',
  'Beverages',
  'Drinks, cocktails, wine, and coffee.',
  'rating',
  false,
  true,
  25
FROM public.venues v
WHERE NOT v.is_global
ON CONFLICT (venue_id, question_key) DO NOTHING;
