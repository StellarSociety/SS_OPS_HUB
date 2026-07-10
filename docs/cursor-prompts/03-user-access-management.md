# Cursor prompt 03 — User & Access management (Settings)

Build order: **after HR core** (this depends on `staff` existing — every user links to a staff record).
Paste the block below into Cursor with the repo open.

---

Build **User & Access management** under Settings for SS Ops Hub (app-wide, superadmin/admin only). This replaces the raw-SQL permission setup. Follow `docs/ARCHITECTURE_BLUEPRINT.md` §5 (granular permission model), §14 (user lifecycle, per-venue toggles), and the HR link in `docs/hr-data-mapping.md`. Gate the whole area behind `is_app_admin()` / `app.global` admin.

## Strict user ↔ staff link (venue staff OR group staff)
- **Every app user must map to exactly one `staff` record.** You cannot invite a user without selecting one.
- The staff record is either **venue staff** (home = a real venue) or **group staff** (home = Global — corporate/multi-venue people not on a venue roster). Both are selectable when inviting. See blueprint §5.
- Inviting a user pulls **name + email from the chosen staff record** (reuse, don't re-enter). Store `profiles.staff_id`.
- If a staff member has no email yet, prompt to add it on the staff record first.
- Need a group-level person who isn't a venue employee? Create a **group staff** record (home = Global) in HR first, then invite them here.

## Home venue vs. access (important)
- A user's **home venue** comes from their staff record and is fixed. Their **access is separate** and can span multiple venues.
- Access is granted per venue in the permissions grid: one venue, several (multiple grants), or **all venues** via a group-wide grant (`venue_id = null`/Global). Do NOT derive access from home venue.

## Features
- **People / Users list**: shows staff-linked users — full name, email, home venue, linked staff (emp no + position + dept), status (active/disabled), and a summary of their permissions incl. which venues they can access. Search + filter (by venue, status). Responsive.
- **Invite user**: pick a staff record (searchable across venue staff + group staff) → confirm email → create the auth user via the **service-role client** and send an invite / set-password email through **Resend** (`RESEND_FROM_EMAIL`). No public signup. Handles resend-invite.
- **Assign permissions**: per user, an editable grid of grants — module + feature + access level (`admin`/`edit`/`view`/`submit`) + **venue scope** (a specific venue, several, or All venues/group-wide). Writes to `user_permissions` (one row per venue scope). Show modules/features from `lib/modules-registry.ts` so it stays in sync.
- **Activate / deactivate**: toggles `profiles.status`; disabled users can't log in (enforce in middleware/auth) but their data + audit history stay. Reversible.
- **Per-venue module toggles** (superadmin): enable/disable modules per venue (a `venue_modules` table the registry reads). New venues can launch with a subset.

## Rules
- All create/update/delete via server actions using the service client; each writes an `audit_log` row (actor, action, target, before/after).
- Never expose the service-role key to the client.
- Keep RLS intact; admin reads via `is_app_admin()`.
- Responsive (phone + desktop), on-brand.

## Done =
Build passes; as superadmin I can invite a user by selecting a staff member (email prefilled), grant them per-module/feature permissions, toggle their active status, and toggle modules per venue — all without touching SQL. Commit to `david-dev`.
