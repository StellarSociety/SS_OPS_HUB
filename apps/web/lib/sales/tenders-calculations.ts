import type { VenueTender } from "./tenders-types";

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function normalizeTenderName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Voucher Issue tracks gift vouchers sold / issued. Voucher Redeem tracks
 * liability drawdown. Neither is a guest payment toward Sales Total — exclude
 * both from Payment Total / sales-matching tender sums.
 */
export function isVoucherIssueTender(name: string): boolean {
  const normalized = normalizeTenderName(name);
  return normalized === "voucher issue" || normalized === "voucher";
}

/** Voucher Issue / Redeem (and legacy names) — not real payment forms. */
export function isVoucherRelatedTender(name: string): boolean {
  const normalized = normalizeTenderName(name);
  return (
    normalized === "voucher" ||
    normalized === "voucher issue" ||
    normalized === "voucher redeem" ||
    normalized === "redeemed voucher"
  );
}

export function isVoucherRedeemTender(name: string): boolean {
  const normalized = normalizeTenderName(name);
  return (
    normalized === "voucher redeem" || normalized === "redeemed voucher"
  );
}

/**
 * Display order: normal tenders by sort_order, then Voucher Issue, then
 * Voucher Redeem — always last.
 */
export function sortTendersForDisplay<
  T extends Pick<VenueTender, "name" | "sort_order">,
>(tenders: ReadonlyArray<T>): T[] {
  return [...tenders].sort((a, b) => {
    const aBucket = tenderDisplayBucket(a.name);
    const bBucket = tenderDisplayBucket(b.name);
    if (aBucket !== bBucket) return aBucket - bBucket;
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.name.localeCompare(b.name);
  });
}

function tenderDisplayBucket(name: string): number {
  if (isVoucherIssueTender(name)) return 1;
  if (isVoucherRedeemTender(name)) return 2;
  return 0;
}

/** Keep voucher tenders at the end after a manual drag reorder. */
export function pinVoucherTendersToEnd(
  orderedIds: ReadonlyArray<string>,
  tenders: ReadonlyArray<Pick<VenueTender, "id" | "name">>,
): string[] {
  const byId = new Map(tenders.map((t) => [t.id, t]));
  const normal: string[] = [];
  const issues: string[] = [];
  const redeems: string[] = [];
  for (const id of orderedIds) {
    const tender = byId.get(id);
    if (!tender) {
      normal.push(id);
      continue;
    }
    if (isVoucherIssueTender(tender.name)) issues.push(id);
    else if (isVoucherRedeemTender(tender.name)) redeems.push(id);
    else normal.push(id);
  }
  return [...normal, ...issues, ...redeems];
}

/** Active tenders marked for voucher Payment Form dropdowns. */
export function paymentFormTenders(
  tenders: ReadonlyArray<VenueTender>,
): VenueTender[] {
  return tenders.filter(
    (tender) =>
      tender.status === "active" &&
      tender.voucher_payment_form &&
      !isVoucherRelatedTender(tender.name),
  );
}

export function voucherIssueTenderIds(
  tenders: ReadonlyArray<Pick<VenueTender, "id" | "name">>,
): Set<string> {
  return new Set(
    tenders.filter((tender) => isVoucherIssueTender(tender.name)).map((t) => t.id),
  );
}

export function voucherRelatedTenderIds(
  tenders: ReadonlyArray<Pick<VenueTender, "id" | "name">>,
): Set<string> {
  return new Set(
    tenders
      .filter((tender) => isVoucherRelatedTender(tender.name))
      .map((t) => t.id),
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

/** Payment Total — excludes Voucher Issue and Voucher Redeem. */
export function sumSalesMatchingTenderAmounts(
  amounts: Record<string, number>,
  tenders: ReadonlyArray<Pick<VenueTender, "id" | "name">>,
): number {
  return sumTenderAmounts(amounts, {
    excludeTenderIds: voucherRelatedTenderIds(tenders),
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
