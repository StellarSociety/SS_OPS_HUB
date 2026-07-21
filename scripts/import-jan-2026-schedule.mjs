/**
 * One-shot import: January 2026 schedule from spreadsheet screenshot.
 * Marked leave/absence days from sheet; remaining days = SHIFT with ≥1 OFF / ISO week.
 *
 * Usage (from repo root, with .env.local loaded):
 *   node scripts/import-jan-2026-schedule.mjs
 *   node scripts/import-jan-2026-schedule.mjs --dry-run
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
const MONTH = 1;
const DAYS_IN_MONTH = 31;
const VENUE_SLUG = "orilla";

/** Spreadsheet marks → schedule label_code. Days are 1–31. */
const SHEET_MARKS = {
  ORL0001: { 1: "PH-REPL" },
  ORL0002: { 1: "PH-REPL" },
  ORL0004: { 2: "PH-REPL", 3: "PH-REPL", 4: "PH-REPL" },
  ORL0005: { 6: "PH-REPL", 7: "PH-REPL" },
  ORL0009: { 4: "PH-REPL", 9: "PH-REPL" },
  ORL0013: { 4: "PH-REPL", 5: "PH-REPL" },
  ORL0014: { 8: "ABS", 11: "PH-REPL", 12: "PH-REPL" },
  ORL0015: { 6: "PH-REPL", 7: "PH-REPL" },
  ORL0016: { 4: "PH-REPL", 5: "PH-REPL", 13: "ABS" },
  ORL0018: { 8: "PH-REPL" },
  ORL0019: {
    2: "AL",
    3: "AL",
    4: "AL",
    5: "UPL",
    6: "UPL",
    7: "UPL",
    8: "UPL",
    9: "UPL",
    10: "PH-REPL",
  },
  ORL0020: { 13: "PH-REPL", 14: "PH-REPL" },
  ORL0021: { 7: "PH-REPL", 8: "PH-REPL", 10: "PH-REPL" },
  ORL0023: { 2: "PH-REPL", 3: "PH-REPL" },
  ORL0024: { 2: "PH-REPL", 3: "PH-REPL", 4: "PH-REPL", 15: "ABS" },
  ORL0025: { 4: "PH-REPL", 5: "PH-REPL" },
  ORL0026: { 18: "PH-REPL", 19: "PH-REPL" },
  ORL0027: { 1: "PH-REPL", 2: "PH-REPL" },
  ORL0028: { 4: "PH-REPL", 5: "PH-REPL" },
  ORL0029: { 4: "PH-REPL", 5: "PH-REPL", 6: "PH-REPL" },
  ORL0031: { 7: "PH-REPL", 8: "PH-REPL" },
  ORL0034: {
    15: "PH-REPL",
    16: "ABS",
    17: "ABS",
    20: "ABS",
    22: "PL",
    23: "PL",
    24: "PL",
    25: "PL",
    26: "PL",
    27: "UPL",
    28: "UPL",
    29: "UPL",
    30: "UPL",
  },
  ORL0035: { 27: "PH-REPL" },
  ORL0038: { 25: "PH-REPL", 26: "PH-REPL" },
  ORL0039: { 29: "PH-REPL" },
  ORL0041: { 3: "PH-REPL", 4: "PH-REPL", 9: "ABS", 10: "ABS" },
  ORL0042: { 8: "PH-REPL", 9: "PH-REPL" },
  ORL0043: { 3: "PH-REPL", 4: "PH-REPL" },
  ORL0045: { 28: "PH-REPL" },
};

function dateStr(day) {
  return `${YEAR}-${String(MONTH).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** ISO week key (Mon-start) for a calendar day in Jan 2026. */
function isoWeekKey(day) {
  const d = new Date(Date.UTC(YEAR, MONTH - 1, day));
  // Monday=0 .. Sunday=6
  const dow = (d.getUTCDay() + 6) % 7;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - dow);
  return monday.toISOString().slice(0, 10);
}

function seededIndex(seed, mod) {
  const h = createHash("sha256").update(seed).digest();
  return h.readUInt32BE(0) % mod;
}

/** Build full-month label map for one employee. */
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
    const hasOff = days.some((d) => labels[d] === "OFF");
    if (hasOff) continue;
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
    console.log(
      `${s.emp_no}  SHIFT=${s.SHIFT} OFF=${s.OFF} PH=${s.PH ?? 0} ABS=${s.ABS ?? 0} UPL=${s.UPL ?? 0} AL=${s.AL ?? 0} PL=${s.PL ?? 0}  | ${s.sheet}`,
    );
  }

  if (dryRun) {
    console.log("\nDry run — no write.");
    return;
  }

  // Upsert in chunks
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
    .gte("work_date", "2026-01-01")
    .lte("work_date", "2026-01-31");

  console.log(`\nDone. January 2026 schedule days for Orilla: ${count}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
