-- SS Ops Hub — On accounts comments on waiter daily sales

ALTER TABLE public.venue_waiter_daily_sales
  ADD COLUMN IF NOT EXISTS on_accounts_comments TEXT NOT NULL DEFAULT '';
