# Cursor task — Make the Zoho WorkDrive connection reliable & permanent (Orilla / people@ Self Client)

## Goal
Set up the Orilla venue's Zoho WorkDrive connection so it connects **once** and stays
permanently connected, and fix the setup flow so this can't silently break again. The
current UI-based grant-code exchange is fragile; add a scripted/server path plus UX
guardrails.

## Background (what actually happens today)
The app authenticates to Zoho WorkDrive with an OAuth **Self Client**:
`client_id` + `client_secret` + a long-lived `refresh_token`. On every request it calls
`POST https://accounts.zoho.<dc>/oauth/v2/token` with `grant_type=refresh_token` to get a
short-lived access token.

Relevant files (all under `apps/web`):
- `lib/hr/workdrive/token.ts` — `requestToken`, `ensureAccessToken`, `exchangeAuthorizationCode`, `credentialsFromSettings`, error formatting.
- `lib/hr/workdrive/settings.ts` — store load/normalize, `zohoAccountsHost`, region hosts.
- `lib/hr/workdrive/env.ts` — env credential resolution.
- `lib/hr/workdrive/constants.ts` — verified folder IDs.
- `lib/actions/hr-workdrive.ts` — `saveWorkDriveConnection`, `exchangeWorkDriveGrantCode`, `testWorkDriveConnection`, `persistStore`.
- `components/hr/workdrive-connection-panel.tsx` — the Connection form (Client ID/secret/refresh token/grant code, Exchange/Test/Save buttons).
- Secrets are encrypted with `lib/email/secret` (`encryptSecret` / `decryptSecret`).
- Store is persisted in Supabase table `hr_venue_settings` (`venue_id`, `key = workDrive`, `value = jsonb store`).

## Root-cause rules — do NOT regress these
The `client_id`, `client_secret`, and `refresh_token` **must all belong to the same Zoho
Self Client app**. Map the Zoho OAuth errors precisely (surface these to the user):
- `invalid_client` → client_id and client_secret are from different apps, or client_id is stale/deleted.
- `invalid_client_secret` → secret does not match the client_id (e.g. secret left blank so the old stored secret was reused).
- `invalid_code` → grant code is expired or already used. Grant codes are **single-use** and expire (generate with 10-minute expiry; exchange immediately).
- Self Client refresh tokens do **not** expire on a timer — they only die if the client secret is regenerated in the Zoho API Console or the token is revoked.

## Known-good credentials to configure (Orilla)
- Zoho data center / region: `com`
- Self Client owner: `people@orillarestaurant.com` (shows as "Human Resources" in Zoho API Console)
- Client ID: `1000.PY74IWIDBOA1V05O8HOSX3NHK5ORYE`
- Client Secret: read from env `ZOHO_WD_CLIENT_SECRET` (I will put it in `.env.local`; do NOT hardcode or commit it)
- Scopes: `WorkDrive.files.ALL,WorkDrive.teamfolders.READ`
- Venue slug: `orilla` (resolve to `venue_id`); WorkDrive connection id: `zoho`
- Test folder ID (Employee Documents): `upon5e64f1834cda9496c9a3f4f3dc8c5074f`
- Team folder (SS-OPS-HUB) ID: `1xt10a426e6ba88e64e1caa7e75e21411947f`

## Deliverables

### 1. A one-shot setup script (bypasses the flaky UI)
Add `apps/web/scripts/setup-workdrive-people.mjs` (runnable with `node` / `tsx`) that:
1. Reads `ZOHO_WD_REGION`, `ZOHO_WD_CLIENT_ID`, `ZOHO_WD_CLIENT_SECRET`, `ZOHO_WD_GRANT_CODE`,
   `SUPABASE_SERVICE_ROLE_KEY`/service secret, and `SECRET_ENCRYPTION_KEY` from env.
2. Exchanges the grant code: `POST https://accounts.zoho.com/oauth/v2/token`
   with `grant_type=authorization_code`, `client_id`, `client_secret`, `code`. Fails loudly
   with the exact Zoho error if `refresh_token` is missing.
3. Encrypts `client_secret` and `refresh_token` with the app's `encryptSecret`.
4. Upserts them into the `orilla` venue's `hr_venue_settings` WorkDrive store for connection
   `zoho` (region `com`, the client id above), leaving folder config intact.
5. Verifies by refreshing an access token and listing the test folder
   (`upon5e64f1834cda9496c9a3f4f3dc8c5074f`); prints CONNECTED + item count, or the error.
Document usage at the top of the file. This lets setup complete in one command right after
generating a fresh grant code, with no browser fiddling.

### 2. Harden the Connection panel UX (`workdrive-connection-panel.tsx`)
- When a grant code is present in the field, make **Exchange code** the visually primary
  action; keep Test/Save secondary. Today it's an easy-to-miss outline button.
- Do NOT clear the pasted grant code on Save/Test/router.refresh — only clear it after a
  **successful** exchange.
- Fix the misleading helper text "Code expires in ~3 minutes" — recommend generating a
  10-minute code and exchanging immediately.
- Add a short inline explainer: "Test and Save do not exchange the code — click Exchange to
  create the refresh token."

### 3. Clearer error surfacing (`token.ts` / `hr-workdrive.ts`)
- Keep distinct, human-readable guidance for `invalid_client`, `invalid_client_secret`, and
  `invalid_code` (see rules above), including which field to fix.
- On successful exchange, set `connectionStatus = connected`, stamp `lastVerifiedAt`, clear
  `lastError`, and run a folder-list verify.

## Acceptance criteria
- Running the setup script with a fresh grant code results in a stored refresh token and a
  passing verify (lists the test folder) for the `orilla` / `zoho` connection.
- "Test connection" in the UI then returns CONNECTED without re-exchanging.
- No secrets are committed; the secret and grant code come from env only.
- Re-running "Test connection" days later still works (refresh-token path), proving permanence.
