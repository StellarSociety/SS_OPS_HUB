-- Allow users to dismiss (delete) their own in-app notifications.

CREATE POLICY "notifications_delete_own"
  ON public.notifications
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
