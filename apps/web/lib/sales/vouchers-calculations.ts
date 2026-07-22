import type { VenueTender } from "./tenders-types";
import {
  normalizeTenderName,
  voucherIssueTenderIds,
} from "./tenders-calculations";
import type {
  ParsedWaiterVoucherComment,
  VenueVoucher,
  VoucherDayAllocation,
  VoucherLedgerSummary,
  VoucherReconciliation,
  VoucherTenderDay,
  VoucherTenderTotals,
} from "./vouchers-types";

export { voucherIssueTenderIds };

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

const ROUNDING = 0.005;

/** Statuses that count toward Voucher Issue tender reconciliation. */
const ISSUE_LEDGER_STATUSES = new Set([
  "issued",
  "redeemed",
  "expired",
]);

export function isVoucherRedeemTender(name: string): boolean {
  return normalizeTenderName(name) === "voucher redeem";
}

export function voucherRedeemTenderIds(
  tenders: ReadonlyArray<Pick<VenueTender, "id" | "name">>,
): Set<string> {
  return new Set(
    tenders.filter((t) => isVoucherRedeemTender(t.name)).map((t) => t.id),
  );
}

export function buildVoucherTenderTotals(
  tenders: ReadonlyArray<Pick<VenueTender, "id" | "name">>,
  tenderTotals: ReadonlyArray<{
    sale_date: string;
    tender_id: string;
    amount_gs: number;
  }>,
): VoucherTenderTotals {
  const issueIds = voucherIssueTenderIds(tenders);
  const redeemIds = voucherRedeemTenderIds(tenders);
  const byDate = new Map<string, VoucherTenderDay>();

  for (const row of tenderTotals) {
    const amount = Number(row.amount_gs) || 0;
    if (amount === 0) continue;
    const isIssue = issueIds.has(row.tender_id);
    const isRedeem = redeemIds.has(row.tender_id);
    if (!isIssue && !isRedeem) continue;

    const current = byDate.get(row.sale_date) ?? {
      sale_date: row.sale_date,
      issue_gs: 0,
      redeem_gs: 0,
    };
    if (isIssue) current.issue_gs = roundMoney(current.issue_gs + amount);
    if (isRedeem) current.redeem_gs = roundMoney(current.redeem_gs + amount);
    byDate.set(row.sale_date, current);
  }

  const days = [...byDate.values()].sort((a, b) =>
    b.sale_date.localeCompare(a.sale_date),
  );

  return {
    issue_gs: roundMoney(days.reduce((sum, d) => sum + d.issue_gs, 0)),
    redeem_gs: roundMoney(days.reduce((sum, d) => sum + d.redeem_gs, 0)),
    days,
  };
}

export function summarizeVoucherLedger(
  vouchers: ReadonlyArray<VenueVoucher>,
): VoucherLedgerSummary {
  const summary: VoucherLedgerSummary = {
    outstanding_gs: 0,
    outstanding_count: 0,
    draft_gs: 0,
    draft_count: 0,
    issued_all_time_gs: 0,
    issued_all_time_count: 0,
    redeemed_gs: 0,
    redeemed_count: 0,
    cancelled_gs: 0,
    cancelled_count: 0,
    expired_gs: 0,
    expired_count: 0,
  };

  for (const voucher of vouchers) {
    const value = Number(voucher.face_value_gs) || 0;
    switch (voucher.status) {
      case "draft":
        summary.draft_gs = roundMoney(summary.draft_gs + value);
        summary.draft_count += 1;
        break;
      case "issued":
        summary.outstanding_gs = roundMoney(summary.outstanding_gs + value);
        summary.outstanding_count += 1;
        summary.issued_all_time_gs = roundMoney(
          summary.issued_all_time_gs + value,
        );
        summary.issued_all_time_count += 1;
        break;
      case "redeemed":
        summary.redeemed_gs = roundMoney(summary.redeemed_gs + value);
        summary.redeemed_count += 1;
        summary.issued_all_time_gs = roundMoney(
          summary.issued_all_time_gs + value,
        );
        summary.issued_all_time_count += 1;
        break;
      case "cancelled":
        summary.cancelled_gs = roundMoney(summary.cancelled_gs + value);
        summary.cancelled_count += 1;
        break;
      case "expired":
        summary.expired_gs = roundMoney(summary.expired_gs + value);
        summary.expired_count += 1;
        summary.issued_all_time_gs = roundMoney(
          summary.issued_all_time_gs + value,
        );
        summary.issued_all_time_count += 1;
        break;
    }
  }

  return summary;
}

export function reconcileVouchers(
  ledger: VoucherLedgerSummary,
  tenders: VoucherTenderTotals,
): VoucherReconciliation {
  return {
    tender_issue_gs: tenders.issue_gs,
    tender_redeem_gs: tenders.redeem_gs,
    ledger_issued_gs: ledger.issued_all_time_gs,
    ledger_redeemed_gs: ledger.redeemed_gs,
    issue_variance_gs: roundMoney(
      tenders.issue_gs - ledger.issued_all_time_gs,
    ),
    redeem_variance_gs: roundMoney(tenders.redeem_gs - ledger.redeemed_gs),
  };
}

function buildDayAllocation(
  saleDate: string,
  tenderGs: number,
  vouchers: VenueVoucher[],
): VoucherDayAllocation {
  const allocated_gs = roundMoney(
    vouchers.reduce((sum, v) => sum + (Number(v.face_value_gs) || 0), 0),
  );
  const remaining_gs = roundMoney(tenderGs - allocated_gs);
  return {
    sale_date: saleDate,
    tender_gs: tenderGs,
    allocated_gs,
    remaining_gs,
    voucher_count: vouchers.length,
    vouchers,
    balanced: Math.abs(remaining_gs) <= ROUNDING,
  };
}

/** Days with Voucher Issue tender amounts, plus ledger vouchers allocated to each. */
export function buildIssueDayAllocations(
  tenderTotals: VoucherTenderTotals,
  vouchers: ReadonlyArray<VenueVoucher>,
): VoucherDayAllocation[] {
  const byDate = new Map<string, VenueVoucher[]>();
  for (const voucher of vouchers) {
    if (!ISSUE_LEDGER_STATUSES.has(voucher.status)) continue;
    const list = byDate.get(voucher.issued_date) ?? [];
    list.push(voucher);
    byDate.set(voucher.issued_date, list);
  }

  return tenderTotals.days
    .filter((day) => day.issue_gs > 0)
    .map((day) => {
      const allocation = buildDayAllocation(
        day.sale_date,
        day.issue_gs,
        byDate.get(day.sale_date) ?? [],
      );
      return {
        ...allocation,
        issue_gs: day.issue_gs,
        tender_gs: day.issue_gs,
      };
    })
    .sort((a, b) => b.sale_date.localeCompare(a.sale_date));
}

/** Issue days that have a Voucher Issue tender amount on daily / waiter sales. */
export function issueDaysWithVoucherIssueTender(
  allocations: VoucherDayAllocation[],
): VoucherDayAllocation[] {
  return allocations.filter((day) => (day.issue_gs ?? day.tender_gs) > 0);
}

export function voucherIssueAmount(day: VoucherDayAllocation): number {
  return day.issue_gs ?? day.tender_gs;
}

export function voucherRedeemAmount(day: VoucherDayAllocation): number {
  return day.redeem_gs ?? day.tender_gs;
}

/** Ledger-only issue days (no Voucher Issue tender recorded yet). */
export function issueDaysWithoutVoucherIssueTender(
  allocations: VoucherDayAllocation[],
  vouchers: ReadonlyArray<VenueVoucher>,
): VoucherDayAllocation[] {
  const datesWithIssueTender = new Set(
    allocations
      .filter((d) => (d.issue_gs ?? d.tender_gs) > 0)
      .map((d) => d.sale_date),
  );
  const byDate = new Map<string, VenueVoucher[]>();
  for (const voucher of vouchers) {
    if (!ISSUE_LEDGER_STATUSES.has(voucher.status)) continue;
    if (datesWithIssueTender.has(voucher.issued_date)) continue;
    const list = byDate.get(voucher.issued_date) ?? [];
    list.push(voucher);
    byDate.set(voucher.issued_date, list);
  }
  return [...byDate.entries()]
    .map(([sale_date, list]) => buildDayAllocation(sale_date, 0, list))
    .sort((a, b) => b.sale_date.localeCompare(a.sale_date));
}

/**
 * Voucher Issue / Redeem tender totals from daily sales, falling back to the
 * sum of waiter sales tender lines when daily totals are missing for a date.
 */
export function buildVoucherTenderTotalsMerged(
  tenders: ReadonlyArray<Pick<VenueTender, "id" | "name">>,
  dailyTenderTotals: ReadonlyArray<{
    sale_date: string;
    tender_id: string;
    amount_gs: number;
  }>,
  waiterEntries: ReadonlyArray<{
    sale_date: string;
    tender_amounts: Record<string, number>;
  }>,
): VoucherTenderTotals {
  const issueIds = voucherIssueTenderIds(tenders);
  const redeemIds = voucherRedeemTenderIds(tenders);

  const dailyByDate = new Map<
    string,
    { issue_gs: number; redeem_gs: number; hasIssueRow: boolean; hasRedeemRow: boolean }
  >();

  for (const row of dailyTenderTotals) {
    const amount = Number(row.amount_gs) || 0;
    if (amount === 0) continue;
    const isIssue = issueIds.has(row.tender_id);
    const isRedeem = redeemIds.has(row.tender_id);
    if (!isIssue && !isRedeem) continue;

    const current = dailyByDate.get(row.sale_date) ?? {
      issue_gs: 0,
      redeem_gs: 0,
      hasIssueRow: false,
      hasRedeemRow: false,
    };
    if (isIssue) {
      current.issue_gs = roundMoney(current.issue_gs + amount);
      current.hasIssueRow = true;
    }
    if (isRedeem) {
      current.redeem_gs = roundMoney(current.redeem_gs + amount);
      current.hasRedeemRow = true;
    }
    dailyByDate.set(row.sale_date, current);
  }

  const waiterByDate = new Map<string, { issue_gs: number; redeem_gs: number }>();

  for (const entry of waiterEntries) {
    let issueSum = 0;
    let redeemSum = 0;
    for (const [tenderId, raw] of Object.entries(entry.tender_amounts ?? {})) {
      const amount = Number(raw) || 0;
      if (amount === 0) continue;
      if (issueIds.has(tenderId)) issueSum += amount;
      if (redeemIds.has(tenderId)) redeemSum += amount;
    }
    if (issueSum === 0 && redeemSum === 0) continue;

    const current = waiterByDate.get(entry.sale_date) ?? {
      issue_gs: 0,
      redeem_gs: 0,
    };
    current.issue_gs = roundMoney(current.issue_gs + issueSum);
    current.redeem_gs = roundMoney(current.redeem_gs + redeemSum);
    waiterByDate.set(entry.sale_date, current);
  }

  const allDates = new Set([
    ...dailyByDate.keys(),
    ...waiterByDate.keys(),
  ]);

  const days: VoucherTenderDay[] = [];
  for (const sale_date of allDates) {
    const daily = dailyByDate.get(sale_date);
    const waiter = waiterByDate.get(sale_date);

    const issue_gs = roundMoney(
      daily?.hasIssueRow ? daily.issue_gs : (waiter?.issue_gs ?? 0),
    );
    const redeem_gs = roundMoney(
      daily?.hasRedeemRow ? daily.redeem_gs : (waiter?.redeem_gs ?? 0),
    );

    if (issue_gs === 0 && redeem_gs === 0) continue;
    days.push({ sale_date, issue_gs, redeem_gs });
  }

  days.sort((a, b) => b.sale_date.localeCompare(a.sale_date));

  return {
    issue_gs: roundMoney(days.reduce((sum, d) => sum + d.issue_gs, 0)),
    redeem_gs: roundMoney(days.reduce((sum, d) => sum + d.redeem_gs, 0)),
    days,
  };
}

/** Days with Voucher Redeem tender amounts, plus vouchers redeemed that day. */
export function buildRedeemDayAllocations(
  tenderTotals: VoucherTenderTotals,
  vouchers: ReadonlyArray<VenueVoucher>,
): VoucherDayAllocation[] {
  const byDate = new Map<string, VenueVoucher[]>();
  for (const voucher of vouchers) {
    if (voucher.status !== "redeemed" || !voucher.redeemed_date) continue;
    const list = byDate.get(voucher.redeemed_date) ?? [];
    list.push(voucher);
    byDate.set(voucher.redeemed_date, list);
  }

  return tenderTotals.days
    .filter((day) => day.redeem_gs > 0)
    .map((day) => {
      const allocation = buildDayAllocation(
        day.sale_date,
        day.redeem_gs,
        byDate.get(day.sale_date) ?? [],
      );
      return {
        ...allocation,
        redeem_gs: day.redeem_gs,
        tender_gs: day.redeem_gs,
      };
    })
    .sort((a, b) => b.sale_date.localeCompare(a.sale_date));
}

export function redeemDaysWithVoucherRedeemTender(
  allocations: VoucherDayAllocation[],
): VoucherDayAllocation[] {
  return allocations.filter((day) => (day.redeem_gs ?? day.tender_gs) > 0);
}

export function recentIssuedVouchers(
  vouchers: ReadonlyArray<VenueVoucher>,
  limit = 8,
): VenueVoucher[] {
  return vouchers
    .filter((v) => ISSUE_LEDGER_STATUSES.has(v.status))
    .slice()
    .sort((a, b) => {
      const dateCmp = b.issued_date.localeCompare(a.issued_date);
      if (dateCmp !== 0) return dateCmp;
      return b.created_at.localeCompare(a.created_at);
    })
    .slice(0, limit);
}

export function recentRedeemedVouchers(
  vouchers: ReadonlyArray<VenueVoucher>,
  limit = 8,
): VenueVoucher[] {
  return vouchers
    .filter((v) => v.status === "redeemed" && v.redeemed_date)
    .slice()
    .sort((a, b) => {
      const dateCmp = (b.redeemed_date ?? "").localeCompare(
        a.redeemed_date ?? "",
      );
      if (dateCmp !== 0) return dateCmp;
      return b.created_at.localeCompare(a.created_at);
    })
    .slice(0, limit);
}

/**
 * Parse waiter "Voucher Issue Comments" lines.
 * Expected format per bullet: Name | Number | Value
 */
export function parseWaiterVoucherCommentLine(
  rawLine: string,
): { voucher_name: string; voucher_number: string; face_value_gs: number } | null {
  const text = rawLine.replace(/^\u2022\s?/, "").trim();
  if (!text) return null;

  const parts = text.split("|").map((part) => part.trim());
  if (parts.length < 2) return null;

  let voucher_name = "";
  let voucher_number = "";
  let valueRaw = "";

  if (parts.length >= 3) {
    voucher_name = parts[0] ?? "";
    voucher_number = parts[1] ?? "";
    valueRaw = parts[2] ?? "";
  } else {
    voucher_number = parts[0] ?? "";
    valueRaw = parts[1] ?? "";
  }

  const face_value_gs = Number(valueRaw.replace(/[^0-9.-]/g, ""));
  if (!voucher_number || !Number.isFinite(face_value_gs) || face_value_gs < 0) {
    return null;
  }

  return {
    voucher_name,
    voucher_number,
    face_value_gs: roundMoney(face_value_gs),
  };
}

export function collectWaiterVoucherSuggestions(
  waiterEntries: ReadonlyArray<{
    id: string;
    sale_date: string;
    voucher_comments: string | null;
  }>,
  existingNumbers: ReadonlySet<string>,
): ParsedWaiterVoucherComment[] {
  const suggestions: ParsedWaiterVoucherComment[] = [];
  const seen = new Set<string>();

  for (const entry of waiterEntries) {
    const comments = entry.voucher_comments ?? "";
    if (!comments.trim()) continue;

    for (const line of comments.split("\n")) {
      const parsed = parseWaiterVoucherCommentLine(line);
      if (!parsed) continue;

      const key = parsed.voucher_number.trim().toLowerCase();
      if (!key || existingNumbers.has(key) || seen.has(key)) continue;
      seen.add(key);

      suggestions.push({
        ...parsed,
        sale_date: entry.sale_date,
        waiter_sales_id: entry.id,
        raw: line.replace(/^\u2022\s?/, "").trim(),
      });
    }
  }

  return suggestions.sort((a, b) => b.sale_date.localeCompare(a.sale_date));
}

export function formatLocalDate(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
