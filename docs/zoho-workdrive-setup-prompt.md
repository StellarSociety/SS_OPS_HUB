# Claude prompt — Zoho WorkDrive API research for SS Ops Hub

Paste everything below the line into Claude (Projects / chat). Goal: extract **exact, current** API details so SS Ops Hub can upload HR staff documents directly into Zoho WorkDrive — **not** Supabase Storage.

---

## Who you are / what to do

You are a technical researcher for **SS Ops Hub** (Next.js app, venue-scoped HR module). Produce a **structured implementation brief** the engineering team can paste into Cursor. Prefer official Zoho docs over blogs. Quote exact endpoint paths, required scopes, request/response field names, and region hosts. Flag anything that differs by data center (`.com` / `.eu` / `.in` / etc.).

Do **not** invent endpoints. If a detail is unclear, say so and link the doc page.

## Product context (read carefully)

- App already uses Zoho for **email** (SMTP + IMAP). That is **separate** from WorkDrive. Do not mix Mail OAuth scopes with WorkDrive scopes unless a single Self Client can hold both (document if possible).
- Staff documents (profile photo archive, passport scan, Emirates ID, contracts, etc.) must be stored in **Zoho WorkDrive**.
- Files must **never** be written to Supabase Storage **for HR document archives**. Exception for display: staff profile avatars continue to use the existing fast `photo_url` WebP; WorkDrive holds a synced archive copy under **Profile Photo/**.
- Supabase may later store only **metadata** (WorkDrive file id, permalink, staff id, doc kind) — out of scope for your research except noting which response fields we should persist.

### Intended folder tree

```
Team Folder: SS-OPS-HUB
 └── Human Resources
      └── {emp_no} — {full_name}          ← auto-created per employee
           ├── Profile Photo/             ← archive copy of staff headshot
           ├── Passport/
           ├── Emirates ID/
           ├── Bank/
           ├── Offer Letter/
           ├── Contract/
           ├── Addendums/
           ├── eResidence Card/
           ├── OHC/
           ├── Medical Insurance/
           ├── Training Certificates/
           └── Others/
```

Uploads rename files using a template, e.g. `Passport_ORL0056_2026-08-02.pdf`.

### Profile photo performance (important)

Profile photos appear on staff heroes, directories, and emails. Loading every avatar from WorkDrive (auth + download) would be too slow.

**Policy:** include **Profile Photo** as a WorkDrive document type for HR archive/completeness, but keep the **display path** on the existing fast `staff.photo_url` (cropped WebP already used in the app). On photo save: write/update WorkDrive copy **and** keep serving UI from `photo_url`. Do **not** recommend proxying every avatar through WorkDrive.

### Where config will live in the app

HR → Settings → **Data Management** → **Drive Setup**  
Fields already scaffolded in the UI (fill these with real values from your research):

| UI field | Purpose |
|---|---|
| Zoho data center | Region for accounts + API hosts |
| Client ID / Client secret / Refresh token | OAuth |
| Team folder name + ID | `SS-OPS-HUB` |
| HR folder name + ID | `Human Resources` |
| Employee folder template | `{emp_no} — {full_name}` |
| File name template | `{doc_label}_{emp_no}_{yyyy-MM-dd}` |
| Doc-type → subfolder names | Mapping table |
| Auto-create folders | Create missing employee / doc folders on upload |

## Research tasks (complete all)

### 1. OAuth setup checklist

Document step-by-step for a **server-side** Next.js app (no browser redirect preferred if Self Client / refresh-token flow works):

1. Where to create the client (Zoho API Console URL for US and other DCs).
2. Client type to choose (Server-based / Self Client / etc.) and why.
3. Exact **scopes** required for:
   - Upload file to a folder
   - Create folder
   - List folder contents / find folder by name
   - Optionally: get permalink / download / rename / delete
4. How to obtain a **refresh token** (authorization code flow vs self client). Include the authorize URL shape and token URL.
5. How to exchange refresh token → access token (method, host, body params).
6. Token lifetime / refresh behavior.
7. Whether one refresh token can cover WorkDrive only, or must include other Zoho products.

### 2. Hosts by data center

Table of:

- Accounts host (OAuth)
- WorkDrive / Zohoapis host for file APIs
- WorkDrive web UI host (for humans copying folder IDs from URLs)

Cover at least: `com`, `eu`, `in`, `com.au`, `uk`, `jp`, `ca`, `sa` if documented.

### 3. Folder IDs from the UI

Explain precisely how to copy:

- Team folder ID for **SS-OPS-HUB**
- Folder ID for **Human Resources**

from a WorkDrive browser URL. Show example URL patterns and which path segment is the id.

### 4. REST APIs we will call from Node

For each operation, give: method, full URL template, headers, body (multipart vs JSON), success response shape (especially **resource id** and **permalink**), common errors.

Required operations:

1. **Refresh access token**
2. **Upload file** into a parent folder id (binary PDF/JPEG/PNG/WebP; max size limits)
3. **Create folder** under a parent folder id
4. **List children** of a folder (to find existing employee folder by name)
5. **Get file metadata** (optional but useful)
6. **Rename file** (if upload cannot set final name, or for overwrite policy)

Also note:

- Does upload support setting the filename directly?
- Overwrite vs create-new when the same name exists?
- Multipart field names (`content`, `filename`, etc.)
- Rate limits / size limits

### 5. Automation hooks (optional add-on)

Briefly list ways to trigger **Zoho Flow / WorkDrive automation** after an upload (webhook from our app, WorkDrive events, Deluge). We will upload from the app first; Flow is secondary.

### 6. Security recommendations

- Least-privilege scopes
- Which account should own the Team Folder (e.g. `people@…` service mailbox)
- Whether external share links are needed for in-app preview (prefer private + server-side download proxy)
- What **not** to put in `NEXT_PUBLIC_*` env vars

## Output format (mandatory)

Return a single markdown doc with these exact sections:

```markdown
# SS Ops Hub — Zoho WorkDrive integration brief

## A. OAuth checklist
## B. Region hosts table
## C. How to get folder IDs (SS-OPS-HUB / Human Resources)
## D. API reference (token, upload, createFolder, list, metadata)
## E. Recommended env vars + Drive Setup field mapping
## F. Suggested Node upload flow (pseudocode)
## G. Open questions / doc gaps
## H. Official doc links (with titles)
```

Under **E**, map each brief fact to these app settings keys (already in code):

- `region`
- `clientId`
- `clientSecret` (encrypted at rest)
- `refreshToken` (encrypted at rest)
- `teamFolderName` / `teamFolderId`
- `hrFolderName` / `hrFolderId`
- `employeeFolderTemplate`
- `fileNameTemplate`
- `autoCreateFolders`
- `docSubfolders[]`

Under **F**, pseudocode must match this sequence:

1. Ensure access token
2. Resolve or create employee folder under `hrFolderId`
3. Resolve or create doc-type subfolder
4. Rename file per template + preserve extension
5. Upload into doc-type folder
6. Return `{ workdriveFileId, permalink, path }`

## Constraints for the brief

- Assume US region (`.com`) as default for Orilla / Stellar Society, but keep tables multi-region.
- Prefer WorkDrive REST over Deluge-only tasks (we call APIs from Next.js server actions).
- No Supabase Storage. No client-side exposure of client secret or refresh token.
- Be concrete: copy-pasteable curl examples are welcome.

## After you finish

Tell the human:

1. Exact values to paste into **Drive Setup** (IDs + which OAuth fields).
2. Any Zoho Admin Console toggles that must be enabled.
3. A short “ready for Cursor” summary: which endpoints to implement first for a passport upload smoke test.

---

End of prompt.
