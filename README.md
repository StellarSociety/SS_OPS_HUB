# Stellar Society — Operational Hub (SS Ops Hub)

Internal, invite-only operations app for Stellar Society. One hub, many independent modules, multi-venue ready.

**Stack:** Next.js (App Router, TS) · Supabase (Postgres, Auth, RLS) · Resend · Vercel · Sentry · Git.
**Built in:** Cursor. **Branches:** `main` (prod) ← `david-dev`, `yusuf-dev` (Vercel previews).

## Where things are

| Path | What |
|---|---|
| [`docs/ARCHITECTURE_BLUEPRINT.md`](docs/ARCHITECTURE_BLUEPRINT.md) | Full architecture & decisions — **read this first** |
| [`docs/brand/orilla/BRAND.md`](docs/brand/orilla/BRAND.md) | Orilla (venue 1) brand: palette, logos, type |
| `docs/brand/app/` | App-level (Stellar Society) logo/wordmark assets |
| `docs/brand/orilla/` | Orilla logo files (`orilla-badge.png`, `orilla-mark.png`, `orilla-wordmark.png`) |

## Locked decisions (summary)

- **Modules:** Operational Checklists · Sales & Revenue · Human Resources · Venue Ops · GP & COS · Management. Each developed separately; some talk to each other. HR owns people & roles.
- **Structure:** Dashboards · Modules · Settings (app-wide + per-module).
- **Auth:** email + password, invite-only (no self-signup), built 2FA-ready.
- **Permissions:** granular per user / per module / per feature — Admin · Edit · View · Submit-only (own entries).
- **Multi-venue:** `venue_id` on every record; one venue now, consolidated cross-venue reports later. A special **Global** venue aggregates all.
- **Users:** deactivate (keep data), never delete.
- **Per-venue toggles:** Superadmin enables/disables modules & features per venue.
- **Locale:** UAE · English · AED · Asia/Dubai (store UTC).
- **Devices:** responsive, phone + desktop.
- **Branding:** per-venue logos/colors; app wordmark in a display serif.
- **Notifications:** in-app + email (Resend), scheduled reminder job.
- **Audit:** full audit log across all modules.
- **Reliability:** Sentry + backups from day one.
- **File storage:** cost-first, undecided (Zoho WorkDrive candidate) — abstracted behind a `documents` pointer table.

## Open items

- Final file-storage choice + Zoho API access.
- Per-venue brand assets (drop logos into `docs/brand/<venue>/`).
- Provision accounts + keys (Supabase, Vercel, Resend, Sentry, Git).
- Per-module detail (fields, forms, logic) — to be defined module by module.

## Local development

```bash
pnpm install
# Apply migration: supabase db push  (or run SQL from supabase/migrations/ in Supabase dashboard)
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### First-time Supabase setup

1. Run the migration in `supabase/migrations/20260710000000_initial_schema.sql` against your Supabase project.
2. Create a user in Supabase Auth (Dashboard → Authentication → Users → Add user).
3. To access **Global**, grant admin permission:

```sql
INSERT INTO public.user_permissions (user_id, module_key, feature_key, access_level)
VALUES ('<your-user-uuid>', 'app', 'global', 'admin');
```

4. Copy `.env.example` → `.env.local` and fill in keys (already done locally).

### App structure

```
apps/web/          # Next.js hub
supabase/          # migrations + config
docs/              # architecture & brand
```
