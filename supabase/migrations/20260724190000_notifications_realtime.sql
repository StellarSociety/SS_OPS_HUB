-- Enable Realtime so the in-app alert popup can surface new notifications live.
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
