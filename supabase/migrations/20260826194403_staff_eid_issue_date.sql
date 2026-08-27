-- Emirates ID issue date on staff (alongside eid_no / eid_expiry).
alter table public.staff
  add column if not exists eid_issue_date date;
