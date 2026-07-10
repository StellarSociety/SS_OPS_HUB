# SS Ops Hub — Architecture Blueprint

**Type:** Internal operations app (brand new)
**Purpose:** One internal hub to solve many operational workflows, organized as independent modules.
**Stack:** Next.js · Supabase · Resend · Vercel · Git
**Status:** Draft — high-level structure
**Last updated:** 2026-07-10

> Module list and role permissions are intentionally left open — David will define them later. Fill in bracketed `[…]` placeholders as those decisions land.

---

## 1. What this app is

**SS Ops Hub** is an internal, invite-only web app that houses many operational workflows under one roof. It is **module-driven**: each module is a self-contained app/feature, developed independently, and some modules communicate with each other (shared data, cross-module events).

**Design principles:**

- **Module-first.** Every workflow is its own module with its own routes, components, data, settings, and permissions. Modules ship one at a time.
- **Loosely coupled, selectively connected.** Modules are independent by default; when two need to talk, they do so through a defined shared layer (shared tables, events, or a service function) — not by reaching into each other's internals.
- **One shell, many apps.** A common app shell (auth, layout, navigation, settings) wraps every module.
- **Invite-only.** No self-service signup. Access is granted, never requested.
- **Venue-aware from day one.** The company runs **one venue today, more coming soon.** Every record carries a `venue_id` from the start so new venues are just added data — no migration. Launch with a single venue; later, enable cross-venue **consolidated reports & dashboards** on top of the same schema. (See §5A.)

---

## 2. Top-level app structure

Three areas make up the main navigation:

1. **Dashboards** — overview surfaces. A global dashboard plus (optionally) per-module dashboards.
2. **Modules / Apps** — the operational workflows. Each is a separately developed module.
3. **Settings** — two layers:
   - **App settings** — global config for the whole hub (org info, users/roles, email, integrations, branding).
   - **Module settings** — each module has its own settings scoped to that module.

```
SS Ops Hub
├─ Login (invite-only, email + password)
├─ Dashboards
│  ├─ Global dashboard
│  └─ Per-module dashboards (HR expiry/insurance/training alerts, etc.)
├─ Modules / Apps
│  ├─ Operational Checklists
│  ├─ Sales & Revenue
│  ├─ Human Resources        ← owns roles & people (see §5)
│  ├─ Venue Ops
│  ├─ GP & COS
│  └─ Management
└─ Settings
   ├─ App settings           ← global
   └─ Module settings        ← per module
```

---

## 2A. Modules catalog & sub-features

Six modules, each developed separately following the module pattern in §6. Sub-features are the workflows inside each module. This is David's current draft — more detail to come.

### 1. Operational Checklists
- Shift Report
- Opening Duties
- Closing Duties

### 2. Sales & Revenue
- Venue Daily Sales Record form
- Waiter Daily Sales Record form
- Closing Report

### 3. Human Resources
*Source of truth for people & roles — the app's role system links here (§5).*
- Staff details storage
- Staff pay package
- Staff costs
- Staff hierarchy *(linked to web-app roles)*
- Attendance tracking *(links to payroll)*
- Payroll — calculation · record · export
- Leave tracking — record
- Pay slips — record · export
- Staff personal documents — storage · notifications
- Public forms:
  - Recruitment application form
  - Onboarding form
  - Offboarding form
  - General forms (others)
  - Leave application form

### 4. Venue Ops
- Legal Docs — storage + calendar reminders
- Contractors — storage + calendar reminders
- Maintenance — log issues

### 5. GP & COS
- Invoices record
- Food cost calculation
- Beverages cost calculation

### 6. Management
- Approvals
- Management accounts
- P&L — Profit & Loss report
- Projects & Tasks

### Cross-module connections (early signals)
Some modules clearly feed each other — worth designing the shared seam (§6) early:

- **HR → Payroll ← Attendance:** attendance tracking feeds payroll calculations.
- **HR (roles/hierarchy) → whole app:** staff hierarchy drives web-app roles/permissions.
- **Sales & Revenue → Management (P&L):** daily sales records roll up into P&L / management accounts.
- **GP & COS → Management (P&L):** food/beverage costs and invoices feed P&L.
- **HR documents / Venue Ops docs → Dashboards:** expiry dates drive notification widgets.
- **Approvals (Management) ↔ many modules:** approvals may gate actions across modules.

---

## 2B. Dashboards

A global dashboard plus per-module dashboard surfaces. Draft widgets so far:

| Dashboard | Widgets (draft) |
|---|---|
| Operational Checklists | *[to define]* |
| Sales & Revenue | *[to define]* |
| Human Resources | Document expiry-date notifications · Insurance expiry-date notifications · Mandatory-training notifications |
| Venue Ops | *[to define]* — likely legal-doc & contractor reminder alerts |
| GP & COS | *[to define]* |
| Management | *[to define]* — likely pending approvals, P&L snapshot |

Dashboards read from modules; each module can publish widget(s) to its own dashboard and to the global dashboard via the modules registry (§7).

---

## 3. Tech stack & why

| Layer | Choice | Role |
|---|---|---|
| Frontend / SSR | **Next.js (App Router) + React + TypeScript** | Pages, UI, server actions, API routes |
| Styling | **Tailwind CSS** | Utility-first styling |
| Database + Auth | **Supabase (Postgres)** | Data, Row-Level Security, auth, storage |
| Transactional email | **Resend** | Invites, notifications, password resets |
| Hosting | **Vercel** | Git-based deploys, preview envs, serverless |
| Source control | **Git** | Version control, `main` + `dev` branch flow |

### File storage — cost-first, undecided

David is **cost-sensitive** here; final store is **not yet decided.** Requirement: cheap, and ideally reuse what the company already pays for.

**Options on the table:**

- **Zoho WorkDrive (company already uses it)** — likely cheapest since it's already paid for. Would integrate via Zoho's API to store/link staff docs, legal docs, invoices. Pro: no new bill, familiar to staff. Con: API integration work; access control lives partly in Zoho.
- **Cloudflare R2** — zero egress fees, very cheap storage. Best if we want files fully inside the app.
- **Supabase Storage** — simplest + tight RLS, but watch the ~5 GB/mo free egress cap.

**Recommendation:** decide per module when we build the first doc-heavy one (HR staff docs or Venue Ops legal docs). To stay flexible, store a **file-pointer abstraction** in Postgres (a `documents` table with `storage_provider` + `external_ref`/`url`) so the actual backend (Zoho / R2 / Supabase) can change without touching module code.

### General egress note

Supabase free tier has limited egress (~5 GB/mo) and can pause on inactivity. Keep Supabase for **auth + core relational data**; push heavy/static bytes to whichever cheap store we pick above. If DB egress itself becomes the bottleneck, Neon or Turso are fallback Postgres options.

---

## 4. Auth & login

- **Login page:** email + password (Supabase Auth).
- **Invite-only:** no self-registration. An admin/superadmin invites a person by email → Resend sends the invite → the person sets their password on first login.
- **Sessions:** SSR-safe Supabase client; protected routes redirect unauthenticated users to `/login`.
- **Password reset:** email link via Resend.

Invite flow (high level):

```
Superadmin/Admin creates invite ─▶ Resend sends email ─▶ user sets password ─▶ role assigned (from HR module) ─▶ access granted
```

---

## 5. Roles & permissions

Roles are **owned by the HR module** — HR is the source of truth for people and their roles; the rest of the hub reads from it.

| Role | Who | Scope (to be defined) |
|---|---|---|
| **Superadmin** | Owner of the app (David) | Full control over everything, including app settings and all modules |
| **Admin** | [TBD] | [TBD] |
| **Editor** | [TBD] | [TBD] |
| **User** | [TBD] | [TBD] |
| **Viewer** | [TBD] | [TBD] |

> The five named tiers above are convenience presets. Actual access is **granular per user, per module, per feature** — see the permission model below.

### Permission model (confirmed)

Access is assigned **per person, per module, and per feature within a module**. For each feature a user is granted an **access level**:

| Access level | Can do |
|---|---|
| **No access** | Feature/module hidden entirely |
| **Admin** | Full control of the feature (incl. others' entries + settings) |
| **Edit** | View + create + edit any entry in the feature |
| **View only** | Read-only |
| **Submit only** | Create entries and **edit only their own** submissions (not others') |

So a single person might be: *Admin in HR → Payroll, Edit in Sales → Daily Sales, Submit-only in Checklists → Shift Report, No access to GP & COS.*

**Data shape (high level):**

```
user_permissions
  user_id
  module_key        -- e.g. "hr", "sales"
  feature_key       -- e.g. "payroll", "daily_sales"
  access_level      -- admin | edit | view | submit
  (venue_id?)       -- optional: scope permission to a venue
```

"Submit only" implies **row ownership** — entries store `created_by`, and RLS lets that level read/update only its own rows.

**Enforcement in two layers:**

- **UI gates** — hide/disable modules, features, and buttons the user can't use.
- **RLS policies in Postgres** — the real security boundary (including `created_by` checks for submit-only). Never trust the client alone.

Permission checks resolve as: *authenticated user → HR record → per-module/per-feature grant → access level (+ ownership for submit-only)*.

---

## 5A. Multi-venue model (confirmed)

- **Now:** one venue. **Soon:** more venues.
- **Schema:** every operational record carries `venue_id` from day one, so adding a venue = adding data (no migration).
- **Data import:** built to expand — new venues can be onboarded/imported without schema changes.
- **Later:** consolidated cross-venue reports & dashboards layer on top of the same tables (group by / roll up across `venue_id`).
- **Permissions:** a user's access can optionally be scoped to specific venue(s) via the `venue_id` on the permission grant.

---

## 6. Module architecture (the repeatable pattern)

Every module follows the same shape so they're independent but consistent:

```
[module]/
├─ app/[module]/            # routes: list, detail, settings
├─ components/[module]/     # UI specific to this module
├─ lib/[module]/
│  ├─ store.ts              # data access / state
│  ├─ permissions.ts        # module-scoped role checks (reads HR roles)
│  └─ settings.ts           # module settings schema + access
└─ supabase/migrations/…    # this module's tables + RLS
```

**Module contract** (what every module exposes to the hub):

- A **nav entry** (icon, label, allowed roles).
- Optional **dashboard widget(s)** for the global dashboard.
- A **settings panel** registered under Settings → Module settings.
- Any **shared data / events** it publishes for other modules to consume.

**Module-to-module communication** (for the modules that talk to each other):

- **Shared tables** with clear ownership (one module owns, others read) — e.g. HR owns people/roles.
- **Events / hooks** — a module emits an event (e.g. "record approved") that another reacts to.
- **Service functions** — a thin internal API a module exposes for others to call, rather than direct table access.

Pick the lightest option that works; default to independence.

---

## 7. Folder structure

```
ss-ops-hub/
├─ apps/
│  └─ web/                      # Next.js app (the hub)
│     ├─ app/
│     │  ├─ (auth)/             # login, invite, reset
│     │  ├─ dashboard/          # global dashboard
│     │  ├─ settings/           # app settings
│     │  ├─ hr/                 # HR module (roles/people)
│     │  ├─ [module-2]/
│     │  └─ api/                # route handlers (webhooks, exports, invites)
│     ├─ components/
│     │  ├─ ui/                 # shared primitives
│     │  ├─ layout/             # sidebar, header, app shell
│     │  ├─ providers/          # context/store providers
│     │  └─ [module]/           # per-module UI
│     ├─ lib/
│     │  ├─ supabase/           # client + server + service-role clients
│     │  ├─ hr/                 # roles/people = source of truth
│     │  ├─ role-permissions.ts # resolves capabilities from HR roles
│     │  ├─ modules-registry.ts # registers modules: nav, widgets, settings
│     │  ├─ email/              # Resend templates + send helpers
│     │  └─ settings/           # app-level settings schema
│     └─ tsconfig.json
├─ supabase/
│  ├─ migrations/               # SQL migrations = schema source of truth
│  └─ config.toml
├─ .env.local                   # secrets (never committed)
└─ README.md
```

A **modules registry** (`lib/modules-registry.ts`) is the seam that lets each module plug its nav item, dashboard widgets, and settings panel into the shell without hard-wiring.

---

## 8. Data model (high level)

Every table gets Row-Level Security.

| Table | Owner | Purpose |
|---|---|---|
| `profiles` | HR | People: id, email, name, status |
| `roles` / `user_roles` | HR | Role definitions + assignments (source of truth) |
| `invites` | App | Pending invites: email, token, invited_by, expires_at |
| `app_settings` | App | Global config (key/value or typed rows) |
| `module_settings` | Per module | Settings scoped to a module |
| `[module tables]` | Each module | Owned by the module; RLS keyed to roles |
| `audit_log` (**required**) | App | actor, action, target, module, venue, before/after, timestamp (§14) |
| `venues` | App | Venue record + per-venue branding (logo, colors) (§14) |

Migrations live in `supabase/migrations/` and are the single source of truth — no manual schema edits in the dashboard.

---

## 9. Settings (two layers)

- **App settings** (global, superadmin/admin): organization info, user & role management (via HR), email/Resend config, integrations, branding, which modules are enabled.
- **Module settings** (per module): each module registers its own settings panel; scoped config lives in `module_settings` and is only editable by roles that module permits.

---

## 10. Email (Resend)

Transactional only. One `sendEmail()` helper + templates in `lib/email/`.

- User invites / onboarding
- Password reset / magic links
- Module notifications (e.g. approvals, alerts)

Verify a sending domain in Resend; keep the API key in Vercel env vars.

### Notifications — in-app + email (confirmed)

Time-sensitive alerts (doc expiry, insurance expiry, mandatory training, calendar reminders) are delivered **both in-app and by email**:

- **In-app:** dashboard widgets + a notification badge/center. Real-time when the user is logged in.
- **Email (Resend):** a **scheduled job** (e.g. daily cron on Vercel) checks upcoming expiries/reminders and emails the relevant people — so nothing is missed when they're not in the app.
- **Shared notifications layer:** a `notifications` table any module can write to, plus reusable "expiry reminder" logic (item, due date, lead time, recipients). Modules register what to watch; the layer handles surfacing + emailing.

---

## 11. Development & branching

**Code is written in Cursor.** Git is the source of control, deployed via Vercel.

**Branches:**

| Branch | Role | Deploys to |
|---|---|---|
| `main` | Production — stable, released code | Vercel production |
| `david-dev` | David's development branch | Vercel preview |
| `yusuf-dev` | Yusuf's development branch | Vercel preview |

```
Cursor (local)
   ├─ david-dev ──push──▶ Vercel preview ──PR──▶ main ──▶ Vercel production
   └─ yusuf-dev ──push──▶ Vercel preview ──PR──▶ main
```

- Each developer works on their own dev branch, pushes, and gets a Vercel preview URL to test.
- Changes merge into `main` via PR; `main` is the only branch that deploys to production.
- Keep `david-dev` and `yusuf-dev` regularly synced with `main` to avoid drift/conflicts.

**Supabase:** use a separate project (or Supabase branch) for staging vs. production so dev branches don't touch production data.

**Secrets:** managed in Vercel env vars + local `.env.local` in Cursor. Never commit `.env`.

---

## 12. Accounts & credentials

> Secrets live in `.env.local` (gitignored) — **never** in this doc or the repo. Template: `.env.example`.

| Service | Purpose | Status | Still needed |
|---|---|---|---|
| **GitHub** | Repo `StellarSociety/SS_OPS_HUB` | ✅ created | add Yusuf as collaborator |
| **Vercel** | Hosting `ss-ops-hub` (prj_ms8Z…) | ✅ created | link repo, set `main`=prod, add env vars |
| **Supabase** | DB + auth + storage (ymimzwpxqjluwbluglkv) | ✅ created | **secret/service-role key** + **DB password** |
| **Resend** | Transactional email | ✅ key created | **verify a sending domain** + set from-address |
| **Domain** | App URL + email sender | ⏳ to buy | register + point DNS |
| **Sentry** | Error monitoring | ⏳ to create | DSN (free tier) |
| **Zoho WorkDrive** | File storage (candidate) | ⏳ to confirm | API credentials (if chosen) |

**Immediate to-dos to finish setup:**
- Supabase → Project Settings → API keys → copy the **secret** key into `SUPABASE_SERVICE_ROLE_KEY`.
- Supabase → set/recover the **database password**, put it in `DATABASE_URL`.
- Buy a **domain**, then verify it in Resend and set `RESEND_FROM_EMAIL`.
- In Vercel → Project → Settings → Environment Variables, add the same keys for production.

Environment variables (populate once accounts exist):

```
NEXT_PUBLIC_SUPABASE_URL=          # [pending]
NEXT_PUBLIC_SUPABASE_ANON_KEY=     # [pending]
SUPABASE_SERVICE_ROLE_KEY=         # [pending] server-only, never exposed to client
RESEND_API_KEY=                    # [pending]
RESEND_FROM_EMAIL=                 # [pending]
NEXT_PUBLIC_APP_URL=               # [pending]
```

---

## 13. Build order (suggested)

1. Scaffold Next.js + Tailwind; connect Git + Vercel (deploy the empty shell first).
2. Supabase auth + `profiles`; **login page (email/password)** + **invite-only flow** via Resend.
3. App shell: sidebar, header, protected routes, the three areas (Dashboards / Modules / Settings).
4. **HR module first** — it owns roles & people, which everything else depends on.
5. Wire `role-permissions.ts` to resolve capabilities from HR.
6. Build the **modules registry** + **app settings** + **module settings** framework.
7. Ship the next module end-to-end using the module pattern as the template.
8. Repeat per module; add cross-module links only where two modules genuinely need to talk.
9. Harden: RLS review, audit log, error handling.

---

## 14. App-wide conventions (confirmed)

### Devices — responsive, phone + desktop
Built **mobile-friendly and desktop** from the start. Managers/back-office work on desktop; floor staff submit shift reports, sales records, and forms on phones. Every screen is responsive; input-heavy forms are designed to work well on a phone.

### Locale — UAE
- **Country:** UAE (single market for now).
- **Currency:** **AED** (money stored in minor units / with a currency field so multi-currency is possible later per §5A).
- **Language:** English.
- **Timezone:** **Asia/Dubai (GST, UTC+4)** — store timestamps in UTC, display in GST.
- Date/number formatting follows UAE English conventions.

### App identity
- **Product name:** **Stellar Society — Operational Hub** ("SS Ops Hub" for short; **SS = Stellar Society**).
- **Login wordmark:** "Stellar Society / Operational Hub", set in a **distinctive display serif** (different from the UI's sans) for a premium feel — e.g. Playfair Display / Cormorant / Fraunces via Google Fonts. The UI body/chrome stays clean sans (§14 devices).
- App-level logo/wordmark assets live in `3. DESIGN/brand/app/`.

### Branding — per-venue theming
David has **logos and colors that differ per venue.** So branding is **venue-scoped**, not global:

- A `venue` record holds its **logo, primary/secondary colors, and display name**.
- The app shell themes itself from the active venue (logo in header, accent colors via CSS variables / Tailwind theme tokens).
- Base UI stays a clean, neutral system (leaning **shadcn/ui + Tailwind**) so per-venue colors drop in without redesign.
- Emails (Resend) and exported PDFs/reports also pull the venue's logo + colors.
- Brand assets live under `3. DESIGN/brand/<venue>/`.

**Venue 1 — Orilla** (see `3. DESIGN/brand/orilla/BRAND.md`):
- Primary olive `#808A3E`, dark olive `#5E6630`, cream `#F0F3DD`, deep-olive text `#3D421F` *(approx — refine from source art)*.
- Logos: badge (circle + cream "O" wave) for the venue tile, standalone O-mark for favicons, full "Orilla" wordmark for headers/emails/PDFs.
- Elegant Didone-style display serif wordmark.
- *Files to be saved into the brand folder — see BRAND.md.*

### Audit — full audit log
Every create / edit / delete across **all modules** is recorded. This is a hard requirement given approvals, payroll, and finance.

```
audit_log
  id
  actor_id          -- who
  action            -- create | update | delete | approve | export | login …
  module_key
  entity            -- table/record type
  entity_id
  venue_id
  before / after    -- JSON snapshot or changed fields (for edits)
  created_at        -- UTC
```

Written server-side (in server actions / API routes), append-only, and readable by Admin/Superadmin. Feeds accountability and can back an in-app activity history per record.

### Login security — password only (for now)
- Launch with **email + password** (Supabase Auth), no 2FA yet.
- **But build auth 2FA-ready:** Supabase Auth supports MFA, so we don't code ourselves into a corner — enabling 2FA later (start with Superadmin/Admin) should be a config + UI step, not a rebuild.
- Sensible defaults from day one: password strength rules, secure session cookies, password reset via Resend.

### User lifecycle — deactivate, keep data
- Leavers are **deactivated, not deleted.** A `status` (active / disabled) on the user/profile blocks login while **their entries stay intact and attributed to them** (essential for audit + payroll history).
- Deactivation is instant (revokes access) and reversible.
- Ties to HR: an offboarding action in HR can flip the account to disabled.

### Per-venue module & feature toggles
- **Superadmin can enable/disable modules — and features within them — per venue.**
- New venues can launch with a subset (e.g. Checklists + Sales) and grow into the rest.
- Data shape: a `venue_modules` (and/or `venue_features`) table the modules registry (§7) reads to decide what shows for the active venue.
- Resolution order for what a user sees: **venue has module enabled → user has permission → access level** (§5).

### Reliability — monitoring + backups (from day one)
- **Error monitoring:** Sentry (free tier) wired into the Next.js app to catch runtime errors early.
- **Backups:** rely on Supabase's built-in backups **plus** a scheduled export (e.g. nightly DB dump / CSV export to the chosen file store) so we own a copy independent of the provider.
- Optional later: uptime ping on the production URL.

---

## 15. UX flow & visual design

**Design intent:** very clean, modern, premium. Minimal chrome, generous whitespace, smooth **animations/transitions** throughout — the app should feel as polished as a native macOS experience.

### Entry flow

```
1. Login  ──▶  2. Venue Selection  ──▶  3. App shell (for the chosen venue)
                     │
                     └─ "Global" venue ──▶ consolidated view across all venues
```

### 1. Login screen
- **Black background**, full-bleed, distraction-free.
- Login fields (email + password) **centered** on the page in a tidy card/stack.
- Subtle entrance animation (fade + slight rise); focus/hover micro-interactions on inputs and button.
- Clean logo/wordmark above the fields.

### 2. Venue selection ("MacBook login" feel)
- **Beige background** with **translucent, blurred (glassmorphism)** panels — frosted-glass cards, soft depth. Reminiscent of the macOS login / user picker.
- Each venue shown as a **rounded logo** (circular/squircle) with a **thin stroke border** and a **light drop shadow**, the **venue name below** it.
- Venues laid out as a centered grid/row; hover/focus gently **scales + lifts** the tile, selected tile animates forward before transitioning into the app.
- Smooth page transition (blur/scale/fade) from selection into the venue's themed shell.
- Respects per-venue branding (§14): the logo shown here is the venue's own.

### 3. The "Global" venue
- A special, always-present entry in venue selection called **"Global."**
- Selecting it opens a **consolidated view across all venues** — aggregated dashboards and reports (roll-ups over `venue_id`, §5A).
- For now it's a **placeholder/scaffold for future references** (one venue live today); it's wired so that as venues are added, Global automatically reflects them.
- Access to Global is permission-gated (typically Superadmin/Admin).

### 4. Global settings
- Reached after/alongside venue context: **global settings** = configuration applied **across the whole hub** (org info, users & roles, email, integrations, per-venue module toggles, default branding).
- Distinct from **module settings** (§9), which are scoped to a single module.
- Global settings are Superadmin/Admin only.

### Animation & polish guidelines
- Use a consistent motion system (e.g. Framer Motion): ease-out entrances, spring on interactive elements, ~150–300ms transitions.
- Page/route transitions between login → venue select → shell should feel continuous (shared fade/blur), not hard cuts.
- Prefers-reduced-motion respected for accessibility.
- Keep it tasteful: motion supports focus, never distracts.

### Screens to design (checklist)
- [ ] Login (black, centered)
- [ ] Venue selection (beige, glassmorphism, animated tiles) + **Global** tile
- [ ] App shell per venue (themed header/sidebar)
- [ ] Global settings
- [ ] Global (consolidated) dashboard scaffold

---

## Decisions locked

- [x] **Modules** — six modules + sub-features drafted (§2A).
- [x] **Multi-venue** — single venue now, venue-aware schema (`venue_id` everywhere), consolidated reports later (§5A).
- [x] **Permissions** — granular per-user / per-module / per-feature, levels: Admin · Edit · View · Submit-only (own entries) (§5).
- [x] **Notifications** — in-app + email, via a shared notifications layer + scheduled reminder job (§10).
- [~] **File storage** — cost-first, undecided; leaning on existing **Zoho WorkDrive**, abstracted behind a `documents` pointer table (§3).
- [x] **Devices** — responsive, phone + desktop (§14).
- [x] **Locale** — UAE · English · AED · Asia/Dubai (§14).
- [x] **Branding** — per-venue logos & colors, venue-scoped theming; clean shadcn/ui base (§14).
- [x] **Audit** — full audit log across all modules (§14).
- [x] **Login security** — password only now, but built 2FA-ready (§14).
- [x] **User lifecycle** — deactivate (keep data), not delete (§14).
- [x] **Per-venue toggles** — modules/features switchable on/off per venue (§14).
- [x] **Reliability** — Sentry monitoring + backups from day one (§14).
- [x] **UX flow & visual design** — clean/modern; login (black, centered) → venue selection (beige glassmorphism, animated) → shell; "Global" venue for consolidated view; global vs module settings (§15).

## Open questions (David to define)

- [ ] **File storage — final call** — confirm Zoho WorkDrive vs. R2 vs. Supabase, and get Zoho API access if we go that way.
- [ ] **Per-venue brand assets** — logos + color palettes for each venue.
- [ ] **Sub-feature detail** — fields/forms/logic per sub-feature; fill in Dashboards widgets marked *[to define]* (§2B).
- [ ] **HR ↔ payroll/attendance logic** — how attendance feeds payroll calculations.
- [ ] **Approvals flow** — what Approvals (Management) gates across modules, and who approves what.
- [ ] **Accounts & keys** — provision Supabase / Vercel / Resend / Git (+ Zoho) and share keys (§12).
