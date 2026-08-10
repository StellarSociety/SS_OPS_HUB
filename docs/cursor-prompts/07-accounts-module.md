# Cursor Prompt 07 — Accounts (Finance) Module

**Type:** New module in SS Ops Hub · **Stack:** Next.js · Supabase (Postgres) · Vercel
**Owns:** double-entry general ledger, AP/AR, banking, VAT, inventory/COGS, payroll accounting, fixed assets, period close, financial & management reports.
**Depends on:** `venues`, `profiles`, `user_permissions`, `audit_log` (initial schema); HR `staff` (payroll actor link, optional).
**Companion skill:** `restaurant-bookkeeping` (accounting rules, COA baseline, workflows, close checklist). This module IS the software implementation of that skill.

> Read `docs/ARCHITECTURE_BLUEPRINT.md` (§5 permissions, §6 module pattern, §14 conventions) before building. This module follows the same pattern: RLS on every table, `venue_id` on every record, registration in `lib/modules-registry.ts`, feature keys with access levels `admin/edit/view/submit`, every write through a server action that appends to `audit_log`.

---

## 0. How to use this file

1. **Fill in the CONFIG WORKBOOK (§A) first.** Every `[ … ]` and every empty table row is a decision only David can make. The build cannot produce correct numbers until these are filled. Nothing below §A should be hardcoded — it all reads from config/seed data derived from §A.
2. **Then build in phases (§H).** Each phase has a Definition of Done. Do not start a phase until the prior phase's DoD passes.
3. **Paste into Cursor phase by phase**, not all at once. Keep each PR scoped to one phase and commit to `david-dev`.

### Non-negotiable accounting invariants (the build must enforce these — no UI convenience may break them)

1. **Every journal entry balances:** `SUM(debits) = SUM(credits)` per entry, enforced at the database level (trigger/constraint), not just in the UI.
2. **Posted transactions are immutable.** Never `UPDATE`/`DELETE` a posted journal line. Corrections are made by **reversal** or **correcting entry** with an audit link to the original. Soft-delete only in Draft.
3. **Posting accounts vs report lines.** Gross Profit, EBITDA, Net Profit, cost %s are **computed**, never posting accounts. Header/Group accounts cannot be posted to — only `ledger` accounts.
4. **Dimensions, not account proliferation.** Do not create a GL account per venue/vendor/employee/gateway. Use the account + dimensions.
5. **VAT collected is a liability, never revenue.** Tips/service charge default to liabilities unless config says the entity is principal.
6. **Separate TRN = segregated books.** Each legal entity's VAT control accounts and returns are isolated. No cross-entity VAT netting. Group figures are a **reporting layer**, not a shared ledger.
7. **Never hardcode a tax rate.** Rates are effective-dated rows in `tax_rates`; the applicable rate is resolved by (tax_code, transaction_date).
8. **Closed periods are locked.** No posting into a locked period except by an authorized reopen, which is itself audited.

---

# §A — CONFIG WORKBOOK  *(David fills this in)*

> This section is the single source of truth for setup. The build converts it into seed migrations and a Settings UI. Leave a row blank only if the concept genuinely doesn't apply. Replace every `[ … ]`.

## A1. Legal entities (one per TRN)

You confirmed **separate TRN per venue**. One row per registered entity.

> **Phase 1 provisional seed (editable in Accounting → Settings → Entities):**
> ENT01 · Orilla Restaurant LLC · TRN blank · Dubai · AED · Monthly · first open 2026-01.
> Fill real TRN / trade licence / licensing authority in the Settings UI (or replace this table and re-seed).

| entity_code | Legal name | TRN | Trade licence no. | Licensing authority | Emirate of registration | Functional currency | VAT filing frequency | First open period |
|---|---|---|---|---|---|---|---|---|
| ENT01 | Orilla Restaurant LLC *(provisional)* | *[fill in Settings]* | *[fill]* | *[fill]* | Dubai | AED | Monthly | 2026-01 |
| ENT02 | [ … ] | [ … ] | [ … ] | [ … ] | [ … ] | AED | [ … ] | [ … ] |
| … | | | | | | | | |

## A2. Venues ↔ entity ↔ emirate of supply

Maps existing `venues` rows to their legal entity. `emirate_of_supply` drives the VAT201 standard-rated split.

| venue slug (existing) | Maps to entity_code | Emirate of supply | Notes |
|---|---|---|---|
| orilla | ENT01 | [ Dubai ] | [ … ] |
| [ … ] | [ … ] | [ … ] | |

> If one entity ever runs multiple venues, list several venues against the same `entity_code`. The default assumption is 1 venue = 1 entity.

## A3. Fiscal calendar

| Field | Value |
|---|---|
| Financial year start month | [ January / other ] |
| Period granularity | Monthly |
| Group reporting currency | AED |
| Who may reopen a locked period | [ role, e.g. Finance Admin only ] |

## A4. Currency & FX

| Field | Value |
|---|---|
| Base currency | AED |
| Foreign currencies used | [ USD, EUR, … or "none" ] |
| FX rate source | [ manual / API ] |
| FX gain/loss account | 7600 |
| Rounding account | [ new 6xxx or 7xxx ] |

## A5. Chart of Accounts — overrides & additions

Baseline COA ships from the `restaurant-bookkeeping` skill (codes 1000–8300). List here **only** changes:

- **Additions** (new ledger accounts you need):

| Code | Account | Type (Header/Group/Ledger) | Parent code |
|---|---|---|---|
| [ … ] | [ … ] | [ … ] | [ … ] |

- **Renames / removals / merges:**

| Baseline code | Action (rename/disable/merge→) | New value |
|---|---|---|
| [ … ] | [ … ] | [ … ] |

- **Existing numbering to preserve?** [ Yes → attach it / No, use baseline ]

## A6. Dimensions — activate & set requirement

Set each dimension: `off` / `optional` / `required`. "Required on" narrows to account ranges.

| Dimension | Status | Required on (account ranges) |
|---|---|---|
| Legal Entity | required | all |
| Venue | required | all |
| Emirate | required | revenue (4000–4999) |
| Department | [ optional/required ] | [ 6100 wages, … ] |
| Cost Centre | [ … ] | [ … ] |
| Revenue Centre | [ … ] | [ 4000–4999 ] |
| Supplier/Vendor | [ … ] | [ AP, expenses ] |
| Customer | [ … ] | [ AR ] |
| Employee | [ … ] | [ payroll ] |
| Project/Event | [ … ] | [ … ] |
| Payment Method | [ … ] | [ bank/settlement ] |
| Sales Channel | [ … ] | [ 4000–4999 ] |

## A7. Tax codes & VAT201 mapping  *(the layer the skill doesn't yet cover)*

Define the codes, then map each to a VAT201 return box. Rates live in a separate effective-dated table (A7b).

| tax_code | Label | Treatment | Input recoverable? | Output/Input account | VAT201 box |
|---|---|---|---|---|---|
| SR | Standard-rated 5% | output | — | 2310 | Box 1a (by emirate) |
| ZR | Zero-rated | output | — | — | Box 4 |
| EX | Exempt | output | — | — | Box 5 |
| OS | Out of scope | none | — | — | — |
| RC | Reverse charge (imports) | both | yes | 2310/2320 | Box 3 + Box 10 |
| BL | Blocked input (entertainment) | input | **no** | expense (gross) | — |
| ZP | Zero-rated purchases | input | yes | 2320 | Box 9 |
| SP | Standard purchases 5% | input | yes | 2320 | Box 9 |

**A7b. Effective-dated rates** (never hardcode — resolver picks by date):

| tax_code | rate | valid_from | valid_to |
|---|---|---|---|
| SR | 0.05 | 2018-01-01 | [ open ] |
| SP | 0.05 | 2018-01-01 | [ open ] |
| … | | | |

> Confirm: filing frequency per entity is already in A1. Corporate Tax (9%) — build now or defer? [ defer / build ].

## A8. System default accounts (auto-posting targets)

| Purpose | Account code |
|---|---|
| Retained earnings | 3300 |
| Current-year P&L | 3400 |
| Suspense / clearing | [ new ] |
| Rounding | [ from A4 ] |
| FX gain/loss | 7600 |
| Bank / merchant fees | 6910 / 6920 |
| Output VAT | 2310 |
| Input VAT | 2320 |
| VAT payable/settlement | 2330 |
| AP control | 2110 |
| AR control | 1210 |

## A9. Document number sequences (per entity)

| Doc type | Prefix | Padding | Reset | Example |
|---|---|---|---|---|
| Journal | [ JV- ] | [ 6 ] | [ yearly ] | JV-2026-000001 |
| Sales invoice | [ INV- ] | [ … ] | [ … ] | |
| Payment | [ PAY- ] | | | |
| Credit note | [ CN- ] | | | |

## A10. Roles & approval thresholds

Map to the hub's access levels (`admin/edit/view/submit`) plus money thresholds.

| Role | Feature access | Can post? | Approval limit (AED) |
|---|---|---|---|
| Finance Admin | accounts/* = admin | yes | unlimited |
| Bookkeeper | accounts/gl,ap,ar = edit | no (submit only) | — |
| Venue Manager | accounts/reports = view | no | [ approve ≤ X ] |
| Owner | accounts/reports = view | no | [ … ] |

## A11. Bank accounts & settlement channels

| Type | Name | Entity | GL account | Fee account | Notes |
|---|---|---|---|---|---|
| Bank | [ … ] | ENT01 | 1110 | 6920 | |
| Petty cash | [ … ] | ENT01 | 1130 | — | custodian: [ … ] |
| Card processor | [ Network/Mastercard acquirer ] | ENT01 | 1220 | 6910 | settlement lag [ Tn ] |
| Qlub / pay-at-table | [ … ] | ENT01 | 1230 | 6910 | |
| Delivery aggregator | [ Talabat/Deliveroo/… ] | ENT01 | 1240 | 6910 | commission % [ … ] |

## A12. POS / revenue mapping

| Field | Value |
|---|---|
| POS system | [ Tevalis / SerVme / other ] |
| Import method | [ API / daily CSV / manual summary ] |
| Revenue categories → accounts | Food→4100, Beverage→4200, Wine→4300, Tobacco→4400, Shisha→4500, Other→4600 |
| Service charge treatment | [ liability 2230 (agent) / revenue (principal) ] |
| Tips treatment | [ liability 2220 ] |
| Municipality / tourism fee | [ liability / — ] account [ … ] |
| Tender types → accounts | cash→1120, card→1220, Qlub→1230, delivery→1240 |

## A13. Inventory

| Field | Value |
|---|---|
| Valuation | [ periodic (recommended to start) / perpetual ] |
| Stock categories | Food, Beverage, Wine, Tobacco, Shisha |
| Count frequency | [ monthly ] |
| Stock system of record | [ in-app / external e.g. Tevalis ] |

## A14. Payroll accounting

| Field | Value |
|---|---|
| Pay cycle | [ monthly ] |
| Departments (wage split) | Management, Kitchen, Floor, Bar, Reception, Marketing/Office |
| EOSB provision policy | [ accrue monthly per UAE gratuity formula ] |
| Leave provision policy | [ accrue monthly ] |
| Source | [ HR module staff / external payroll ] |

## A15. Fixed assets

| Asset class | Account | Depreciation method | Useful life (yrs) | Capitalization threshold (AED) |
|---|---|---|---|---|
| Kitchen equipment | 1510 | [ straight-line ] | [ … ] | [ … ] |
| Furniture & fixtures | 1520 | | | |
| IT equipment | 1530 | | | |
| Leasehold improvements | 1540 | [ over lease term ] | | |

## A16. Opening balances / cutover

| Field | Value |
|---|---|
| Migration (go-live) date | [ YYYY-MM-DD ] |
| Trial balance source | [ file / prior system ] |
| Open AP items | [ list / import ] |
| Open AR items | [ … ] |
| Opening inventory value | [ per category ] |
| Fixed asset register + accumulated dep. | [ import ] |

---

# §B — Data model (Supabase migration, RLS on every table)

Create as a single migration `supabase/migrations/<ts>_accounts_schema.sql`. All money is `numeric(14,3)` (AED fils). Every table has `venue_id UUID REFERENCES venues(id)` and, where relevant, `entity_id UUID REFERENCES legal_entities(id)`. RLS mirrors the HR pattern (select for authenticated; writes via server action / service role).

### Core

- **`legal_entities`** — id, entity_code (unique), name, trn, trade_licence_no, licensing_authority, emirate, functional_currency default 'AED', vat_filing_frequency, first_open_period, created_at. *(Seed from A1.)*
- **`venue_entities`** — venue_id → entity_id, emirate_of_supply. One row per venue. *(A2.)*
- **`fiscal_periods`** — id, entity_id, period (date, first-of-month), status `open|closed`, closed_by, closed_at, reopened_by, reopened_at, reopen_reason. Unique (entity_id, period). *(A3.)*
- **`accounts`** (COA) — id, code, name, account_type `asset|liability|equity|revenue|cost_of_sales|expense|other|depr_tax`, node_type `header|group|ledger|system`, parent_id (self-FK), normal_balance `debit|credit`, is_control boolean, is_postable boolean (false for header/group/system), active. *(Seed baseline + A5.)*
- **`dimensions`** — id, key, label, status `off|optional|required`. *(A6.)*
- **`dimension_requirements`** — dimension_id, account_range_from, account_range_to. *(A6.)*
- **`dimension_values`** — id, dimension_id, value_code, label, meta jsonb (e.g. links to venues/staff/suppliers).

### Tax

- **`tax_codes`** — id, code, label, treatment `output|input|both|none`, input_recoverable boolean, output_account_id, input_account_id, vat201_box. *(A7.)*
- **`tax_rates`** — id, tax_code_id, rate numeric, valid_from, valid_to. *(A7b.)* Resolver: `WHERE tax_code=? AND valid_from<=txn_date AND (valid_to IS NULL OR valid_to>=txn_date)`.
- **`vat_returns`** — id, entity_id, period_from, period_to, status `draft|filed`, box_values jsonb, generated_at, filed_at.

### Ledger

- **`journal_entries`** — id, entity_id, venue_id, entry_no (from sequence), entry_date, period_id (FK, must be open to post), memo, status `draft|submitted|approved|posted|reversed`, source_type `manual|sales|ap|ar|payroll|inventory|fa|bank|fx|accrual`, source_ref, created_by, approved_by, posted_by, posted_at, reversal_of (self-FK), attachment_url.
- **`journal_lines`** — id, journal_entry_id, account_id (must be postable), debit numeric default 0, credit numeric default 0, tax_code_id (nullable), description, plus a `dimensions jsonb` OR a normalized **`journal_line_dimensions`** (line_id, dimension_id, dimension_value_id). **Constraint/trigger:** entry-level `SUM(debit)=SUM(credit)`; line has exactly one of debit/credit > 0; required dimensions present per `dimension_requirements`; account postable; period open.
- **`sequences`** — id, entity_id, doc_type, prefix, padding, reset_rule, current_value. *(A9.)*
- **`system_default_accounts`** — key, account_id. *(A8.)*

### Subledgers / modules

- **`suppliers`**, **`customers`** (dimension-backed masters with entity scope, contact, TRN for suppliers).
- **`ap_invoices`** / **`ap_payments`** / **`ap_allocations`**; **`ar_invoices`** / **`ar_receipts`** / **`ar_allocations`** — status workflow, duplicate guard `unique(entity_id, supplier_id, supplier_invoice_no)`, partial payment support, each generates journal entries.
- **`bank_accounts`**, **`bank_statement_lines`**, **`bank_reconciliations`**, **`recon_matches`** (many-to-many match, unmatched tracking). *(A11.)*
- **`settlement_channels`** + **`settlements`** (expected vs received, fee, difference flag). *(A11.)*
- **`daily_sales`** (per venue/day: gross, discounts, comps, net by category, service charge, tips, taxes, tenders) → posts a balanced sales journal. *(A12.)*
- **`inventory_items`**, **`stock_counts`**, **`stock_adjustments`**, **`cogs_runs`** (periodic: opening + purchases ± adj − closing = COGS). *(A13.)*
- **`payroll_runs`**, **`payroll_lines`** (wage by department, provisions EOSB/leave). *(A14.)*
- **`fixed_assets`**, **`depreciation_runs`** (class, method, life, accumulated dep). *(A15.)*
- **`accruals`**, **`prepayments`** (recurring, auto-reverse/release).
- **`opening_balances`** (import staging → one posted opening journal per entity). *(A16.)*

---

# §C — Posting engine (`lib/accounts/posting.ts`)

A single service that all modules call to create journals — never write `journal_lines` directly from feature code.

```
postJournal({ entityId, venueId, date, memo, sourceType, sourceRef, lines[], status }):
  1. resolve period (entity, date); reject if closed
  2. validate: each line has account (postable), one of debit/credit>0, required dimensions
  3. compute tax lines from tax_code + tax_rates (resolver by date) where applicable
  4. assert SUM(debit) == SUM(credit)  (fail → throw, no partial write)
  5. reserve entry_no from sequence (entity, doc_type)
  6. insert entry + lines in one transaction
  7. append audit_log row (actor, before/after, source)
  8. if status posted: mark posted_by/posted_at (immutable thereafter)
```

Reversal: `reverseJournal(entryId, reason)` creates a mirror entry (debits↔credits), links `reversal_of`, audits. Original stays untouched.

---

# §D — VAT201 engine (`lib/accounts/vat.ts`)

Per entity, per filing period: aggregate posted lines by `tax_code` and `emirate_of_supply` into the VAT201 boxes using the A7 mapping. Standard-rated output (SR) splits by emirate (Box 1a–1g). Reverse charge hits both output and recoverable input. Blocked input (BL) is excluded from recoverable input. Output = `vat_returns.box_values` (jsonb) + a filing-ready summary export (xlsx/pdf). **Never** net across entities.

---

# §E — Period close (`lib/accounts/close.ts`)

Implement the `restaurant-bookkeeping` month-end checklist as a gated flow with owner/status/evidence per item: reconcile revenue, banks, settlements, AP, AR, inventory/COGS, payroll liabilities, accruals, prepayments, fixed assets, tax control → then management review → then **lock** (`fiscal_periods.status = closed`). Posting into a closed period is rejected by the posting engine. Reopen is a distinct, audited action limited to the role in A3.

---

# §F — Reporting (`lib/accounts/reports.ts`)

All reports are **derived from ledger balances + dimensions** — no stored report-line accounts.

- **P&L** in the skill's sequence: Net Revenue → COGS → Gross Profit → OpEx → EBITDA → below-EBITDA → D&A → finance → tax → Net Profit. Filters: entity, venue, department, revenue centre, period, budget-vs-actual, prior-period.
- **Balance Sheet** and **Cash Flow** (operating/investing/financing).
- **Management KPIs** (computed): Food/Bev/Wine cost %, Total COGS %, GP %, Payroll %, OpEx %, EBITDA %, supplier spend, inventory variance, discounts/comps.
- **Group consolidated** views across entities as a **reporting layer** (eliminate intercompany where flagged); never a shared ledger.

Consider a live artifact/dashboard for venue P&L + VAT position that re-pulls each open.

---

# §G — Module registration, permissions, audit

- Register in `lib/modules-registry.ts`: nav item **"Accounts"**, icon, allowed roles.
- Feature keys (access levels `admin/edit/view/submit` per §5): `accounts/gl`, `accounts/ap`, `accounts/ar`, `accounts/banking`, `accounts/sales`, `accounts/inventory`, `accounts/payroll`, `accounts/fixed-assets`, `accounts/tax` (sensitive), `accounts/reports`, `accounts/settings` (admin only). *(Map to A10.)*
- Enforce approval thresholds (A10) in the submit→approve→post transition.
- Every write goes through a server action → `audit_log`. Sensitive figures (salary in payroll, bank details) gated by permission + RLS.

---

# §H — Build phases (each with Definition of Done)

**Phase 1 — Settings foundation (Tier 1).** legal_entities, venue_entities, fiscal_periods, accounts (COA seeded), dimensions + requirements, system_default_accounts, sequences. Settings UI to view/edit. **DoD:** I can see my entities/TRNs, the seeded COA, active dimensions, and defaults; nothing is hardcoded.

**Phase 2 — Posting engine + manual journals.** posting.ts with balance/period/dimension enforcement at DB + service level; manual JV entry with draft→post; reversal. **DoD:** a manual balanced JV posts; an unbalanced one is rejected by the DB; a posted JV cannot be edited, only reversed; audit rows written.

**Phase 3 — Tax layer + VAT201.** tax_codes, tax_rates (effective-dated), resolver, vat.ts, per-entity return with emirate split. **DoD:** posting with a tax code creates correct VAT lines; VAT201 for one entity/period produces box values with no cross-entity leakage.

**Phase 4 — Sales & settlements.** daily_sales import (A12), sales journal, settlement_channels + reconciliation. **DoD:** a day's sales posts and balances to tenders; a card settlement reconciles with fee and flags differences.

**Phase 5 — AP / AR / Banking.** invoices, payments, allocations, duplicate guard, bank import + matching. **DoD:** a supplier invoice with VAT posts, is paid partially, and the bank line reconciles.

**Phase 6 — Inventory/COGS, Payroll, Fixed assets, Accruals/Prepayments.** **DoD:** period COGS computes from counts; payroll posts wage split + provisions; depreciation run posts.

**Phase 7 — Reporting + Period close.** P&L/BS/CF, KPIs, consolidated view, close checklist + lock. **DoD:** P&L matches ledger; closing a period locks posting; reopen is audited.

**Phase 8 — Opening balances / cutover.** import + single opening journal per entity. **DoD:** trial balance imports and balances; go-live date set.

---

# §I — Verification & tests (required, not optional)

- **DB-level:** trigger tests proving unbalanced entries and posts to closed/non-postable accounts are rejected.
- **Posting engine:** unit tests for balance assertion, tax resolution by date, dimension requirement enforcement, reversal linkage.
- **VAT201:** golden-file test — a fixed set of transactions → expected box values per entity; assert no cross-entity netting.
- **Reports:** P&L/BS reconcile to a computed trial balance; BS balances (Assets = Liabilities + Equity).
- **RLS:** a user without `accounts/tax` cannot read VAT/bank detail.
- Run `pnpm build` + tests before each phase's commit to `david-dev`.

---

## Definition of Done (module)

The build passes; from Modules → **Accounts** I can: configure my entities/COA/tax codes (§A), post a balanced journal that respects periods and dimensions, import a day of sales that reconciles to tenders and settlements, enter a supplier invoice with recoverable VAT, generate a per-entity VAT201, produce a venue P&L and a group consolidated P&L, and close+lock a period — with every write audited and no invariant in §0 violated.
