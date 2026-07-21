import type { VenueTender } from "./tenders-types";

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function normalizeTenderName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Voucher Issue tracks gift vouchers sold / issued. It is not food revenue and
 * is not a payment toward waiter Sales Total — exclude it when matching tenders
 * to revenue or to Sales + CC Gratuity. Voucher Redeem remains included.
 */
export function isVoucherIssueTender(name: string): boolean {
  return normalizeTenderName(name) === "voucher issue";
}

export function voucherIssueTenderIds(
  tenders: ReadonlyArray<Pick<VenueTender, "id" | "name">>,
): Set<string> {
  return new Set(
    tenders.filter((tender) => isVoucherIssueTender(tender.name)).map((t) => t.id),
  );
}

export function sumTenderAmounts(
  amounts: Record<string, number>,
  options?: { excludeTenderIds?: ReadonlySet<string> },
): number {
  const exclude = options?.excludeTenderIds;
  let sum = 0;
  for (const [tenderId, amount] of Object.entries(amounts)) {
    if (exclude?.has(tenderId)) continue;
    sum += Number(amount) || 0;
  }
  return roundMoney(sum);
}

/** Tender total used for Sales Total ↔ revenue / waiter balance checks. */
export function sumSalesMatchingTenderAmounts(
  amounts: Record<string, number>,
  tenders: ReadonlyArray<Pick<VenueTender, "id" | "name">>,
): number {
  return sumTenderAmounts(amounts, {
    excludeTenderIds: voucherIssueTenderIds(tenders),
  });
}

export function sumVoucherIssueAmount(
  amounts: Record<string, number>,
  tenders: ReadonlyArray<Pick<VenueTender, "id" | "name">>,
): number {
  const ids = voucherIssueTenderIds(tenders);
  let sum = 0;
  for (const id of ids) {
    sum += Number(amounts[id]) || 0;
  }
  return roundMoney(sum);
}
