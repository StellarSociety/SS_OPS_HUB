# DNS fix for orillarestaurant.com (Hostinger)

> ✅ **DONE — Aug 1, 2026.** The SPF record was corrected directly in the Hostinger DNS Zone
> Editor (edited the `@` TXT record, cleared it, retyped with normal spaces, saved — Hostinger
> confirmed "DNS Record updated successfully"). It now reads
> `v=spf1 include:zohomail.com include:zcsend.net ~all` with plain spaces.
> Public resolvers may still show the old value until the old TTL (14400s ≈ 4h) expires —
> that's normal caching, not a failure. The record below is kept for reference.

Read from **live public DNS on Aug 1, 2026** via DNS-over-HTTPS. Apply at Hostinger →
Domains → orillarestaurant.com → DNS / Nameservers (DNS Zone Editor).

## The change that was made: fix the SPF record

**Problem:** the SPF record's word separators are **non-breaking spaces (U+00A0)** instead of
normal spaces, which makes the whole record invalid to SPF parsers. The authorized senders
are correct (Zoho Mail + Zoho Campaigns) — only the spacing is corrupted.

Current (broken — the gaps are non-breaking spaces, shown as `Â` in raw data):
```
v=spf1 include:zohomail.com include:zcsend.net ~all
```

**Do this in Hostinger:**
1. Find the **TXT** record on host/name `@` whose value starts with `v=spf1`.
2. **Delete it** (don't just edit — the invisible bad characters tend to survive edits).
3. **Add a new TXT record**, typing the value fresh (do not paste, to avoid re-introducing
   bad characters):
   - Type: `TXT`
   - Name / Host: `@`
   - TTL: `14400` (or default)
   - Value: `v=spf1 include:zohomail.com include:zcsend.net ~all`
4. Save. Keep only this ONE SPF record — never two `v=spf1` records on the domain.

> Optional consolidation (equivalent, Zoho's newer recommendation):
> `v=spf1 include:one.zoho.com ~all`
> Stick with the explicit two-include version above if you want zero risk of changing which
> Zoho services are authorized — it preserves exactly today's senders.

## DMARC — already correct, no action

Live record: `v=DMARC1; p=none; rua=mailto:postmaster@orillarestaurant.com` — valid and active.
(Optional, not required: point reports to `people@` by changing the value to
`v=DMARC1; p=none; rua=mailto:people@orillarestaurant.com`.)

## Already correct (leave alone)
- MX → Zoho (`mx.zoho.com`, `mx2.zoho.com`, `mx3.zoho.com`)
- DKIM → `zmail._domainkey` verified

## Verify after applying (waits for propagation, ~30 min–a few hours)
Open in a browser:
`https://dns.google/resolve?name=orillarestaurant.com&type=TXT`
The SPF line should read exactly `v=spf1 include:zohomail.com include:zcsend.net ~all` with
plain spaces (no `Â` characters). Or use https://mxtoolbox.com/spf.aspx and enter the domain.
