# Cursor Prompt 08 — Accounts: Invoices (supplier invoices → journal)

**Part of:** Accounts module (see `docs/cursor-prompts/07-accounts-module.md`).
**Scope of this pass:** the **Invoices** area — recording **supplier / purchase invoices (Accounts Payable)** and turning each posted invoice into a balanced double-entry journal via the posting engine. Sales revenue is handled by the Sales/`daily_sales` flow, not here. Customer (AR) invoices are out of scope now — **leave a clean seam** so an "Sales Invoices" sibling can be added later.

> Read `docs/ARCHITECTURE_BLUEPRINT.md` (§5 permissions, §6 module pattern, §14 conventions) and prompt 07 (§B data model, §C posting engine, §0 invariants). Follow the same pattern: RLS on every table, `venue_id`/`entity_id` on every record, register nav in `lib/modules-registry.ts`, feature keys with access levels `admin/edit/view/submit`, every write through a server action that appends to `audit_log`. **The UI look/feel is yours to interpret from the existing app shell — reuse the current design system, table, form, and layout components; don't invent a new visual language.**

---

## Non-negotiables carried from prompt 07

- An invoice only affects the ledger when it reaches **posted**; posting goes through `lib/accounts/posting.ts`, never by writing `journal_lines` directly.
- A **posted** invoice is immutable — correct by reversal/credit note, never edit-in-place.
- **Never hardcode VAT** — resolve rate by `(tax_code, invoice_date)` from `tax_rates`.
- **Duplicate guard:** `unique(entity_id, supplier_id, supplier_invoice_no)`.
- `entity_id` is derived from the selected `venue_id` via `venue_entities` — the user picks a venue, not an entity.

---

## Sidebar & routes

Add **"Invoices"** to the Accounts section of the sidebar (via `lib/modules-registry.ts`, gated by feature key `accounts/ap`). Subpages:

| Nav label | Route | Purpose |
|---|---|---|
| **All Invoices** (default) | `/accounts/invoices` | Table / database of every invoice with filters, search, bulk actions. |
| **New Invoice** | `/accounts/invoices/new` | The entry form. |
| **Invoice detail** | `/accounts/invoices/[id]` | Read view + status actions, the generated journal, attachments, history. |
| **Approvals** | `/accounts/invoices/approvals` | Queue of `submitted` invoices awaiting approve/post (respects thresholds). |
| **Insights** | `/accounts/invoices/insights` | Spend, VAT recoverable, aging, supplier & category analytics. |
| **Suppliers** | `/accounts/invoices/suppliers` | Supplier master (create/edit, TRN, terms) — backs the entry form. |

> Consider a top-level segmented control on `/accounts/invoices` reserved for `Purchases | Sales` so AR can be added later without new nav. Ship only "Purchases" now.

---

## Data model (extends prompt 07 §B)

Reuse/confirm these tables (create if not yet built):

- **`suppliers`** — id, entity_id, venue_id, name, trn, default_expense_account_id, payment_terms_days, default_tax_code_id, active, created_by, timestamps.
- **`ap_invoices`** — id, entity_id (derived), venue_id, invoice_no (internal, from `sequences` doc_type `AP`), supplier_id, supplier_invoice_no, invoice_date, due_date (default = invoice_date + terms), currency default 'AED', fx_rate, memo, status `draft|submitted|approved|posted|reversed|void`, subtotal_net, tax_total, total_gross (all `numeric(14,3)`), journal_entry_id (nullable until posted), attachment_url, created_by, submitted_by, approved_by, posted_by, posted_at, timestamps. **Unique** `(entity_id, supplier_id, supplier_invoice_no)`.
- **`ap_invoice_lines`** — id, ap_invoice_id, line_no, description, account_id (must be a **postable** expense/inventory/fixed-asset account), quantity, unit_price, net_amount, tax_code_id, tax_amount (computed via resolver), gross_amount, plus dimension tags (`journal_line_dimensions` per prompt 07). Required dimensions enforced from `dimension_requirements`.
- Seams (don't build yet, reference only): `ap_payments`, `ap_allocations`, `ap_credit_notes`.

RLS: select for users with `accounts/ap` (view+); writes via server action / service role only.

---

## Entry form — `/accounts/invoices/new`

**Header:** Venue (→ derives entity, shown read-only), Supplier (searchable; "＋ new supplier" inline → Suppliers), Supplier invoice no., Invoice date, Due date (auto from terms, editable), Currency (default AED; if ≠ AED show FX rate), Memo/reference, **Attachment upload** (PDF/image of the bill — required to submit).

**Lines (repeatable grid):** Description · Expense/Inventory/Asset account (searchable, postable-only; defaults from supplier) · Qty · Unit price · **Net** · Tax code (defaults from supplier; e.g. `SP` 5% purchases, `ZP`, `BL` blocked, `RC` reverse charge) · **VAT** (auto from resolver) · **Gross** · dimension chips (Department/Cost Centre/Supplier auto/Project) per requirement matrix.

**Footer totals:** Subtotal net, VAT total, **Gross total** — live. Show a small **"Journal preview"** panel that renders the balanced entry the invoice will post (see mapping below) so the user sees the accounting before saving.

**Actions:** `Save draft` · `Submit for approval`. Validate: supplier + invoice no + date + ≥1 line + attachment; duplicate check on blur of supplier invoice no; every line has account + tax code + required dimensions; totals reconcile.

---

## Posting mapping (via `postJournal`, source_type `ap`)

On **post** (after approval), generate one balanced journal, `source_ref = ap_invoices.id`:

- For each line: **Dr** line.account_id for **net_amount** (for `BL` blocked-input, Dr the expense account for the **gross** — VAT not recoverable).
- **Dr** Input VAT (`system_default_accounts` → 2320) for total recoverable `tax_amount`.
- **Cr** AP control (2110) for **total_gross**, dimension: Supplier.
- **Reverse charge (`RC`):** additionally **Dr** Input VAT and **Cr** Output VAT (2310) for the self-assessed amount (nets to zero cash, both VAT201 boxes populated).
- Assert `SUM(debit) = SUM(credit)`; write `ap_invoices.journal_entry_id`; append `audit_log`.

**Reversal / void:** `void` a draft (soft). A posted invoice is reversed by `reverseJournal` (mirror entry, linked) and/or a credit note — never edited.

---

## Status workflow & approvals

`draft → submitted → approved → posted` (+ `reversed`/`void`). Enforce **approval thresholds from prompt 07 §A10**: a `Bookkeeper` (`accounts/ap = edit`) can save/submit but not post; approve/post requires `admin` or a role whose limit ≥ invoice gross. The **Approvals** page lists `submitted` invoices with approve+post / reject (with reason) actions; rejection returns to draft with a note. Every transition writes `audit_log`.

---

## All Invoices table — `/accounts/invoices`

Reuse the app's existing table component. Columns: internal invoice_no, supplier, supplier invoice no, invoice_date, due_date, venue, net, VAT, gross, **status badge**, age/days-to-due. Filters: status, supplier, venue/entity, date range, tax code, category/account, has-attachment. Search across supplier + invoice numbers + memo. Row actions: open, edit (draft only), submit, approve/post (if permitted), reverse. Bulk: export (xlsx/csv), bulk submit. Saved default filter = "Needs action".

---

## Insights — `/accounts/invoices/insights`

Venue/entity + period filters. Show (computed from posted invoices, never stored):

- **Total purchases** this period + MoM trend line.
- **Spend by supplier** (top N) and **by category/account**.
- **Recoverable input VAT** for the period (feeds VAT201) vs blocked/non-recoverable.
- **AP aging** buckets: current / 1–30 / 31–60 / 61–90 / 90+ (from due_date on unpaid/posted).
- **Status funnel** (draft/submitted/approved/posted counts) and average approval time.
- **Duplicate / anomaly flags** (same supplier+amount+date near-matches).

Consider building Insights as a live artifact/dashboard that re-pulls on open.

---

## Suppliers — `/accounts/invoices/suppliers`

CRUD for the supplier master: name, TRN, default expense account, default tax code, payment terms, active flag, venue/entity scope. Used to prefill the entry form. Admin/edit gated by `accounts/ap`.

---

## Registration, permissions, audit

- Register nav + subroutes in `lib/modules-registry.ts` under Accounts; feature key **`accounts/ap`** with levels `admin/edit/view/submit`.
- All writes = server actions → `audit_log` (actor, before/after, source).
- RLS on `suppliers`, `ap_invoices`, `ap_invoice_lines`.

---

## Definition of Done

From the sidebar I can open **Invoices → New Invoice**, pick a venue (entity derives), select/create a supplier, add lines with accounts + tax codes + dimensions, attach the bill, and see a live **journal preview + gross total**. Saving submits it; an authorized user approves and posts it; posting creates a **balanced** journal (Dr expense/inventory + Dr recoverable input VAT, Cr AP), respects blocked-input and reverse-charge rules, and is **immutable** thereafter (reversal only). A duplicate supplier invoice no. is rejected. The **All Invoices** table filters/searches and exports; **Insights** shows spend, recoverable VAT, and AP aging; every action is audited. `pnpm build` + tests pass; commit to `david-dev`.

### Tests (required)

- Posting: net + VAT + gross reconcile; `SR`/`SP`, `ZP`, `BL` (gross to expense, no input VAT), `RC` (dual VAT) each produce the correct balanced entry.
- Duplicate guard rejects `(entity, supplier, supplier_invoice_no)` repeat.
- A posted invoice cannot be edited; reversal creates a linked mirror entry.
- Threshold: a below-limit approver cannot post an over-limit invoice.
- RLS: a user without `accounts/ap` cannot read invoices.
