import { getWeekDayLabel } from "@/lib/sales/daily-sales-calculations";
import type {
  TaxSettingsInput,
  VenueDailySalesRecord,
} from "@/lib/sales/daily-sales-types";

/** One day of tax entered on Daily Sales tax collection. */
export type TaxCollectionDay = {
  saleDate: string;
  weekDay: string;
  municipalityGs: number;
  /** Share of the entered VAT that is VAT on net revenue. */
  vatGs: number;
  /** Share of the entered VAT that is VAT on the service charge. */
  vatOnServiceChargeGs: number;
  /** Municipality plus both VAT parts. Service charge is excluded. */
  taxTotalGs: number;
  serviceChargeGs: number;
  totalCollectedGs: number;
};

function roundMoney(value: number): number {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

/**
 * Daily Sales stores VAT as one collected amount, including VAT on the
 * service charge. Split that amount with the venue rates so the two parts
 * add back to what was entered.
 */
export function splitCollectedVat(
  vatCollected: number,
  taxSettings: TaxSettingsInput,
): { vatGs: number; vatOnServiceChargeGs: number } {
  const collected = roundMoney(vatCollected);
  const vatOnServiceEffectivePct =
    taxSettings.service_charge_pct *
    (taxSettings.vat_on_service_charge_pct / 100);
  const combinedVatPct = taxSettings.vat_pct + vatOnServiceEffectivePct;

  if (collected === 0 || combinedVatPct <= 0) {
    return { vatGs: collected, vatOnServiceChargeGs: 0 };
  }

  const vatOnServiceChargeGs = roundMoney(
    collected * (vatOnServiceEffectivePct / combinedVatPct),
  );
  return {
    vatGs: roundMoney(collected - vatOnServiceChargeGs),
    vatOnServiceChargeGs,
  };
}

export function taxCollectionDayFromSalesRecord(
  record: VenueDailySalesRecord,
  taxSettings: TaxSettingsInput,
): TaxCollectionDay {
  const municipalityGs = roundMoney(record.municipality_fee_collected_gs);
  const serviceChargeGs = roundMoney(record.service_charge_collected_gs);
  const vatCollected = roundMoney(record.vat_collected_gs);
  const { vatGs, vatOnServiceChargeGs } = splitCollectedVat(
    vatCollected,
    taxSettings,
  );

  return {
    saleDate: record.sale_date,
    weekDay: getWeekDayLabel(record.sale_date),
    municipalityGs,
    vatGs,
    vatOnServiceChargeGs,
    taxTotalGs: roundMoney(municipalityGs + vatGs + vatOnServiceChargeGs),
    serviceChargeGs,
    totalCollectedGs: roundMoney(
      municipalityGs + vatCollected + serviceChargeGs,
    ),
  };
}

export function taxCollectionDaysFromSales(
  records: VenueDailySalesRecord[],
  taxSettings: TaxSettingsInput,
): TaxCollectionDay[] {
  return records
    .map((record) => taxCollectionDayFromSalesRecord(record, taxSettings))
    .sort((a, b) => a.saleDate.localeCompare(b.saleDate));
}
