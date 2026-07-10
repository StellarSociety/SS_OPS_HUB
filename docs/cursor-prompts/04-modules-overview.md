# Cursor prompt 04 — Modules overview (app thumbnails)

Purpose: show the **primary UI** — all six modules as tiles/thumbnails on the Modules landing page —
so we can see how the hub looks before each module is fully built. Independent of the other prompts;
can be built anytime. Paste the block below into Cursor with the repo open.

---

Build the **Modules overview** page (the landing grid under "Modules" in the app shell) for SS Ops Hub. Follow `docs/ARCHITECTURE_BLUEPRINT.md` §2 (structure), §2A (module list), §14 (per-venue theming + toggles), §15 (clean modern visual design). This is the primary navigation surface into the apps.

## Layout
- A responsive grid of **module tiles/thumbnails** — clean, modern, on-brand for the active venue (colors from the `venues` row), with subtle Framer Motion hover lift/scale (respect reduced-motion). Phone + desktop.
- Each tile shows: an icon, the module name, a one-line description, and a status chip. Clicking an enabled module routes into it; disabled/not-yet-built modules show a "Coming soon" state (not clickable).

## The six modules (from §2A)
Drive the grid from `lib/modules-registry.ts` so it stays in sync. Seed all six:
1. **Operational Checklists** — Shift reports, opening & closing duties. (coming soon)
2. **Sales & Revenue** — Daily sales records & closing reports. (coming soon — template pending)
3. **Human Resources** — Staff, departments, documents, expiries. (live once HR module built)
4. **Venue Ops** — Legal docs, contractors, maintenance. (coming soon)
5. **GP & COS** — Invoices, food & beverage cost. (coming soon)
6. **Management** — Approvals, accounts, P&L, projects. (coming soon)
Pick an apt Tabler/Lucide icon per module.

## Gating
- Only show a tile if the module is **enabled for the active venue** (`venue_modules`, if present) AND the user has at least `view` on it (per `user_permissions` + `lib/role-permissions.ts`). Superadmin sees all.
- The Global venue shows a consolidated variant (cross-venue) — for now, same grid with a "consolidated" label; wire real roll-ups later.

## Done =
Build passes; opening "Modules" for Orilla shows the six tiles with correct enabled/coming-soon states, themed to the venue, responsive, with hover animation. Commit to `david-dev`.

---

## Note for later — Sales & Revenue
David will send a template for the Venue Daily Sales / Waiter Daily Sales / Closing Report forms.
A dedicated prompt (05) will spec that module from the template. Until then Sales stays "coming soon".
