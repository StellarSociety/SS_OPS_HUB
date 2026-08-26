import { describe, expect, it } from "vitest";
import {
  buildPoolCollectionsExportMonths,
  buildPoolCollectionsFilename,
  buildPoolCollectionsPeriodLabel,
  defaultPoolCollectionsMonthKey,
  sumPoolCollectionsMonths,
} from "../pool-collections-export";
import type {
  BenefitPoolCollectionsRow,
  GratuityRunPoolHint,
} from "../pool-collections";

function row(
  partial: Partial<BenefitPoolCollectionsRow> & { benefit_month: string },
): BenefitPoolCollectionsRow {
  return {
    id: partial.id ?? "row-1",
    benefit_month: partial.benefit_month,
    ose_amount: partial.ose_amount ?? 0,
    staff_activities_amount: partial.staff_activities_amount ?? 0,
    rounding_amount: partial.rounding_amount ?? 0,
    withheld_retain_amount: partial.withheld_retain_amount ?? 0,
    benefit_deduction_amount: partial.benefit_deduction_amount ?? 0,
    notes: partial.notes ?? null,
    updated_at: partial.updated_at ?? "2026-08-01T00:00:00Z",
  };
}

function hint(
  partial: Partial<GratuityRunPoolHint> & { benefitMonth: string },
): GratuityRunPoolHint {
  return {
    runId: partial.runId ?? "run-1",
    benefitMonth: partial.benefitMonth,
    status: partial.status ?? "approved",
    poolGross: partial.poolGross ?? 10000,
    roundingCollected: partial.roundingCollected ?? 0,
    withheldRetain: partial.withheldRetain ?? 0,
    benefitDeductions: partial.benefitDeductions ?? 0,
  };
}

describe("pool-collections-export", () => {
  it("uses the live run deduction when the saved row is still 0", () => {
    const months = buildPoolCollectionsExportMonths(
      [
        row({
          benefit_month: "2026-07-01",
          ose_amount: 200,
          staff_activities_amount: 100,
          rounding_amount: 12.5,
          withheld_retain_amount: 40,
          benefit_deduction_amount: 0,
          notes: "July sheet",
        }),
      ],
      {
        "2026-07": hint({
          benefitMonth: "2026-07-01",
          benefitDeductions: 1627.5,
          roundingCollected: 12.5,
          withheldRetain: 40,
        }),
      },
      2,
      1,
    );

    expect(months).toHaveLength(1);
    expect(months[0]!.deducted).toBe(1627.5);
    expect(months[0]!.ose).toBe(200);
    expect(months[0]!.notes).toBe("July sheet");
    expect(months[0]!.recorded).toBe(true);
  });

  it("includes an unrecorded run month using suggested amounts", () => {
    const months = buildPoolCollectionsExportMonths(
      [],
      {
        "2026-06": hint({
          benefitMonth: "2026-06-01",
          poolGross: 5000,
          roundingCollected: 8,
          withheldRetain: 15,
          benefitDeductions: 90,
        }),
      },
      2,
      1,
    );

    expect(months).toHaveLength(1);
    expect(months[0]!.monthKey).toBe("2026-06");
    expect(months[0]!.ose).toBe(100);
    expect(months[0]!.activities).toBe(50);
    expect(months[0]!.rounding).toBe(8);
    expect(months[0]!.withheldRetain).toBe(15);
    expect(months[0]!.deducted).toBe(90);
    expect(months[0]!.recorded).toBe(false);
  });

  it("sums selected months and labels a range newest-last", () => {
    const months = buildPoolCollectionsExportMonths(
      [
        row({
          id: "june",
          benefit_month: "2026-06-01",
          ose_amount: 10,
          staff_activities_amount: 5,
          rounding_amount: 1,
          withheld_retain_amount: 2,
          benefit_deduction_amount: 3,
        }),
        row({
          id: "july",
          benefit_month: "2026-07-01",
          ose_amount: 20,
          staff_activities_amount: 6,
          rounding_amount: 1,
          withheld_retain_amount: 2,
          benefit_deduction_amount: 4,
        }),
      ],
      {},
      2,
      1,
    );

    expect(buildPoolCollectionsPeriodLabel(months)).toBe(
      "June 2026 - July 2026",
    );
    expect(sumPoolCollectionsMonths(months)).toEqual({
      ose: 30,
      activities: 11,
      rounding: 2,
      withheldRetain: 4,
      deducted: 7,
      total: 54,
    });
    expect(defaultPoolCollectionsMonthKey(months, "2026-07")).toBe("2026-07");
    expect(
      buildPoolCollectionsFilename(
        "Orilla",
        "July 2026",
        "pdf",
        new Date(2026, 7, 26),
      ),
    ).toBe("Orilla Pool Collections July 2026 26-08-26.pdf");
  });
});
