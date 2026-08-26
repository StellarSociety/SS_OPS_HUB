/** UAE standard VAT rate (5%). Gross is treated as VAT-inclusive. */
export const CERTIFICATION_VAT_RATE = 0.05;

export function splitGrossAtVatRate(
  gross: number,
  rate = CERTIFICATION_VAT_RATE,
): { net: number; vat: number; gross: number } {
  const g =
    Number.isFinite(gross) && gross > 0 ? Math.round(gross * 100) / 100 : 0;
  if (g <= 0) return { net: 0, vat: 0, gross: 0 };
  const divisor = 1 + rate;
  const net = Math.round((g / divisor) * 100) / 100;
  const vat = Math.round((g - net) * 100) / 100;
  return { net, vat, gross: g };
}

/** Reverse of splitGrossAtVatRate — enter net (ex-VAT), derive gross + VAT. */
export function splitNetAtVatRate(
  net: number,
  rate = CERTIFICATION_VAT_RATE,
): { net: number; vat: number; gross: number } {
  const n =
    Number.isFinite(net) && net > 0 ? Math.round(net * 100) / 100 : 0;
  if (n <= 0) return { net: 0, vat: 0, gross: 0 };
  const gross = Math.round(n * (1 + rate) * 100) / 100;
  const vat = Math.round((gross - n) * 100) / 100;
  return { net: n, vat, gross };
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/** VAT as the difference of a stored/typed gross–net pair. */
export function vatFromInclusivePair(gross: number, net: number): number {
  const vat = roundMoney(gross - net);
  return vat > 0 ? vat : 0;
}

/**
 * Restore a saved gross/net pair without re-deriving the side the user typed.
 * Only fill a missing side from the other (legacy rows).
 */
export function loadVatInclusivePair(
  gross: number | null | undefined,
  net: number | null | undefined,
): { gross: string; net: string } {
  const g =
    gross != null && Number.isFinite(gross) && gross > 0
      ? roundMoney(gross)
      : 0;
  const n =
    net != null && Number.isFinite(net) && net > 0 ? roundMoney(net) : 0;
  if (g > 0 && n > 0) {
    return { gross: g.toFixed(2), net: n.toFixed(2) };
  }
  if (g > 0) {
    const split = splitGrossAtVatRate(g);
    return { gross: split.gross.toFixed(2), net: split.net.toFixed(2) };
  }
  if (n > 0) {
    const split = splitNetAtVatRate(n);
    return { gross: split.gross.toFixed(2), net: split.net.toFixed(2) };
  }
  return { gross: "", net: "" };
}

/** Fill missing net/VAT from gross (VAT-inclusive) when needed. */
export function ensureCertificationCostBreakdown(input: {
  cost_value: number;
  cost_net: number;
  cost_vat: number;
}): { cost_value: number; cost_net: number; cost_vat: number } {
  const gross = Number(input.cost_value) || 0;
  let net = Number(input.cost_net) || 0;
  let vat = Number(input.cost_vat) || 0;

  if (gross > 0 && net <= 0 && vat <= 0) {
    const split = splitGrossAtVatRate(gross);
    net = split.net;
    vat = split.vat;
  } else if (gross > 0 && net > 0 && vat <= 0) {
    vat = Math.round((gross - net) * 100) / 100;
    if (vat < 0) vat = 0;
  } else if (gross > 0 && vat > 0 && net <= 0) {
    net = Math.round((gross - vat) * 100) / 100;
    if (net < 0) net = 0;
  } else if (gross <= 0 && net > 0) {
    const split = splitNetAtVatRate(net);
    return {
      cost_value: split.gross,
      cost_net: split.net,
      cost_vat: split.vat,
    };
  }

  return {
    cost_value: gross,
    cost_net: net,
    cost_vat: vat,
  };
}
