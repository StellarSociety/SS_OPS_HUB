import type {
  VenueVoucher,
  VoucherStatus,
  VoucherTenderTotals,
} from "@/lib/sales/vouchers-types";
import { VOUCHER_STATUS_LABELS } from "@/lib/sales/vouchers-types";

const ISSUE_LEDGER_STATUSES = new Set<VoucherStatus>([
  "issued",
  "redeemed",
  "expired",
]);

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function monthPrefix(date: string | null | undefined): string | null {
  if (!date || date.length < 7) return null;
  return date.slice(0, 7);
}

function dateInMonth(date: string, month: string): boolean {
  return monthPrefix(date) === month;
}

function tenderDay(
  tenderTotals: VoucherTenderTotals,
  saleDate: string,
): { issue_gs: number; redeem_gs: number } {
  const day = tenderTotals.days.find((d) => d.sale_date === saleDate);
  return {
    issue_gs: day?.issue_gs ?? 0,
    redeem_gs: day?.redeem_gs ?? 0,
  };
}

function daysBetween(from: string, to: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return null;
  }
  const start = Date.parse(`${from}T12:00:00`);
  const end = Date.parse(`${to}T12:00:00`);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return Math.round((end - start) / (1000 * 60 * 60 * 24));
}

export type VoucherExportInclusionReason =
  | "issued_in_month"
  | "redeemed_in_month"
  | "draft_created_in_month";

export function voucherExportInclusionReasons(
  voucher: VenueVoucher,
  month: string,
): VoucherExportInclusionReason[] {
  const reasons: VoucherExportInclusionReason[] = [];
  if (dateInMonth(voucher.issued_date, month)) {
    reasons.push("issued_in_month");
  }
  if (voucher.redeemed_date && dateInMonth(voucher.redeemed_date, month)) {
    reasons.push("redeemed_in_month");
  }
  if (
    voucher.status === "draft" &&
    dateInMonth(voucher.created_at.slice(0, 10), month)
  ) {
    reasons.push("draft_created_in_month");
  }
  return reasons;
}

export function filterVouchersForExportMonth(
  vouchers: ReadonlyArray<VenueVoucher>,
  month: string,
): VenueVoucher[] {
  return vouchers
    .filter((v) => voucherExportInclusionReasons(v, month).length > 0)
    .slice()
    .sort((a, b) => {
      const dateA = a.redeemed_date ?? a.issued_date;
      const dateB = b.redeemed_date ?? b.issued_date;
      return dateB.localeCompare(dateA);
    });
}

export function listAvailableExportMonths(
  vouchers: ReadonlyArray<VenueVoucher>,
  tenderTotals: VoucherTenderTotals,
): string[] {
  const months = new Set<string>();
  for (const voucher of vouchers) {
    const issued = monthPrefix(voucher.issued_date);
    if (issued) months.add(issued);
    const redeemed = monthPrefix(voucher.redeemed_date);
    if (redeemed) months.add(redeemed);
    const created = monthPrefix(voucher.created_at.slice(0, 10));
    if (created) months.add(created);
  }
  for (const day of tenderTotals.days) {
    if (day.issue_gs > 0 || day.redeem_gs > 0) {
      const m = monthPrefix(day.sale_date);
      if (m) months.add(m);
    }
  }
  return [...months].sort((a, b) => b.localeCompare(a));
}

export function defaultExportMonth(available: string[]): string {
  if (available.length > 0) return available[0];
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export type MonthlyVoucherReconciliationSummary = {
  pos_issue_tender_gs: number;
  ledger_issued_gs: number;
  issue_variance_gs: number;
  pos_redeem_tender_gs: number;
  ledger_redeemed_gs: number;
  redeem_variance_gs: number;
  voucher_row_count: number;
};

export function summarizeMonthForExport(
  vouchers: ReadonlyArray<VenueVoucher>,
  tenderTotals: VoucherTenderTotals,
  month: string,
): MonthlyVoucherReconciliationSummary {
  let pos_issue_tender_gs = 0;
  let pos_redeem_tender_gs = 0;
  for (const day of tenderTotals.days) {
    if (!dateInMonth(day.sale_date, month)) continue;
    pos_issue_tender_gs = roundMoney(pos_issue_tender_gs + (day.issue_gs || 0));
    pos_redeem_tender_gs = roundMoney(
      pos_redeem_tender_gs + (day.redeem_gs || 0),
    );
  }

  let ledger_issued_gs = 0;
  let ledger_redeemed_gs = 0;
  for (const voucher of vouchers) {
    const value = Number(voucher.face_value_gs) || 0;
    if (
      ISSUE_LEDGER_STATUSES.has(voucher.status) &&
      dateInMonth(voucher.issued_date, month)
    ) {
      ledger_issued_gs = roundMoney(ledger_issued_gs + value);
    }
    if (
      voucher.status === "redeemed" &&
      voucher.redeemed_date &&
      dateInMonth(voucher.redeemed_date, month)
    ) {
      ledger_redeemed_gs = roundMoney(ledger_redeemed_gs + value);
    }
  }

  const filtered = filterVouchersForExportMonth(vouchers, month);

  return {
    pos_issue_tender_gs,
    ledger_issued_gs,
    issue_variance_gs: roundMoney(pos_issue_tender_gs - ledger_issued_gs),
    pos_redeem_tender_gs,
    ledger_redeemed_gs,
    redeem_variance_gs: roundMoney(pos_redeem_tender_gs - ledger_redeemed_gs),
    voucher_row_count: filtered.length,
  };
}

const INCLUSION_LABELS: Record<VoucherExportInclusionReason, string> = {
  issued_in_month: "Issued in month",
  redeemed_in_month: "Redeemed in month",
  draft_created_in_month: "Draft created in month",
};

function csvCell(value: string | number | null | undefined): string {
  const raw = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

function csvRow(cells: Array<string | number | null | undefined>): string {
  return cells.map(csvCell).join(",");
}

export type BuildMonthlyVoucherExportCsvInput = {
  venueName: string;
  month: string;
  vouchers: ReadonlyArray<VenueVoucher>;
  tenderTotals: VoucherTenderTotals;
  tenderNameById: ReadonlyMap<string, string>;
  generatedAt?: Date;
};

export function buildMonthlyVoucherExportCsv(
  input: BuildMonthlyVoucherExportCsvInput,
): string {
  const {
    venueName,
    month,
    vouchers,
    tenderTotals,
    tenderNameById,
    generatedAt = new Date(),
  } = input;

  const summary = summarizeMonthForExport(vouchers, tenderTotals, month);
  const rows = filterVouchersForExportMonth(vouchers, month);

  const lines: string[] = [];

  lines.push(csvRow(["Voucher monthly export (finance reconciliation)"]));
  lines.push(csvRow(["Venue", venueName]));
  lines.push(csvRow(["Calendar month", month]));
  lines.push(
    csvRow(["Generated at (UTC)", generatedAt.toISOString().replace(/\.\d{3}Z$/, "Z")]),
  );
  lines.push(
    csvRow([
      "Purpose",
      "Match POS Voucher Issue/Redeem tenders to voucher ledger; payment form shows how the guest paid when the voucher was sold (bank/card/cash), separate from POS voucher tenders.",
    ]),
  );
  lines.push("");

  lines.push(csvRow(["RECONCILIATION SUMMARY"]));
  lines.push(csvRow(["Metric", "Amount (Gs)"]));
  lines.push(
    csvRow([
      "POS Voucher Issue tender (month total)",
      summary.pos_issue_tender_gs.toFixed(2),
    ]),
  );
  lines.push(
    csvRow([
      "Ledger issued face value (issued_date in month)",
      summary.ledger_issued_gs.toFixed(2),
    ]),
  );
  lines.push(
    csvRow(["Issue variance (POS − ledger)", summary.issue_variance_gs.toFixed(2)]),
  );
  lines.push(
    csvRow([
      "POS Voucher Redeem tender (month total)",
      summary.pos_redeem_tender_gs.toFixed(2),
    ]),
  );
  lines.push(
    csvRow([
      "Ledger redeemed face value (redeemed_date in month)",
      summary.ledger_redeemed_gs.toFixed(2),
    ]),
  );
  lines.push(
    csvRow([
      "Redeem variance (POS − ledger)",
      summary.redeem_variance_gs.toFixed(2),
    ]),
  );
  lines.push(csvRow(["Voucher detail rows", summary.voucher_row_count]));
  lines.push("");

  lines.push(csvRow(["VOUCHER DETAIL"]));
  lines.push(
    csvRow([
      "voucher_number",
      "voucher_name",
      "status",
      "face_value_gs",
      "payment_form_tender",
      "purchaser_name",
      "recipient_name",
      "issued_date",
      "pos_voucher_issue_tender_day_gs",
      "redeemed_date",
      "pos_voucher_redeem_tender_day_gs",
      "expires_date",
      "outstanding_liability",
      "days_issued_to_redeem",
      "included_in_export_because",
      "notes",
      "source",
      "record_created_at",
      "record_updated_at",
    ]),
  );

  for (const voucher of rows) {
    const paymentForm = voucher.payment_form_tender_id
      ? (tenderNameById.get(voucher.payment_form_tender_id) ?? "")
      : "";
    const issueDay = tenderDay(tenderTotals, voucher.issued_date);
    const redeemDay = voucher.redeemed_date
      ? tenderDay(tenderTotals, voucher.redeemed_date)
      : { issue_gs: 0, redeem_gs: 0 };

    const outstanding =
      voucher.status === "issued"
        ? Number(voucher.face_value_gs).toFixed(2)
        : voucher.status === "draft"
          ? "Draft (not issued)"
          : "";

    const reasons = voucherExportInclusionReasons(voucher, month)
      .map((r) => INCLUSION_LABELS[r])
      .join("; ");

    lines.push(
      csvRow([
        voucher.voucher_number,
        voucher.voucher_name,
        VOUCHER_STATUS_LABELS[voucher.status],
        Number(voucher.face_value_gs).toFixed(2),
        paymentForm,
        voucher.purchaser_name,
        voucher.recipient_name,
        voucher.issued_date,
        issueDay.issue_gs > 0 ? issueDay.issue_gs.toFixed(2) : "",
        voucher.redeemed_date ?? "",
        redeemDay.redeem_gs > 0 ? redeemDay.redeem_gs.toFixed(2) : "",
        voucher.expires_date ?? "",
        outstanding,
        voucher.redeemed_date
          ? (daysBetween(voucher.issued_date, voucher.redeemed_date) ?? "")
          : "",
        reasons,
        voucher.notes,
        voucher.source,
        voucher.created_at,
        voucher.updated_at,
      ]),
    );
  }

  return lines.join("\r\n");
}

export function voucherExportFilename(
  venueName: string,
  month: string,
): string {
  const slug = venueName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug || "venue"}-vouchers-${month}.csv`;
}

export function downloadTextFile(
  contents: string,
  filename: string,
  mimeType = "text/csv;charset=utf-8",
): void {
  const bom = "\uFEFF";
  const blob = new Blob([bom + contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
