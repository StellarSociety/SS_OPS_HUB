-- SS Ops Hub — Waiter daily sales comment fields

ALTER TABLE public.venue_waiter_daily_sales
  ADD COLUMN IF NOT EXISTS voucher_comments TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS deposit_comments TEXT NOT NULL DEFAULT '';
