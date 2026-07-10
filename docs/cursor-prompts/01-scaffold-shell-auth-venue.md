# Cursor prompt 01 — Scaffold: shell + auth + venue selection

Paste the block below into Cursor (Composer / agent mode) with this repo open.
Goal: a clean, deployable starting point — project scaffold, Supabase auth (invite-only),
the black login screen, and the beige Orilla/Global venue selection. No business modules yet.

---

You are building **SS Ops Hub** (product name: "Stellar Society — Operational Hub"), an internal, invite-only, multi-venue operations web app. Read `docs/ARCHITECTURE_BLUEPRINT.md`, `docs/brand/app/APP_BRAND.md`, and `docs/brand/orilla/BRAND.md` in this repo first and follow them. This task is ONLY the scaffold, auth, and venue selection — do not build any business modules yet.

## Stack & setup
- Next.js (App Router) + TypeScript + Tailwind CSS.
- shadcn/ui for base components. Framer Motion for animations.
- Supabase for auth + DB (`@supabase/supabase-js` + `@supabase/ssr`). Create three clients in `lib/supabase/`: `client.ts` (browser), `server.ts` (server components/actions), `service.ts` (service-role, server-only).
- Read all secrets from env (already in `.env.local`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `NEXT_PUBLIC_APP_URL`. Never hardcode keys.

## Folder structure (per blueprint §7)
Create `apps/web/` as the Next.js app with: `app/(auth)/`, `app/(app)/dashboard/`, `app/(app)/settings/`, `app/select-venue/`, `app/api/`, plus `components/ui`, `components/layout`, `components/providers`, `lib/supabase`, `lib/i18n`, `lib/role-permissions.ts`, `lib/modules-registry.ts`.

## Auth (invite-only, email + password)
- Login page at `/login`: **black full-bleed background**, login card **centered**. Email + password fields, a "Sign in" button (Orilla olive `#808A3E`). Wordmark "Stellar Society / Operational Hub" above the fields in a **display serif** (add Playfair Display via `next/font/google`; keep the rest of the UI sans). Subtle fade+rise entrance (Framer Motion).
- **No public sign-up.** No signup page/link. Accounts are created by invite only.
- Password reset flow via email.
- Middleware: protect all routes except `/login` and auth callbacks; unauthenticated → `/login`. After login → `/select-venue`.
- Build auth so 2FA can be enabled later (use Supabase Auth MFA-capable setup), but don't enable 2FA now.

## Venue selection (`/select-venue`)
- **Beige background** (`#E9E3D6`), macOS-login feel with **translucent frosted-glass** (glassmorphism) tiles.
- Each venue = a **rounded (circular) logo** with a thin light stroke + soft drop shadow, **venue name below** in the serif. Hover/focus: tile scales up + lifts (Framer Motion); on select, animate forward then route into the venue's shell.
- Fetch venues from a `venues` table (see schema below). Always render a special **"Global"** tile last (world icon) → routes to a consolidated view scaffold (`/dashboard?venue=global`); gate Global to Superadmin/Admin.
- Orilla tile uses its badge logo from `docs/brand/orilla/` (fall back to an inline SVG placeholder if the PNG isn't present yet).
- Respect `prefers-reduced-motion`.

## App shell (post-venue)
- After choosing a venue, load `/dashboard` inside an app shell: sidebar with the three areas — **Dashboards**, **Modules**, **Settings** — themed by the active venue's colors (CSS variables from the `venues` row). Header shows the venue logo/name + a venue switcher. Put placeholder empty states in each area (no modules built yet).
- Store the active venue in context (`components/providers`) + a cookie so it persists.

## Minimal DB (Supabase migration)
Create a migration under `supabase/migrations/` with RLS enabled on every table:
- `venues` (id, slug, name, is_global bool, primary_color, secondary_color, logo_url, created_at)
- `profiles` (id → auth.users, email, full_name, status text default 'active', created_at)
- `user_permissions` (id, user_id, venue_id nullable, module_key, feature_key, access_level check in ('admin','edit','view','submit'), created_at)
- `audit_log` (id, actor_id, action, module_key, entity, entity_id, venue_id, before jsonb, after jsonb, created_at)
Seed one venue row: Orilla (slug `orilla`, colors olive `#808A3E`/cream `#F0F3DD`) and the Global venue (is_global = true). Add RLS: authenticated users read venues; a user reads only their own profile + permissions; audit_log is insert-only from server, readable by admins.

## Conventions
- Locale: UAE, English, AED, timezone Asia/Dubai — store timestamps UTC, display GST.
- Responsive: works on phone + desktop; forms usable on mobile.
- All writes go through server actions/route handlers and write an `audit_log` row.
- Keep it clean and minimal; this is the foundation the modules plug into via `lib/modules-registry.ts`.

## Done =
`pnpm dev` runs; I can log in with a Supabase-created user, land on `/select-venue`, pick Orilla or Global, and see the themed empty app shell. Commit to `david-dev`.
