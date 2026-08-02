-- WhatsApp contact number on staff (alongside contact_phone).
alter table public.staff
  add column if not exists whatsapp text;
