# Cursor prompt 05 — Access-model fix (submit semantics + sensitive fields)

Small but important correction found in the integrity review. Do this **before** building
submit-heavy modules (Sales & Revenue, Operational Checklists). Paste into Cursor with the repo open.

---

Fix two issues in the SS Ops Hub access model. Follow `docs/ARCHITECTURE_BLUEPRINT.md` §5.

## 1. `submit` access must grant entry to a feature (not sit below `view`)
Currently `access_level_rank` and the TS `hasPermission` rank `submit` (1) below `view` (2), so a user granted only `submit` fails every "view" gate — they can't see the module tile or the feature they're supposed to submit into. That contradicts the model: **submit-only = can enter the feature, create entries, and view/edit ONLY their own rows.**

Change the semantics so `submit` is an **entry-capable** level:
- A `submit` grant should satisfy "can access this feature / see the tile" checks (module tile visibility, feature nav, and read access to the feature's list — but scoped to own rows).
- Keep the ordering for *write breadth* (`view` < `edit` < `admin`) but treat `submit` as a **separate axis**: it grants create + read-own + edit-own, independent of the view/edit/admin ladder.
- Concretely:
  - `canAccessModule` / `canAccessFeature` should return true if the user has **any** of `submit | view | edit | admin` for that feature at the venue.
  - For row reads/updates under a `submit` grant, enforce `created_by = auth.uid()` (RLS `USING`/`WITH CHECK`), so submit users only see/modify their own entries.
  - `edit`/`admin` see all rows; `view` sees all rows read-only; `submit` sees only own rows (read + update), plus can insert.
- Update both `lib/role-permissions.ts` / `lib/module-access.ts` (TS) and the SQL `access_level_rank` / `has_feature_permission` usage so UI and RLS agree. Add a helper like `has_feature_access(...)` (entry-capable: submit OR ≥view) distinct from `has_feature_permission(..., min_level)` (ladder check) and use each where appropriate.
- Add a migration for the SQL changes; do not edit already-applied migrations — create a new one.

## 2. Note sensitive-field handling (no code change required unless quick)
Salary/passport/EID/bank are currently hidden in the app layer via the `hr/salary` grant, which is correct, but they're not protected at the DB column level. Leave as-is for now, but add a short code comment on the staff store noting that reads of sensitive columns must stay server-side and gated by `hr/salary`, and never selected into a client payload without that grant. (Field-level DB security is a later task.)

## Verify
- A user granted only `hr/staff = submit` at Orilla: sees the HR tile, can open the staff feature, can create a staff entry, and sees/edits only entries they created — but not others'.
- A user with `view` still sees all rows read-only; `edit`/`admin` unchanged.
- UI gates and RLS agree (no case where the UI shows something RLS then blocks).

Build passes; commit to `david-dev`.
