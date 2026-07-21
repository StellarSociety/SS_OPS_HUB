import type { VenueTender } from "./tenders-types";
import {
  normalizeTenderName,
  voucherIssueTenderIds,
} from "./tenders-calculations";
import type {
  ParsedWaiterVoucherComment,
  VenueVoucher,
  VoucherLedgerSummary,
  VoucherReconciliation,
  VoucherTenderDay,
  VoucherTenderTotals,
} from "./vouchers-types";

export { voucherIssueTenderIds };

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

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

  const face_value_gs = Number(
    valueRaw.replace(/[^0-9.-]/g, ""),
  );
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
