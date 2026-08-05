# SS Ops Hub — Zoho WorkDrive integration brief

> Research date: 2026-08-02. Default data center assumed **US (`.com`)** for Orilla / Stellar Society; region tables are multi-DC.
> Staff document **archives** go to **Zoho WorkDrive**. Do not use Supabase Storage for those archives.
> Supabase may later persist metadata only (`workdriveFileId`, `permalink`, etc.).
>
> **Source caveat:** Zoho does not publish a fully browsable static WorkDrive REST reference — the official API explorer at `https://workdrive.zoho.com/apidocs/v1/` is a JS-rendered console. Endpoint shapes below are corroborated from Zoho Deluge integration-task docs, OAuth docs, and production Deluge samples. Fields marked **(verify)** should be confirmed via live smoke test.

This file is the engineering source of truth from the Claude research pass. Implementation lives under `apps/web/lib/hr/workdrive/`.

---

## ✅ Live-account verification (2026-08-02, logged in as Orilla Restaurant / `people@orillarestaurant.com`)

Verified directly in the WorkDrive UI and against Zoho's **official OpenAPI spec** — supersedes assumptions below where they conflict.

**Official OAS repo (authoritative, machine-readable — import into Cursor/Swagger):** https://github.com/zoho/zohoworkdrive-oas → `v1.0/files_folders.json`, `folders.json`, `team_folder.json`, `chunk_upload.json`, `external_sharing.json`, `users.json`. OAS declares server `https://www.zohoapis.com/workdrive`; every endpoint lists its OAuth scope and JSON:API request/response schema. Create file/folder confirmed: `POST /api/v1/files`, body `{"data":{"type":"files","attributes":{"name","parent_id","service_type?"}}}`. Scopes confirmed: `WorkDrive.files.READ/CREATE/UPDATE/DELETE`.

**Real IDs (US `.com` DC) — THE APP TARGET:**

| Thing | Value |
|---|---|
| Team ID | `gcdaw6ac36b8a97be4387bfd0a3d3e13866d7` |
| **SS-OPS-HUB** Team Folder ID (`teamFolderId`) | `1xt10a426e6ba88e64e1caa7e75e21411947f` |
| **Human Resources** folder ID (`hrFolderId`) — **per-employee folders go directly here** | `1xt10ad4117f7c0ee45d99a23fc3456e5cd34` |

Confirmed tree — the original prompt's assumption was correct:
```
Team Folder: SS-OPS-HUB   (1xt10a42…)
 └── Human Resources      (1xt10ad4…)   ← empty, freshly created; app populates {emp_no} — {full_name} folders here
      └── {emp_no} — {full_name}
           ├── Passport/ ├── Emirates ID/ ├── Bank/ … └── Others/
```

Notes:
- `Human Resources` (`1xt10ad4…`) is **empty** and dedicated to the app — create per-employee folders directly under it. No migration needed.
- Employee number format confirmed: **`ORL####`** (e.g. `ORL0014`, `ORL0056`).
- **Do NOT confuse with the legacy standalone `HUMAN RESOURCES` team folder** (`sae44cf1e2c4af89c4b2db0cbfcf01bcb006a`, with `Employee Documents` = `vtvbm62a07bbd35f041bd996fea000998c43a`). That's the existing manual HR store organized by document type / flat per-person PDFs — **not** the app target. Leave it alone.
- The account `people@orillarestaurant.com` ("People Orilla") owns/creates HR content — use it as the OAuth Self Client owner (matches least-privilege service-owner recommendation).

---

## A. OAuth checklist

**Recommended client type: Self Client** (server-to-server).

1. Create Self Client at the DC API Console (`https://api-console.zoho.com` for US). Log in as the Team Folder owner.
2. Scopes (least privilege for upload/list): `WorkDrive.files.CREATE,WorkDrive.files.UPDATE,WorkDrive.files.READ,WorkDrive.teamfolders.READ`. **For in-app preview/download and trash**, use `WorkDrive.files.ALL,WorkDrive.teamfolders.READ` (recommended).
3. Generate Code → exchange once for `refresh_token` + `api_domain`. Access token lasts 1 hour; refresh token does not expire.
4. Keep WorkDrive OAuth **separate** from Zoho Mail SMTP/IMAP.

## B. Region hosts

| DC | Accounts | API (`api_domain`) | WorkDrive UI |
|---|---|---|---|
| US (`com`) | `accounts.zoho.com` | `www.zohoapis.com` | `workdrive.zoho.com` |
| EU (`eu`) | `accounts.zoho.eu` | `www.zohoapis.eu` | `workdrive.zoho.eu` |
| IN (`in`) | `accounts.zoho.in` | `www.zohoapis.in` | `workdrive.zoho.in` |
| AU (`com.au`) | `accounts.zoho.com.au` | `www.zohoapis.com.au` | `workdrive.zoho.com.au` |
| JP (`jp`) | `accounts.zoho.jp` | `www.zohoapis.jp` | `workdrive.zoho.jp` |
| CA (`ca`) | `accounts.zohocloud.ca` | prefer token `api_domain` | `workdrive.zohocloud.ca` |
| SA (`sa`) | `accounts.zoho.sa` | `www.zohoapis.sa` | `workdrive.zoho.sa` |
| UK (`uk`) | `accounts.zoho.uk` | `www.zohoapis.uk` | `workdrive.zoho.uk` |

REST base: `{api_domain}/workdrive/api/v1`

## C. Folder IDs

How to read them from the URL: Team Folder ID = segment after `/ws/`; sub-folder ID = segment after `/folders/`.

**Verified live values (2026-08-02) — app target:**
- Team ID: `gcdaw6ac36b8a97be4387bfd0a3d3e13866d7`
- SS-OPS-HUB Team Folder (`teamFolderId`): `1xt10a426e6ba88e64e1caa7e75e21411947f`
- Human Resources folder (`hrFolderId`, per-employee parent): `1xt10ad4117f7c0ee45d99a23fc3456e5cd34`

Example verified URL: `https://workdrive.zoho.com/gcdaw…/teams/gcdaw…/ws/1xt10a426e6ba88e64e1caa7e75e21411947f/folders/1xt10ad4117f7c0ee45d99a23fc3456e5cd34`

Legacy (not the target): standalone HUMAN RESOURCES team folder `sae44cf1e2c4af89c4b2db0cbfcf01bcb006a`.

## D. API ops implemented in code

1. Token refresh — `POST accounts…/oauth/v2/token`
2. Upload — `POST …/workdrive/api/v1/upload` (multipart)
3. Create folder — `POST …/workdrive/api/v1/files`
4. List children — `GET …/files/{folderId}/files`
5. Metadata — `GET …/files/{id}`
6. Rename — `PATCH …/files/{id}`
7. Download — `GET …/download/{id}` **(verify)**

## E–H

See original Claude brief in chat history / Drive Setup UI help text. Templates:

- Employee folder: `{emp_no} — {full_name}`
- File name: `{doc_label}_{emp_no}_{yyyy-MM-dd}` (+ original extension)

Upload sequence: ensure token → resolve/create employee folder → resolve/create doc subfolder → upload → PATCH rename if needed → return `{ workdriveFileId, permalink, path }`.
