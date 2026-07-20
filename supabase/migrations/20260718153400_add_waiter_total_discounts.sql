-- SS Ops Hub — Total discounts on waiter daily sales

ALTER TABLE public.venue_waiter_daily_sales
  ADD COLUMN IF NOT EXISTS total_discounts_gs NUMERIC(14, 2) NOT NULL DEFAULT 0;
