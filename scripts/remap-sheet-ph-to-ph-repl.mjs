/**
 * Remap attendance-sheet PH → PH-REPL on roster days, and sync PH-REPL used.
 *
 * Orilla attendance trackers mark replacement days taken as "PH". Those were
 * imported as calendar PH; this corrects them to PH-REPL.
 *
 *   node scripts/remap-sheet-ph-to-ph-repl.mjs
 *   node scripts/remap-sheet-ph-to-ph-repl.mjs --dry-run
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const dryRun = process.argv.includes("--dry-run");
const require = createRequire(resolve(root, "apps/web/package.json"));
const { createClient } = require("@supabase/supabase-js");

function loadEnv() {
  for (const rel of [".env.local", "apps/web/.env.local"]) {
    try {
      const text = readFileSync(resolve(root, rel), "utf8");
      for (const line of text.split("\n")) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (!m || process.env[m[1]]) continue;
        let v = m[2].trim();
        if (
          (v.startsWith('"') && v.endsWith('"')) ||
          (v.startsWith("'") && v.endsWith("'"))
        ) {
          v = v.slice(1, -1);
        }
        process.env[m[1]] = v;
      }
    } catch {
      /* ok */
    }
  }
}

loadEnv();

const VENUE_SLUG = "orilla";
const YEAR = 2026;

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data: venue, error: venueErr } = await sb
    .from("venues")
    .select("id")
    .eq("slug", VENUE_SLUG)
    .single();
  if (venueErr || !venue) {
    console.error("Venue not found:", venueErr?.message);
    process.exit(1);
  }

  // Ensure PH-REPL schedule label exists (FK on hr_schedule_days.label_code).
  const { data: existingLabel } = await sb
    .from("schedule_day_labels")
    .select("code")
    .eq("code", "PH-REPL")
    .maybeSingle();

  if (!existingLabel) {
    console.log(dryRun ? "[dry-run] would insert schedule_day_labels PH-REPL" : "insert PH-REPL label");
    if (!dryRun) {
      const { error } = await sb.from("schedule_day_labels").insert({
        code: "PH-REPL",
        abbreviation: "PH-REPL",
        name: "Public holiday (replacement taken)",
        bg_color: "#c7d2fe",
        text_color: "#312e81",
        border_color: "#a5b4fc",
        sort_order: 5,
      });
      if (error) {
        console.error("label insert failed:", error.message);
        process.exit(1);
      }
    }
  } else {
    console.log("PH-REPL label already present");
  }

  const { count: phCount, error: countErr } = await sb
    .from("hr_schedule_days")
    .select("id", { count: "exact", head: true })
    .eq("venue_id", venue.id)
    .eq("label_code", "PH")
    .gte("work_date", `${YEAR}-01-01`)
    .lt("work_date", `${YEAR + 1}-01-01`);

  if (countErr) {
    console.error("count failed:", countErr.message);
    process.exit(1);
  }

  console.log(`PH days to remap (${YEAR}):`, phCount ?? 0);

  if (!dryRun && (phCount ?? 0) > 0) {
    const { error: updErr } = await sb
      .from("hr_schedule_days")
      .update({ label_code: "PH-REPL", updated_at: new Date().toISOString() })
      .eq("venue_id", venue.id)
      .eq("label_code", "PH")
      .gte("work_date", `${YEAR}-01-01`)
      .lt("work_date", `${YEAR + 1}-01-01`);
    if (updErr) {
      console.error("remap failed:", updErr.message);
      process.exit(1);
    }
    console.log("remapped PH → PH-REPL");
  }

  // Sync used on PH-REPL balances from roster counts (after remap: PH-REPL only;
  // before remap in dry-run: count PH + PH-REPL so preview is meaningful).
  let daysQuery = sb
    .from("hr_schedule_days")
    .select("staff_id")
    .eq("venue_id", venue.id)
    .gte("work_date", `${YEAR}-01-01`)
    .lt("work_date", `${YEAR + 1}-01-01`);
  daysQuery = dryRun
    ? daysQuery.or("label_code.eq.PH,label_code.eq.PH-REPL")
    : daysQuery.eq("label_code", "PH-REPL");
  const { data: replDays, error: daysErr } = await daysQuery;

  if (daysErr) {
    console.error("fetch PH-REPL days failed:", daysErr.message);
    process.exit(1);
  }

  const usedByStaff = new Map();
  for (const row of replDays ?? []) {
    usedByStaff.set(row.staff_id, (usedByStaff.get(row.staff_id) ?? 0) + 1);
  }
  console.log("staff with PH-REPL used:", usedByStaff.size);

  const { data: bals, error: balErr } = await sb
    .from("hr_leave_balances")
    .select("id, staff_id, used, accrued, entitled")
    .eq("venue_id", venue.id)
    .eq("leave_year", YEAR)
    .eq("leave_type_code", "PH-REPL");

  if (balErr) {
    console.error("balances fetch failed:", balErr.message);
    process.exit(1);
  }

  let updated = 0;
  for (const bal of bals ?? []) {
    const nextUsed = usedByStaff.get(bal.staff_id) ?? 0;
    if (Number(bal.used) === nextUsed) continue;
    console.log(
      `balance ${bal.staff_id.slice(0, 8)}… used ${bal.used} → ${nextUsed}`,
    );
    if (!dryRun) {
      const { error } = await sb
        .from("hr_leave_balances")
        .update({ used: nextUsed, updated_at: new Date().toISOString() })
        .eq("id", bal.id);
      if (error) {
        console.error("balance update failed:", error.message);
        process.exit(1);
      }
    }
    updated += 1;
  }

  console.log(dryRun ? `[dry-run] would update ${updated} balances` : `updated ${updated} balances`);
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
