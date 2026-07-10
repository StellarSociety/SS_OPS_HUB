# Cursor prompt 02 — HR module (core: directory + lookups + import)

Build order: **this comes first** — HR staff records are the foundation that app users link to
(every user must be a staff member). Paste the block below into Cursor with the repo open.

---

Build the **Human Resources module (core)** for SS Ops Hub. Read `docs/ARCHITECTURE_BLUEPRINT.md` (esp. §2A HR sub-features, §5 permissions, §6 module pattern, §14 conventions) and `docs/hr-data-mapping.md` (the field + lookup spec derived from the client's real HR workbook). Scope this pass to: staff directory, lookups, importing the 48 existing staff, and expiry dashboards. **Do not** build payroll, attendance, leave, or document file-storage yet — leave clean seams for them.

## Data model (Supabase migration, RLS on every table)
Create lookups + staff tables, all scoped by `venue_id` (FK → venues):
- `departments` (id, venue_id, name, sort_order)
- `positions` (id, venue_id, department_id, name, sort_order)
- `employment_statuses` (id, name) — seed: Hiring, ON Board, OFF Board, OUT
- `nationalities` (id, name, fly_home_ticket_value numeric)
- `staff` — all fields in `docs/hr-data-mapping.md` (identity, documents, bank, joining & leave, salary package, expenses, OHC & trainings, insurance). Use proper types (dates as date, money as numeric). `emp_no` unique per venue. Add **`home_venue_id`** (FK → venues; may be a real venue or Global for group staff). FKs to department/position/status/nationality. Include `created_by`, timestamps.
Seed `departments`, `positions`, `employment_statuses`, `nationalities` from the DATA lists in the mapping doc (import the full nationality list with ticket values).

## App-user ↔ staff link (strict) + home venue vs. access
- Add `staff.id` reference on `profiles` (nullable now, since existing admin has no staff row) — a user links to exactly one staff record, matched by work/personal email.
- **`staff.home_venue_id`** = the staff member's single home venue. It may be a real venue (**venue staff**) OR the **Global** venue (**group staff** — corporate/ownership/multi-venue people not on any venue's roster, e.g. the superadmin). See blueprint §5.
- **Home ≠ access.** A staff member's app access is granted separately via `user_permissions` and can span one venue, several, or all (`venue_id = null`/Global = group-wide). Do NOT tie access to `home_venue_id`.
- The venue staff **directory shows only that venue's venue staff**; group staff are managed at the Global level.
- This module OWNS staff; User & Access (next prompt) will require selecting a staff record to invite a user.

## Import the 48 staff
- Provide a one-off import: a server script or an in-app "Import from spreadsheet" action that parses the client's `STAFF Details` sheet and inserts staff rows for the Orilla venue, resolving department/position/status/nationality to the seeded lookups. Normalize the source header typos ("STATTUS"→status, "NACIONALITY"→nationality). Idempotent on `emp_no`. (The xlsx isn't in the repo — accept an uploaded file path or a pasted CSV.)

## UI (under Modules → Human Resources, venue-scoped)
- **Staff directory**: responsive table/cards — emp no, full name, department, position, status (colored badge), nationality, joining date. Search + filter by department/status. Mobile-friendly.
- **Staff detail**: full profile grouped into the 8 sections. Edit form (respect access level). Derived fields (age from DOB, worked time, vacation balance) computed in-app.
- **Lookups admin**: manage departments / positions / statuses / nationalities (admin only).
- Sensitive fields (passport, EID, bank, DOB, salary) gated by permission + RLS.

## Dashboard widgets (HR dashboard + feed global dashboard)
Expiry notifications (in-app now; email later via the notifications layer): passport expiry, EID expiry, medical insurance expiry, and the 5 training dates. Show items expiring within a configurable lead time, sorted by soonest.

## Permissions & audit
- Register the module in `lib/modules-registry.ts` (nav item "Human Resources", icon, allowed roles) and add feature keys: `hr/staff`, `hr/lookups`, `hr/salary` (sensitive), with access levels admin/edit/view/submit per §5.
- Every write goes through a server action and writes an `audit_log` row.

## Done =
Build passes; I can open Human Resources for Orilla, see the imported 48 staff, open a profile, and see expiry widgets. Commit to `david-dev`.
