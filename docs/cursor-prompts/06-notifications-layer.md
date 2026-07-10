# Cursor prompt 06 — Notifications layer (in-app + email, scheduled)

Builds the shared notifications system the whole app uses, and makes the HR expiry data actionable.
Implements the §10 decision: in-app + email. Paste into Cursor with the repo open.

---

Build the **shared notifications layer** for SS Ops Hub. Follow `docs/ARCHITECTURE_BLUEPRINT.md` §10 (notifications: in-app + email + scheduled reminder job) and §14 (conventions). This is cross-cutting infrastructure any module can use; wire HR expiries as the first consumer.

## Data model (migration, RLS on)
- `notifications` (id, user_id/recipient, venue_id, module_key, type, title, body, entity, entity_id, severity, due_date, read_at, created_at). RLS: a user reads only their own notifications; writes via service role.
- Optional `notification_rules` (or config in code) describing what to watch: source module/feature, date field, lead-time(s) in days, recipient resolver. Keep it simple — a registry in `lib/notifications/` that modules add to.

## In-app
- A **notification center** in the app header (bell + unread badge), listing recent notifications for the current user, grouped/sorted by soonest due / newest. Mark-as-read. Respect venue context.
- Reusable **expiry helper**: given (items, date field, lead time), produce notification records. HR registers: passport_expiry, eid_expiry, medical_insurance_expiry_date, and the 5 training dates (ohc/pic/food safety/fire/first aid) — each with a configurable lead time (default e.g. 30/14/7 days).
- HR dashboard widgets should read from this layer (or share the same computation) so in-app expiry alerts and the notification center stay consistent.

## Email (Resend, scheduled)
- A **scheduled job** (Vercel Cron → a route handler, e.g. `app/api/cron/notifications/route.ts`) that runs daily, computes due/upcoming items, upserts notification rows (idempotent per item+date+lead so it doesn't duplicate), and emails the relevant recipients via the existing `lib/email/resend.ts` helper. Include an unsubscribe/preferences note placeholder.
- Protect the cron route with a secret (`CRON_SECRET` env) so only Vercel can trigger it. Add `CRON_SECRET` to `.env.example` and note it must be set in Vercel + `vercel.json` cron schedule.
- Recipients: resolve from permissions (e.g. users with `hr/staff` view+ at the venue) and/or a configurable list. Group staff (Global) get cross-venue items.

## Rules
- All writes via service client; emails only for items within lead time; never double-send (dedupe key).
- Respect user active status (don't email disabled users).
- Note: email sending requires the Resend domain (`orillarestaurant.com`) to be verified first — until then, in-app still works and email will no-op with a logged warning.
- Register in `lib/modules-registry.ts` if a settings surface is needed (notification preferences later).

## Verify
- Seeding a staff record with a passport/insurance/training date within the lead window produces an in-app notification and (when Resend is configured) a queued email.
- Re-running the cron doesn't create duplicates.
- A user sees only their own notifications; RLS blocks others'.

Build passes; commit to `david-dev`.
