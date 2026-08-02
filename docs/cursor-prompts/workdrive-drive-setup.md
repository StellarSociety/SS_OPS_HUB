# Cursor prompt — populate SS Ops Hub WorkDrive "Drive Setup"

Paste everything below the line into Cursor. It seeds the HR → Settings → Data Management → **Drive Setup** config with values verified live in WorkDrive on 2026-08-02, and wires the WorkDrive client for a passport-upload smoke test.

---

## Context

We store HR staff documents in **Zoho WorkDrive** (never Supabase Storage — Supabase holds metadata only). The full research brief is the source of truth: **`docs/zoho-workdrive-integration-brief.md`** (read it first). Zoho's authoritative OpenAPI spec is at **https://github.com/zoho/zohoworkdrive-oas** (`v1.0/files_folders.json`, `team_folder.json`, `chunk_upload.json`) — build request/response types from it; do not invent fields.

Data center: **US (`.com`)**. REST base: `https://www.zohoapis.com/workdrive/api/v1`. All JSON:API calls send header `Accept: application/vnd.api+json` (omitting it → HTTP 415).

## Verified live values (hardcode as defaults / seed data)

| Config key | Value |
|---|---|
| `region` | `com` |
| `teamFolderName` | `SS-OPS-HUB` |
| `teamFolderId` | `1xt10a426e6ba88e64e1caa7e75e21411947f` |
| `hrFolderName` | `Human Resources` |
| `hrFolderId` (per-employee parent — create folders directly here) | `1xt10ad4117f7c0ee45d99a23fc3456e5cd34` |
| Team ID (rarely needed) | `gcdaw6ac36b8a97be4387bfd0a3d3e13866d7` |
| `employeeFolderTemplate` | `{emp_no} — {full_name}` |
| `fileNameTemplate` | `{doc_label}_{emp_no}_{yyyy-MM-dd}` (append original extension) |
| `autoCreateFolders` | `true` |
| Emp-no format | `ORL####` (e.g. `ORL0014`) |

`docSubfolders[]` / docType → subfolder + `{doc_label}` mapping to seed:

```
passport          → Passport            (Passport)
emirates_id       → Emirates ID         (EmiratesID)
bank              → Bank                (Bank)
offer_letter      → Offer Letter        (OfferLetter)
contract          → Contract            (Contract)
addendum          → Addendums           (Addendum)
eresidence        → eResidence Card     (eResidence)
ohc               → OHC                 (OHC)
medical_insurance → Medical Insurance   (MedicalInsurance)
training_cert     → Training Certificates (TrainingCert)
other             → Others              (Other)
```

## Folder model (confirmed)

Per-employee folders are created directly under **SS-OPS-HUB → Human Resources** (`hrFolderId = 1xt10ad4117f7c0ee45d99a23fc3456e5cd34`), which is empty and dedicated to the app. No migration. Keep the parent as a single config constant so it can be swapped later. **Do NOT target the legacy standalone `HUMAN RESOURCES` team folder (`sae44cf1e2c4af89c4b2db0cbfcf01bcb006a`)** — leave it untouched.

## Secrets (DO NOT hardcode — env only, server-side)

These don't exist yet; David generates them from a **Self Client** at `api-console.zoho.com` (logged in as `people@orillarestaurant.com`, scopes `WorkDrive.files.CREATE,WorkDrive.files.UPDATE,WorkDrive.files.READ,WorkDrive.teamfolders.READ`). Add to `.env.local` / Vercel env, never `NEXT_PUBLIC_*`:

```
ZOHO_WD_REGION=com
ZOHO_WD_CLIENT_ID=
ZOHO_WD_CLIENT_SECRET=
ZOHO_WD_REFRESH_TOKEN=
ZOHO_WD_TEAM_FOLDER_ID=1xt10a426e6ba88e64e1caa7e75e21411947f
ZOHO_WD_HR_FOLDER_ID=1xt10ad4117f7c0ee45d99a23fc3456e5cd34
```

## Tasks

1. **Config/seed.** Populate the Drive Setup settings (DB row or config module — match the existing scaffold in HR → Settings → Data Management) with the verified values above. Encrypt `clientSecret` and `refreshToken` at rest; read them from env, never render to the client.

2. **WorkDrive client** at `apps/web/lib/hr/workdrive/`:
   - `token.ts` — `ensureAccessToken()`: refresh via `POST https://accounts.zoho.com/oauth/v2/token` (`grant_type=refresh_token`, client id/secret, refresh token). Cache the access token ~55 min in memory (access token lives 1h). Never store access token as env.
   - `client.ts` — thin fetch wrapper: base `https://www.zohoapis.${region}/workdrive/api/v1`, `Authorization: Zoho-oauthtoken <token>`, `Accept: application/vnd.api+json` (+ `Content-Type: application/vnd.api+json` for JSON POST/PATCH). Types derived from the OAS repo.
   - Operations: `createFolder(name, parentId)` → `POST /files` body `{"data":{"type":"files","attributes":{"name","parent_id"}}}`; `listChildren(folderId)` → `GET /files/{id}/files?page[limit]=50&page[offset]=0`; `getMetadata(id)` → `GET /files/{id}`; `renameFile(id, name)` → `PATCH /files/{id}` body `{"data":{"type":"files","attributes":{"name"}}}`; `uploadFile({parentId, buffer, fileName, mime})` → `POST /upload` multipart fields `parent_id`, `content`, `filename` (URL-encoded), `override-name-exist=false`.

3. **Upload flow** `uploadStaffDoc({empNo, fullName, docType, fileBuffer, ext, mime})`:
   ensure token → resolve/create `{emp_no} — {full_name}` folder under `HR_FOLDER_ID` (list-then-create; guard against duplicate names) → resolve/create the docType subfolder → build final name from `fileNameTemplate` + `ext` → upload → if returned `FileName` ≠ target, `renameFile` → return `{ workdriveFileId, permalink, path }`.

4. **Persist metadata to Supabase** (not the file): `workdriveFileId` (= `resource_id`), `permalink`, `staffId`, `empNo`, `docType`, `subfolderId`, `fileName`, `uploadedAt`. Add the table/migration if it doesn't exist.

5. **Server-side download proxy** route handler that streams bytes from WorkDrive so previews never expose the token or a public link. No external share links.

## Smoke test (implement + run first)

1. `ensureAccessToken()` returns a token.
2. `listChildren('1xt10ad4117f7c0ee45d99a23fc3456e5cd34')` returns the Human Resources folder's children (proves auth + folder access).
3. Create folder `ORL0056 — Test Staff` under it, then a `Passport` subfolder.
4. Upload a sample PDF as `Passport_ORL0056_2026-08-02.pdf` with `override-name-exist=false`; capture `resource_id` + `Permalink`.
5. If the uploaded name doesn't match, `renameFile` to fix it (confirms whether the `filename` multipart field sticks — see brief §G-1).

## Constraints

- No files to Supabase Storage — WorkDrive only.
- No secrets in `NEXT_PUBLIC_*`; encrypt `clientSecret`/`refreshToken` at rest.
- Keep WorkDrive OAuth separate from the existing Zoho Mail SMTP/IMAP client.
- Employee-docs parent folder must be a single swappable config constant (folder model is deferred).
