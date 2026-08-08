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
    const split = splitGrossAtVatRate(Math.round(net * 1.05 * 100) / 100);
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
