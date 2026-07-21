/**
 * March 2026 schedule import from spreadsheet screenshot.
 * Sheet PL (paid leave) → AL; AB → ABS; SL → SL; OFF → OFF.
 * Blank days → SHIFT with ≥1 OFF per ISO week.
 *
 *   node scripts/import-mar-2026-schedule.mjs
 *   node scripts/import-mar-2026-schedule.mjs --dry-run
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
const MONTH = 3;
const DAYS_IN_MONTH = 31;
const VENUE_SLUG = "orilla";

/** Inclusive day range helper → { day: code } */
function range(from, to, code) {
  /** @type {Record<number, string>} */
  const out = {};
  for (let d = from; d <= to; d++) out[d] = code;
  return out;
}

function merge(...parts) {
  return Object.assign({}, ...parts);
}

/**
 * Definitive marks from Vision OCR (day-header calibrated) + sheet summary fills
 * for contiguous gaps. Sheet green PL → AL.
 */
const SHEET_MARKS = {
  // UPL11 PL16 PH4 — full leave month for Sharath
  ORL0001: merge(
    range(1, 8, "AL"),
    { 9: "UPL" },
    range(10, 15, "AL"),
    { 16: "UPL" },
    range(17, 18, "AL"),
    range(19, 22, "PH-REPL"),
    range(23, 31, "UPL"),
  ),
  // PL14 PH4 (not 1–18 PL — OCR+summary)
  ORL0002: merge(range(4, 15, "AL"), range(19, 22, "PH-REPL"), range(30, 31, "AL")),
  ORL0003: range(1, 31, "ABS"),
  ORL0004: range(1, 2, "AL"),
  ORL0010: merge({ 15: "PH-REPL" }, range(16, 31, "UPL")),
  ORL0012: merge({ 2: "PH-REPL" }, range(18, 31, "UPL")),
  ORL0013: { 8: "PH-REPL" },
  ORL0014: range(1, 31, "AL"),
  ORL0015: range(14, 31, "UPL"),
  ORL0018: { 1: "PH-REPL", 31: "PH-REPL" },
  ORL0019: merge({ 6: "PH-REPL" }, range(10, 31, "UPL")),
  ORL0020: merge({ 16: "PH-REPL" }, range(19, 31, "UPL")),
  ORL0023: merge({ 13: "PH-REPL" }, range(23, 31, "UPL")),
  ORL0024: range(19, 31, "UPL"),
  ORL0025: { 6: "PH-REPL" },
  ORL0026: { 3: "PH-REPL" },
  ORL0031: merge({ 5: "PH-REPL" }, range(16, 31, "UPL")),
  ORL0032: merge({ 1: "PH-REPL", 7: "PH-REPL" }, range(17, 31, "UPL")),
  ORL0034: range(1, 31, "ABS"),
  ORL0035: range(10, 31, "UPL"),
  ORL0036: range(19, 31, "ABS"),
  ORL0038: { 19: "OFF" },
  ORL0039: { 1: "PH-REPL", 27: "PH-REPL" },
  ORL0041: { 1: "PH-REPL" },
  ORL0042: merge({ 15: "PH-REPL" }, range(17, 31, "UPL")),
  ORL0043: merge({ 14: "PH-REPL" }, range(16, 31, "UPL")),
  ORL0044: merge({ 1: "PH-REPL", 4: "PH-REPL", 13: "PH-REPL" }, range(16, 31, "UPL")),
  ORL0045: merge(range(1, 2, "PH-REPL"), range(19, 31, "UPL")),
  ORL0047: range(26, 27, "SL"),
  ORL0048: range(12, 31, "UPL"),
  ORL0049: range(17, 31, "UPL"),
  ORL0050: merge({ 5: "PH-REPL", 19: "OFF" }, range(23, 31, "UPL")),
  ORL0051: { 30: "PH-REPL" },
  ORL0053: range(26, 27, "SL"),
  ORL0054: range(26, 27, "SL"),
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

  // Validate summary totals vs sheet before write
  console.log("Sheet mark totals (should match spreadsheet summary cols):");
  for (const emp of Object.keys(SHEET_MARKS).sort()) {
    const c = summarizeMarks(SHEET_MARKS[emp]);
    const days = Object.entries(SHEET_MARKS[emp])
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([d, code]) => `${String(d).padStart(2, "0")}:${code}`)
      .join(" ");
    console.log(
      `  ${emp}  ${JSON.stringify(c)}  | ${days.slice(0, 120)}${days.length > 120 ? "…" : ""}`,
    );
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
    .gte("work_date", "2026-03-01")
    .lte("work_date", "2026-03-31");

  console.log(`\nDone. March 2026 schedule days for Orilla: ${count}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
