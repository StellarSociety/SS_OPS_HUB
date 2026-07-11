import type {
  ComputedDailySales,
  TaxSettingsInput,
  VenueDailySalesRecord,
  VenueSalesTaxSettings,
} from "./daily-sales-types";

const WEEK_DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;
const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export function totalTaxRatePct(settings: TaxSettingsInput): number {
  return (
    settings.municipality_fee_pct +
    settings.vat_pct +
    settings.service_charge_pct +
    settings.vat_on_service_charge_pct * (settings.service_charge_pct / 100)
  );
}

export function totalTaxRateFromSettings(settings: VenueSalesTaxSettings): number {
  return totalTaxRatePct(settings);
}

export function grossToNet(gross: number, totalTaxPct: number): number {
  if (totalTaxPct <= 0) return gross;
  return gross / (1 + totalTaxPct / 100);
}

export function netToGross(net: number, totalTaxPct: number): number {
  if (totalTaxPct <= 0) return net;
  return net * (1 + totalTaxPct / 100);
}

export function getIsoWeekNumber(dateStr: string): number {
  return getIsoWeekParts(dateStr).week;
}

export function getIsoWeekYear(dateStr: string): number {
  return getIsoWeekParts(dateStr).year;
}

export function getIsoWeekParts(dateStr: string): { week: number; year: number } {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const isoYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  return { week, year: isoYear };
}

/** Monday (local) of the given ISO week. */
export function getIsoWeekMonday(year: number, week: number): Date {
  const jan4 = new Date(year, 0, 4);
  const dayNum = jan4.getDay() || 7;
  const mondayWeek1 = new Date(jan4);
  mondayWeek1.setDate(jan4.getDate() - dayNum + 1);
  const monday = new Date(mondayWeek1);
  monday.setDate(mondayWeek1.getDate() + (week - 1) * 7);
  return monday;
}

/** ISO `YYYY-MM-DD` → display `DD/MM/YYYY` */
export function formatDisplayDate(isoDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate;
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

export function formatDisplayDateFromDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return formatDisplayDate(`${year}-${month}-${day}`);
}

/** Parse `DD/MM/YYYY` (or D/M/YYYY) to ISO `YYYY-MM-DD`, or null if invalid. */
export function parseDisplayDate(display: string): string | null {
  const trimmed = display.trim();
  if (!trimmed) return null;

  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1000) {
    return null;
  }

  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  const isoMonth = String(month).padStart(2, "0");
  const isoDay = String(day).padStart(2, "0");
  return `${year}-${isoMonth}-${isoDay}`;
}

/** e.g. 07/Jul/26 */
export function formatShortDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = MONTHS_SHORT[date.getMonth()];
  const year = String(date.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
}

export function formatIsoWeekLabel(year: number, week: number): string {
  const monday = getIsoWeekMonday(year, week);
  const day = String(monday.getDate()).padStart(2, "0");
  const month = MONTHS_SHORT[monday.getMonth()].toUpperCase();
  const dateYearShort = String(monday.getFullYear()).slice(-2);
  return `Week ${week} · ${day}/${month}/${dateYearShort}`;
}

export function formatMonthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

export function getCurrentMonthKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });
}

export function getWeekDayLabel(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return WEEK_DAYS[date.getDay()];
}

function ordinalDaySuffix(day: number): string {
  if (day % 100 >= 11 && day % 100 <= 13) return "th";
  switch (day % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

/** Parts for the sales entry date banner (Week №, date, weekday). */
export function getSalesEntryDateBannerParts(dateStr: string): {
  weekNumber: string;
  day: string;
  dayOrdinal: string;
  monthName: string;
  year: string;
  weekday: string;
} {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const weekNumber = String(getIsoWeekNumber(dateStr)).padStart(2, "0");
  const monthName = date.toLocaleString(undefined, { month: "long" });
  const weekday = date.toLocaleString(undefined, { weekday: "long" });

  return {
    weekNumber,
    day: String(day),
    dayOrdinal: ordinalDaySuffix(day),
    monthName,
    year: String(year),
    weekday,
  };
}

function asph(gross: number, covers: number): number | null {
  if (covers <= 0) return null;
  return gross / covers;
}

function aps(covers: number, bookings: number): number | null {
  if (bookings <= 0) return null;
  return covers / bookings;
}

export function computeDailySales(
  record: VenueDailySalesRecord,
  totalTaxPct: number,
): ComputedDailySales {
  const lunchTotalGs =
    record.lunch_food_gs +
    record.lunch_beverages_gs +
    record.lunch_wine_gs +
    record.lunch_shisha_gs +
    record.lunch_tobacco_gs +
    record.lunch_others_gs +
    record.lunch_service_fees_gs;

  const dinnerTotalGs =
    record.dinner_food_gs +
    record.dinner_beverages_gs +
    record.dinner_wine_gs +
    record.dinner_shisha_gs +
    record.dinner_tobacco_gs +
    record.dinner_others_gs +
    record.dinner_service_fees_gs;

  const totalFoodGs = record.lunch_food_gs + record.dinner_food_gs;
  const totalBeveragesGs =
    record.lunch_beverages_gs + record.dinner_beverages_gs;
  const totalWineGs = record.lunch_wine_gs + record.dinner_wine_gs;
  const totalShishaGs = record.lunch_shisha_gs + record.dinner_shisha_gs;
  const totalTobaccoGs = record.lunch_tobacco_gs + record.dinner_tobacco_gs;
  const totalOthersGs = record.lunch_others_gs + record.dinner_others_gs;
  const totalServiceFeesGs =
    record.lunch_service_fees_gs + record.dinner_service_fees_gs;
  const totalVenueGs = lunchTotalGs + dinnerTotalGs;
  const totalCovers = record.lunch_covers + record.dinner_covers;
  const totalBookings = record.lunch_bookings + record.dinner_bookings;
  const totalWalkinTables =
    (record.lunch_walkin_tables ?? 0) + (record.dinner_walkin_tables ?? 0);
  const totalWalkinCovers =
    (record.lunch_walkin_covers ?? 0) + (record.dinner_walkin_covers ?? 0);

  return {
    weekNumber: getIsoWeekNumber(record.sale_date),
    weekDay: getWeekDayLabel(record.sale_date),
    lunchTotalGs,
    lunchTotalNet: grossToNet(lunchTotalGs, totalTaxPct),
    dinnerTotalGs,
    dinnerTotalNet: grossToNet(dinnerTotalGs, totalTaxPct),
    totalFoodGs,
    totalFoodNet: grossToNet(totalFoodGs, totalTaxPct),
    totalBeveragesGs,
    totalBeveragesNet: grossToNet(totalBeveragesGs, totalTaxPct),
    totalWineGs,
    totalWineNet: grossToNet(totalWineGs, totalTaxPct),
    totalShishaGs,
    totalShishaNet: grossToNet(totalShishaGs, totalTaxPct),
    totalTobaccoGs,
    totalTobaccoNet: grossToNet(totalTobaccoGs, totalTaxPct),
    totalOthersGs,
    totalOthersNet: grossToNet(totalOthersGs, totalTaxPct),
    totalServiceFeesGs,
    totalServiceFeesNet: grossToNet(totalServiceFeesGs, totalTaxPct),
    totalVenueGs,
    totalVenueNet: grossToNet(totalVenueGs, totalTaxPct),
    totalCovers,
    totalBookings,
    totalWalkinTables,
    totalWalkinCovers,
    foodLunchAsph: asph(record.lunch_food_gs, record.lunch_covers),
    foodDinnerAsph: asph(record.dinner_food_gs, record.dinner_covers),
    beveragesLunchAsph: asph(record.lunch_beverages_gs, record.lunch_covers),
    beveragesDinnerAsph: asph(
      record.dinner_beverages_gs,
      record.dinner_covers,
    ),
    wineLunchAsph: asph(record.lunch_wine_gs, record.lunch_covers),
    wineDinnerAsph: asph(record.dinner_wine_gs, record.dinner_covers),
    shishaLunchAsph: asph(record.lunch_shisha_gs, record.lunch_covers),
    shishaDinnerAsph: asph(record.dinner_shisha_gs, record.dinner_covers),
    totalVenueAllDayAsph: asph(totalVenueGs, totalCovers),
    totalVenueLunchAsph: asph(lunchTotalGs, record.lunch_covers),
    totalVenueDinnerAsph: asph(dinnerTotalGs, record.dinner_covers),
    apsAllDay: aps(totalCovers, totalBookings),
    apsLunch: aps(record.lunch_covers, record.lunch_bookings),
    apsDinner: aps(record.dinner_covers, record.dinner_bookings),
  };
}

export function enrichDailySalesRows(
  records: VenueDailySalesRecord[],
  totalTaxPct: number,
) {
  return records.map((record) => ({
    ...record,
    ...computeDailySales(record, totalTaxPct),
  }));
}

export function formatMoney(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatCount(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
}

export function formatPct(value: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  });
}
