-- Drop the optional-follow-up helper under the guest email field.

UPDATE public.guest_feedback_questions
SET helper_text = NULL
WHERE question_key = 'guest_email'
  AND helper_text = 'Optional — only if you would like us to follow up.';
