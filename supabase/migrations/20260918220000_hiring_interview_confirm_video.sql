-- Separate confirmation email copy for online (video) interviews.

ALTER TABLE public.hiring_forms
  ADD COLUMN IF NOT EXISTS interview_confirm_video_subject TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS interview_confirm_video_body TEXT NOT NULL DEFAULT '';

UPDATE public.hiring_forms
SET
  interview_confirm_video_subject = interview_confirm_subject,
  interview_confirm_video_body = interview_confirm_body
WHERE
  interview_confirm_video_subject = ''
  AND interview_confirm_video_body = '';
