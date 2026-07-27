import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServiceClient } from "../lib/supabase/service";
import { persistCalculatedPayrollRun } from "../lib/hr/payroll/persist-run";
import { resolvePayrollPeriod } from "../lib/hr/payroll/period";
import { mergePayrollSettings } from "../lib/hr/payroll/period";
import { getHrVenueSetting } from "../lib/hr/store";
import { HR_SETTINGS_KEYS } from "../lib/hr/types";
import type { HrPayrollSettings } from "../lib/hr/payroll/types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../../../.env.local");
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq === -1) continue;
  const key = trimmed.slice(0, eq).trim();
  const value = trimmed.slice(eq + 1).trim();
  if (!process.env[key]) process.env[key] = value;
}

async function main() {
  const runId = process.argv[2];
  if (!runId) {
    console.error("Usage: npx tsx scripts/recalculate-payroll-run.mts <runId>");
    process.exit(1);
  }

  const service = createServiceClient();
  const { data: run, error } = await service
    .from("hr_payroll_runs")
    .select("id, venue_id, payroll_month, status")
    .eq("id", runId)
    .maybeSingle();

  if (error || !run) {
    throw new Error(error?.message ?? "Payroll run not found");
  }

  const raw = await getHrVenueSetting<Partial<HrPayrollSettings>>(
    service,
    run.venue_id,
    HR_SETTINGS_KEYS.payroll,
    {},
  );
  const settings = mergePayrollSettings(raw);
  const period = resolvePayrollPeriod(run.payroll_month, settings);

  console.log(
    `Recalculating payroll ${run.payroll_month} (${period.periodStart} → ${period.periodEnd})…`,
  );

  const userId = process.argv[3] ?? process.env.PAYROLL_RECALC_USER_ID;
  if (!userId) {
    const { data: profile } = await service
      .from("profiles")
      .select("id")
      .limit(1)
      .maybeSingle();
    if (!profile?.id) {
      throw new Error("No profile found for updated_by; pass userId as 2nd arg.");
    }
    process.env.PAYROLL_RECALC_USER_ID = profile.id;
  }

  const actorId = userId ?? process.env.PAYROLL_RECALC_USER_ID!;

  const result = await persistCalculatedPayrollRun({
    service,
    venueId: run.venue_id,
    runId: run.id,
    period,
    userId: actorId,
  });

  console.log("Done.", {
    employeeCount: result.employeeCount,
    leaverCount: result.totals.leaverCount,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
