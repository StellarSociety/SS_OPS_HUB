-- Recipients (auth user IDs) notified when a hiring form receives a new application.

ALTER TABLE public.hiring_forms
  ADD COLUMN IF NOT EXISTS notify_user_ids UUID[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.hiring_forms.notify_user_ids IS
  'Auth user IDs notified in the web and mobile apps when a new application is submitted.';
