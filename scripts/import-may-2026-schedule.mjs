/**
 * May 2026 schedule import from spreadsheet screenshot.
 * Sheet PL → AL; AB → ABS; blanks → SHIFT + weekly OFF.
 *
 *   node scripts/import-may-2026-schedule.mjs
 *   node scripts/import-may-2026-schedule.mjs --dry-run
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
      /* ok */
    }
  }
}

loadEnv();

const YEAR = 2026;
const MONTH = 5;
const DAYS_IN_MONTH = 31;
const VENUE_SLUG = "orilla";

function range(from, to, code) {
  /** @type {Record<number, string>} */
  const out = {};
  for (let d = from; d <= to; d++) out[d] = code;
  return out;
}

function merge(...parts) {
  return Object.assign({}, ...parts);
}

const ALL_ABS = range(1, 31, "ABS");
const ALL_UPL = range(1, 31, "UPL");

/**
 * Header-aligned OCR + crop verification. Full-month AB/UPL filled where
 * sheet summaries / continuous red-pink rows confirm (OCR often misses cells
 * with Excel comment triangles).
 */
const SHEET_MARKS = {
  ORL0001: ALL_ABS,
  ORL0002: ALL_ABS,
  ORL0003: ALL_ABS,
  // Summary AB22 — blank 1–9
  ORL0004: range(10, 31, "ABS"),
  ORL0009: ALL_ABS,
  ORL0010: ALL_ABS,
  ORL0012: ALL_ABS,
  ORL0014: { 26: "PH-REPL" },
  ORL0015: ALL_ABS,
  // Summary UPL30 — day 31 blank
  ORL0016: range(1, 30, "UPL"),
  ORL0017: ALL_ABS,
  // Summary PL14 PH1; UPL 16–31 on grid
  ORL0018: merge(range(1, 14, "AL"), { 15: "PH-REPL" }, range(16, 31, "UPL")),
  ORL0019: { 7: "PH-REPL" },
  ORL0020: ALL_ABS,
  ORL0023: ALL_UPL,
  ORL0025: ALL_UPL,
  ORL0027: ALL_UPL,
  ORL0028: { 25: "PH-REPL" },
  // blank 1–2, AB 3, UPL 4–31 (summary UPL28 AB1)
  ORL0031: merge({ 3: "ABS" }, range(4, 31, "UPL")),
  // Summary UPL14 PH1
  ORL0032: merge(range(1, 14, "UPL"), { 24: "PH-REPL" }),
  ORL0034: ALL_ABS,
  ORL0035: ALL_ABS,
  ORL0036: ALL_ABS,
  ORL0038: { 31: "PH-REPL" },
  ORL0041: { 20: "PH-REPL", 29: "PH-REPL" },
  ORL0042: ALL_ABS,
  ORL0043: { 23: "PH-REPL", 24: "PH-REPL" },
  ORL0045: ALL_UPL,
  ORL0047: range(11, 15, "PH-REPL"),
  ORL0048: ALL_UPL,
  ORL0049: ALL_ABS,
  ORL0050: ALL_UPL,
  // Summary AB27 — blank 1–4
  ORL0051: range(5, 31, "ABS"),
  ORL0052: { 16: "PH-REPL" },
  // Summary AB7
  ORL0054: range(1, 7, "ABS"),
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
    const pick =
      shiftDays[seededIndex(`${empNo}:${weekKey}`, shiftDays.length)];
    labels[pick] = "OFF";
  }

  return labels;
}

function summarizeMarks(marks) {
  const counts = {};
  for (const code of Object.values(marks)) {
    counts[code] = (counts[code] ?? 0) + 1;
  }
  return counts;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  console.log("Sheet mark totals:");
  for (const emp of Object.keys(SHEET_MARKS).sort()) {
    console.log(`  ${emp}  ${JSON.stringify(summarizeMarks(SHEET_MARKS[emp]))}`);
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

  const missing = Object.keys(SHEET_MARKS).filter(
    (emp) => !staffRows.some((s) => s.emp_no === emp),
  );
  if (missing.length) console.warn("Missing staff:", missing.join(", "));

  const now = new Date().toISOString();
  /** @type {object[]} */
  const rows = [];

  for (const staff of staffRows) {
    const labels = buildMonthLabels(staff.emp_no);
    for (let day = 1; day <= DAYS_IN_MONTH; day++) {
      rows.push({
        venue_id: venue.id,
        staff_id: staff.id,
        emp_no: staff.emp_no,
        work_date: dateStr(day),
        label_code: labels[day],
        department_id: staff.department_id ?? null,
        shift_template_id: null,
        source: "import",
        updated_at: now,
      });
    }
  }

  console.log(`\nStaff: ${staffRows.length}`);
  console.log(`Rows to upsert: ${rows.length}`);

  if (dryRun) {
    console.log("Dry run — no write.");
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
    .gte("work_date", "2026-05-01")
    .lte("work_date", "2026-05-31");

  console.log(`\nDone. May 2026 schedule days for Orilla: ${count}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
