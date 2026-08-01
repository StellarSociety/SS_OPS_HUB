# Config-Driven Email Sending (Zoho, with Sent-folder copy)

Goal: send email automatically from a mailbox we own (e.g. `people@orillarestaurant.com`)
to any recipient, have the sent message appear in that mailbox's **Sent** folder, and be
able to swap providers/hosts by editing values in
**Settings → Pay → Payroll Approvals → Emails Config** instead of changing code.

---

## 0. Confirmed from your Zoho Admin Console (Aug 1, 2026)

Pulled directly from `mailadmin.zoho.com` for the Orilla Restaurant org:

| Item | Value / status |
|---|---|
| Organization | Orilla Restaurant · primary domain `orillarestaurant.com` |
| Super admin | `admin@orillarestaurant.com` |
| Plan | **Workplace Professional** (paid) → use the `pro` mail servers |
| Data region | US (`.com`) → hosts end in `.zoho.com` |
| Sending mailbox | `people@orillarestaurant.com` — **exists, active, recently signed in** ✓ |
| MX records | Pointed to Zoho (`mx.zoho.com`, `mx2`, `mx3`) ✓ |
| DKIM | **Verified** (selector `zmail._domainkey`) ✓ |
| SPF | ✅ **Fixed Aug 1, 2026** — retyped at Hostinger with normal spaces: `v=spf1 include:zohomail.com include:zcsend.net ~all` (public resolvers refresh within ~4h of the old TTL). |
| DMARC | ✓ **Present & valid** (`v=DMARC1; p=none; rua=mailto:postmaster@orillarestaurant.com`) — no action required |
| DNS host | **Hostinger** (this is where the SPF fix is applied) |
| Subscription | 🔴 **Expired 07/30/26, grace period until 08/14/26 — renew to avoid mail disruption** |

**Confirmed connection values (paid Workplace, US region):**
- SMTP host `smtppro.zoho.com`, port `465` (SSL) — fallback `587` (STARTTLS)
- IMAP host `imappro.zoho.com`, port `993` (SSL)
- Sent folder name: `Sent`
- Username: `people@orillarestaurant.com` + the mailbox's **normal password** (TFA is disabled
  org-wide, so no app-specific password is needed)
- IMAP is permitted org-wide (0 access restrictions); only enable the per-mailbox IMAP toggle in
  `people@` webmail → Settings → Mail Accounts if a test send's Sent-copy fails

**DNS — only one fix needed at Hostinger** (verified against live DNS Aug 1, 2026). Full
step-by-step is in [`dns-fix-hostinger.md`](./dns-fix-hostinger.md).
- **SPF (fix):** the current record `v=spf1 include:zohomail.com include:zcsend.net ~all` uses
  **non-breaking spaces** as separators, which is invalid. In Hostinger, delete the `@` TXT
  record starting with `v=spf1` and **retype** it fresh (type, don't paste) as:
  `v=spf1 include:zohomail.com include:zcsend.net ~all`. Keep only one SPF record.
- **DMARC:** already present and valid — no change needed.
- **DKIM / MX:** already correct — leave alone.

**About the OAuth Client ID/Secret you have:** those are Zoho **Mail REST API** credentials
(a different sending path than SMTP+IMAP). You do **not** need them for the SMTP+IMAP plan.
Keep them only if you later want to switch to the API path (which saves to Sent natively
without IMAP). Treat the secret as sensitive — don't commit it.

---

## 1. How it works (the important part)

Two independent facts drive the design:

1. **Sending** is done over **SMTP** (Zoho SMTP). SMTP works with any provider, so making
   host/port/user/password editable in the UI means we can point at Zoho today and Gmail,
   Outlook, or a new host tomorrow with zero code changes.

2. **SMTP does NOT put a copy in the Sent folder.** When you send via SMTP the message goes
   straight to the recipient; your own mailbox never sees it. To get the "see it in Sent"
   behavior we, immediately after sending, connect over **IMAP** and `APPEND` the exact same
   message into the mailbox's **Sent** folder. This is the standard technique and is what
   real mail clients do internally.

So the transport is: **SMTP (send) + IMAP APPEND (save a copy to Sent).**

> Alternative considered: Resend (already in the project). Rejected for this use case because
> Resend sends on its own infrastructure — the message never touches the Zoho mailbox, so it
> would **not** appear in your Zoho Sent folder. We keep Resend available as a fallback
> provider option, but Zoho SMTP+IMAP is the default for "send as us / see it in Sent".

---

## 2. Details to collect from Zoho (fill these into the app, not the code)

Get these from your Zoho account and enter them in the Emails Config screen.

### A. SMTP (sending)
| Field | Where to get it / typical value |
|---|---|
| SMTP host | `smtp.zoho.com` (free) or `smtppro.zoho.com` (paid/organization). Use the region variant if your org isn't on `.com` — e.g. `smtp.zoho.eu`, `smtp.zoho.in`, `smtp.zoho.com.au`. |
| SMTP port | `465` (SSL) — recommended — or `587` (STARTTLS) |
| Security | SSL for 465, STARTTLS for 587 |
| Username | Full address: `people@orillarestaurant.com` |
| Password | The mailbox's **normal password** — TFA is disabled org-wide, so no app-specific password is needed/available. (If you later enable TFA on people@, switch to an app-specific password.) |
| From name | e.g. `Orilla People` (display name) |
| From email | `people@orillarestaurant.com` (must match the authenticated mailbox, or an alias it's allowed to send as) |
| Reply-To (optional) | Where replies should go, if different |

### B. IMAP (save copy to Sent)
| Field | Where to get it / typical value |
|---|---|
| IMAP host | `imap.zoho.com` (free) or `imappro.zoho.com` (paid). Region variants mirror SMTP. |
| IMAP port | `993` (SSL) |
| Username / password | Same mailbox + app password as SMTP |
| Sent folder name | `Sent` (default). Some accounts localize/rename it — confirm the exact folder name in Zoho. |

### C. Access status in Zoho (checked Aug 1, 2026 — mostly already done)
- **IMAP permitted org-wide** ✓ — Admin Console → Mail Settings → Email Policy → Access
  Restrictions shows 0 restrictions (POP/IMAP/ActiveSync not blocked).
- **TFA disabled org-wide** → no app password needed; use the mailbox's normal password.
- Only if a test send's Sent-copy fails: enable **IMAP Access** in people@ webmail →
  Settings → Mail Accounts (per-mailbox toggle; usually on by default).

### D. DNS records on `orillarestaurant.com` (status as of Aug 1, 2026)
Checked against live DNS. See [`dns-fix-hostinger.md`](./dns-fix-hostinger.md) for the one fix.
- **SPF**: ⚠️ exists but malformed (non-breaking-space separators) — retype at Hostinger as
  `v=spf1 include:zohomail.com include:zcsend.net ~all`.
- **DKIM**: ✓ verified (`zmail._domainkey`).
- **DMARC**: ✓ present & valid (`v=DMARC1; p=none; rua=mailto:postmaster@orillarestaurant.com`).
- **MX**: ✓ pointed to Zoho.

---

## 3. Settings UI — fields to create

Location: **Settings → Pay → Payroll Approvals → Emails Config**
(existing route: `apps/web/app/(app)/hr/settings/pay/approvals/emails/page.tsx`)

Group the new fields under a **"Connection / Transport"** card (separate from the existing
message/recipient fields already on this screen):

**Provider**
- Provider preset: dropdown `Zoho | Gmail | Outlook | Custom SMTP | Resend` (just prefills host/port; everything stays editable)

**Outgoing (SMTP)**
- SMTP host (text)
- SMTP port (number)
- Security (select: `SSL (465)` / `STARTTLS (587)`)
- Username (text)
- Password / App password (password input — **write-only**, see security note)
- From name (text)
- From email (text)
- Reply-To (text, optional)

**Save to Sent (IMAP)**
- Save a copy to Sent folder (toggle, default on)
- IMAP host (text)
- IMAP port (number)
- Sent folder name (text, default `Sent`)
- (IMAP reuses SMTP username/password unless a separate toggle is added)

**Actions**
- **Send test email** button (sends to an address you type, confirms both SMTP send and IMAP append succeeded, surfaces the exact error otherwise)
- Status line showing "Last verified: <timestamp>" / last error

**Security note for the build:** the password must be stored server-side only and never sent
back to the browser. The form shows a masked placeholder like `••••• (saved)`; leaving it
blank on save keeps the existing value; typing a new value replaces it. Ideally encrypt it at
rest (or store in a service-role-only table), and only ever read it inside server actions.

---

## 4. Cursor prompt (paste into Cursor)

```
We need a config-driven email transport for the SS Ops Hub app (Next.js 16 App Router,
pnpm monorepo at apps/web, Supabase, server actions). Today email goes through Resend via
lib/email/resend.ts using RESEND_API_KEY / RESEND_FROM_EMAIL env vars. We want to send from
a mailbox we own (people@orillarestaurant.com on Zoho), have the sent message appear in that
mailbox's Sent folder, and configure everything from the app UI instead of code/env.

CONFIRMED ZOHO VALUES (verified in the Zoho admin console — use as the default "zoho" preset;
all fields stay editable in the UI, never hardcoded as the only option):
  - Plan: Zoho Workplace Professional (paid), US data region (.com)
  - SMTP: host smtppro.zoho.com, port 465, secure=true (SSL). Fallback 587 STARTTLS.
  - IMAP: host imappro.zoho.com, port 993, secure=true (SSL)
  - Sent folder name: "Sent"
  - From / auth mailbox: people@orillarestaurant.com (confirmed to exist and be active)
  - Auth: username = people@orillarestaurant.com + password. **TFA is disabled org-wide**, so
    Zoho does NOT require an app-specific password — the app authenticates with the mailbox's
    normal password (entered in the UI, stored encrypted). IMAP is permitted org-wide (Admin
    Console → Mail Settings → Email Policy → Access Restrictions shows 0 restrictions). If a
    test send's Sent-copy fails, enable IMAP in people@ webmail → Settings → Mail Accounts.
    (Optional hardening: enable TFA on people@ and switch to an app-specific password later.)
  - Note: a Zoho Mail REST API OAuth client also exists (Client ID/Secret) but is NOT used by
    this SMTP+IMAP path. Do not reference or embed those credentials.

REQUIREMENTS

1. Transport
   - Add a new email transport that sends over SMTP using `nodemailer`, then appends a copy
     of the sent message to the mailbox's IMAP "Sent" folder using `imapflow` (IMAP APPEND).
     SMTP alone does NOT save to Sent — the IMAP append is what makes the message show up in
     the owner's Sent folder. Build the RFC822 message once (nodemailer can produce it) and
     append that exact buffer.
   - These must run on the Node.js runtime (not edge): add `export const runtime = "nodejs"`
     to any route, and keep this logic in server-only modules.
   - Make the transport provider-agnostic. Create an interface like:
       sendEmail({ to, cc, bcc, subject, html, attachments, fromOverride })
     with implementations: "smtp" (nodemailer + optional imap-append) and keep the existing
     "resend" path as a selectable fallback. A single sendAppEmail() dispatcher picks the
     implementation based on saved config.

2. Config storage (editable in-app, not code)
   - Store the transport config in the existing per-venue settings store used by payroll
     approvals (see lib/actions/hr-payroll-approvals.ts -> getHrVenueSetting / HR_SETTINGS_KEYS
     and lib/hr/types.ts DEFAULT_HR_PAYROLL_APPROVALS_SETTINGS). Add a new settings key, e.g.
     HR_SETTINGS_KEYS.emailTransport, with this shape:
       {
         provider: "zoho" | "gmail" | "outlook" | "custom" | "resend",
         smtp: { host, port, secure: boolean, username, fromName, fromEmail, replyTo },
         imap: { enabled: boolean, host, port, sentFolder: string },
         // secret stored separately, see below
       }
   - Store the SMTP/IMAP PASSWORD (app password) server-side only. Do NOT return it to the
     client. Options: encrypt at rest with a key from env (APP_SECRETS_KEY) using node:crypto
     AES-256-GCM, or a dedicated Supabase table with RLS locked to service role. On the
     settings form, the password field is write-only: blank = keep existing, non-blank =
     replace. Never include the secret in any server component payload or client props.

3. Settings UI
   - Extend the Emails Config screen at
     apps/web/app/(app)/hr/settings/pay/approvals/emails/page.tsx and its panel
     (components/hr/payroll-approvals-settings-panel.tsx) with a "Connection / Transport" card.
   - Fields: provider preset dropdown (the "Zoho" preset prefills smtppro.zoho.com:465 SSL,
     imappro.zoho.com:993 SSL, Sent folder "Sent"), SMTP host, SMTP port, security
     (SSL 465 / STARTTLS 587), username, password (write-only masked), from name, from email,
     reply-to; a "Save a copy to Sent" toggle, IMAP host, IMAP port, Sent folder name.
   - Add a "Send test email" server action that: builds a test message, sends via the saved
     config, performs the IMAP append if enabled, and returns a clear success/error string
     (surface the underlying SMTP/IMAP error text). Show "Last verified" timestamp + last error.
   - Gate editing behind the same permission checks already used on this page
     (canEditPayroll / canAdminLookups).

4. Wire existing senders through the new dispatcher
   - Route lib/notifications/email.ts and lib/actions/hr-payroll-approvals.ts email sends
     through sendAppEmail() so the payroll-approval emails (and notifications) use the
     configured Zoho transport. Keep Resend working if provider === "resend".
   - Preserve the existing branded HTML builders in lib/email/resend.ts (emailShell, etc.) —
     only the transport changes, not the templates.

5. Validation & audit
   - Validate config with zod. On save, write an audit log entry (writeAuditLog is already
     used in hr-payroll-approvals.ts) — but never log the secret.
   - revalidate the settings path after save (revalidatePath("/hr/settings/pay/approvals","page")).

DELIVERABLES
   - New: lib/email/transport/{index.ts (dispatcher + types), smtp.ts (nodemailer + imapflow
     append), resend.ts (wrap existing)}, plus secret encryption helper lib/email/secret.ts.
   - New settings key + types in lib/hr/types.ts and merge/load/save server actions
     alongside the existing payroll-approvals actions.
   - Updated Emails Config page + settings panel with the Connection card and Send-test action.
   - Add deps: `nodemailer`, `imapflow` (and @types/nodemailer) to apps/web.
   - Do not hardcode Zoho hosts; they are entered in the UI. Provide sensible provider presets.

Confirm the plan, list the files you'll add/change, then implement.
```

---

## 5. Quick checklist for David

- [ ] In Zoho: enable IMAP + SMTP for `people@orillarestaurant.com`
- [ ] In Zoho: generate an **App Password** (if 2FA is on)
- [ ] SMTP/IMAP hosts confirmed: `smtppro.zoho.com:465` / `imappro.zoho.com:993`, Sent folder `Sent`
- [x] **SPF fixed** at Hostinger Aug 1, 2026 (retyped with normal spaces). DKIM/DMARC/MX already fine.
- [ ] Run the Cursor prompt above
- [ ] Use **Send test email** in the new Emails Config screen to verify send + Sent-copy
