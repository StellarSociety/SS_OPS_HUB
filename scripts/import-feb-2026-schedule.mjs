/**
 * One-shot import: February 2026 schedule from spreadsheet screenshot.
 * Sheet PL (green paid leave) → AL. AB → ABS. Same SHIFT + weekly OFF rules as Jan.
 *
 *   node scripts/import-feb-2026-schedule.mjs
 *   node scripts/import-feb-2026-schedule.mjs --dry-run
 */
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
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
      /* missing file ok */
    }
  }
}

loadEnv();

const YEAR = 2026;
const MONTH = 2;
const DAYS_IN_MONTH = 28;
const VENUE_SLUG = "orilla";

/**
 * Spreadsheet marks → schedule label_code.
 * Sheet green "PL" (paid leave) → AL.
 */
const SHEET_MARKS = {
  ORL0002: { 17: "AL", 18: "AL" },
  ORL0004: { 24: "AL", 25: "AL", 26: "AL", 27: "AL", 28: "AL" },
  ORL0005: { 17: "PH-REPL", 18: "PH-REPL" },
  ORL0014: {
    10: "ABS",
    18: "PH-REPL",
    23: "AL",
    24: "AL",
    25: "AL",
    26: "AL",
    27: "AL",
    28: "AL",
  },
  ORL0018: { 6: "PH-REPL" },
  ORL0019: { 27: "PH-REPL", 28: "PH-REPL" },
  ORL0024: { 14: "ABS" },
  ORL0032: { 28: "PH-REPL" },
  ORL0035: { 3: "ABS", 4: "ABS", 5: "ABS", 6: "ABS", 28: "PH-REPL" },
  ORL0036: { 15: "PH-REPL" },
  ORL0039: { 3: "PH-REPL" },
  ORL0041: { 16: "ABS" },
  ORL0043: { 13: "ABS", 14: "ABS" },
  ORL0049: {
    12: "PH-REPL",
    13: "PH-REPL",
    15: "ABS",
    16: "ABS",
    18: "ABS",
    19: "ABS",
    20: "ABS",
  },
};

function dateStr(day) {
  return `${YEAR}-${String(MONTH).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function isoWeekKey(day) {
  const d = new Date(Date.UTC(YEAR, MONTH - 1, day));
  const dow = (d.getUTCDay() + 6) % 7;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - dow);
  return monday.toISOString().slice(0, 10);
}

function seededIndex(seed, mod) {
  const h = createHash("sha256").update(seed).digest();
  return h.readUInt32BE(0) % mod;
}

function buildMonthLabels(empNo) {
  const marks = SHEET_MARKS[empNo] ?? {};
  /** @type {Record<number, string>} */
  const labels = {};
  for (let day = 1; day <= DAYS_IN_MONTH; day++) {
    labels[day] = marks[day] ?? "SHIFT";
  }

  /** @type {Map<string, number[]>} */
  const weeks = new Map();
  for (let day = 1; day <= DAYS_IN_MONTH; day++) {
    const key = isoWeekKey(day);
    if (!weeks.has(key)) weeks.set(key, []);
    weeks.get(key).push(day);
  }

  for (const [weekKey, days] of weeks) {
    if (days.some((d) => labels[d] === "OFF")) continue;
    const shiftDays = days.filter((d) => labels[d] === "SHIFT");
    if (shiftDays.length === 0) continue;
    const pick = shiftDays[seededIndex(`${empNo}:${weekKey}`, shiftDays.length)];
    labels[pick] = "OFF";
  }

  return labels;
}

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
    .select("id, slug")
    .eq("slug", VENUE_SLUG)
    .single();
  if (venueErr || !venue) {
    console.error("Venue not found:", venueErr?.message);
    process.exit(1);
  }

  const { data: staffRows, error: staffErr } = await sb
    .from("staff")
    .select("id, emp_no, full_name, home_venue_id, department_id")
    .eq("home_venue_id", venue.id)
    .like("emp_no", "ORL%")
    .order("emp_no");
  if (staffErr) {
    console.error("Staff load failed:", staffErr.message);
    process.exit(1);
  }

  const missingMarks = Object.keys(SHEET_MARKS).filter(
    (emp) => !staffRows.some((s) => s.emp_no === emp),
  );
  if (missingMarks.length) {
    console.warn("Sheet emp_nos not in staff:", missingMarks.join(", "));
  }

  const now = new Date().toISOString();
  /** @type {object[]} */
  const rows = [];
  const summaries = [];

  for (const staff of staffRows) {
    const labels = buildMonthLabels(staff.emp_no);
    const counts = { SHIFT: 0, OFF: 0, PH: 0, ABS: 0, UPL: 0, AL: 0, PL: 0 };
    for (let day = 1; day <= DAYS_IN_MONTH; day++) {
      const code = labels[day];
      counts[code] = (counts[code] ?? 0) + 1;
      rows.push({
        venue_id: venue.id,
        staff_id: staff.id,
        emp_no: staff.emp_no,
        work_date: dateStr(day),
        label_code: code,
        department_id: staff.department_id ?? null,
        shift_template_id: null,
        source: "import",
        updated_at: now,
      });
    }
    const marked = SHEET_MARKS[staff.emp_no];
    summaries.push({
      emp_no: staff.emp_no,
      name: staff.full_name,
      sheet: marked
        ? Object.entries(marked)
            .map(([d, c]) => `${String(d).padStart(2, "0")}:${c}`)
            .join(" ")
        : "(none)",
      ...counts,
    });
  }

  console.log(`Staff: ${staffRows.length}`);
  console.log(`Rows to upsert: ${rows.length}`);
  console.log("\nPer-employee sheet marks + generated counts:");
  for (const s of summaries) {
    if (s.sheet === "(none)" && !process.argv.includes("--verbose")) continue;
    console.log(
      `${s.emp_no}  SHIFT=${s.SHIFT} OFF=${s.OFF} PH=${s.PH ?? 0} ABS=${s.ABS ?? 0} UPL=${s.UPL ?? 0} AL=${s.AL ?? 0}  | ${s.sheet}`,
    );
  }
  console.log(
    `(${summaries.filter((s) => s.sheet === "(none)").length} staff with no sheet marks → SHIFT+OFF only)`,
  );

  if (dryRun) {
    console.log("\nDry run — no write.");
    return;
  }

  const chunkSize = 500;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await sb.from("hr_schedule_days").upsert(chunk, {
      onConflict: "staff_id,work_date",
    });
    if (error) {
      console.error(`Upsert failed at offset ${i}:`, error.message);
      process.exit(1);
    }
    console.log(`Upserted ${Math.min(i + chunkSize, rows.length)} / ${rows.length}`);
  }

  const { count } = await sb
    .from("hr_schedule_days")
    .select("*", { count: "exact", head: true })
    .eq("venue_id", venue.id)
    .gte("work_date", "2026-02-01")
    .lte("work_date", "2026-02-28");

  console.log(`\nDone. February 2026 schedule days for Orilla: ${count}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
