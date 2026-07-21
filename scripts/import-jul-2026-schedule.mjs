/**
 * July 2026 schedule import from spreadsheet screenshot.
 * Sheet leave marks only — does NOT invent SHIFT/OFF for blank days.
 * Sheet PL → AL; AB → ABS; PH → PH-REPL.
 *
 * Prefer repair script if SHIFT/OFF were already wiped:
 *   node scripts/repair-jul-2026-leaves-only.mjs
 *
 *   node scripts/import-jul-2026-schedule.mjs
 *   node scripts/import-jul-2026-schedule.mjs --dry-run
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

const YEAR = 2026;
const MONTH = 7;
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
 * Header-aligned OCR + annotated crop verification.
 * Leave marks only — blank sheet days are left untouched.
 */
const SHEET_MARKS = {
  ORL0001: ALL_ABS,
  ORL0002: ALL_ABS,
  ORL0003: ALL_ABS,
  ORL0004: ALL_ABS,
  ORL0009: ALL_ABS,
  ORL0010: ALL_ABS,
  ORL0012: ALL_ABS,
  ORL0015: ALL_ABS,
  ORL0017: ALL_ABS,
  ORL0020: ALL_ABS,
  ORL0024: ALL_ABS,
  ORL0034: ALL_ABS,
  ORL0035: ALL_ABS,
  ORL0036: ALL_ABS,
  ORL0042: ALL_ABS,
  ORL0047: ALL_ABS,
  ORL0048: ALL_ABS,
  ORL0051: ALL_ABS,

  ORL0023: ALL_UPL,
  ORL0025: ALL_UPL,
  ORL0031: ALL_UPL,
  ORL0045: ALL_UPL,
  ORL0050: ALL_UPL,

  ORL0005: { 4: "PH-REPL", 12: "PH-REPL" },
  ORL0013: { 19: "PH-REPL" },
  ORL0026: { 1: "PH-REPL" },
  ORL0027: merge(
    range(1, 3, "UPL"),
    range(4, 5, "PH-REPL"),
    range(6, 31, "UPL"),
  ),
  ORL0028: merge(
    { 4: "ABS" },
    range(6, 24, "AL"),
    range(25, 31, "PH-REPL"),
  ),
  ORL0029: { 10: "PH-REPL" },
  ORL0032: { 11: "PH-REPL" },
  ORL0038: { 16: "PH-REPL" },
  ORL0039: merge(range(1, 27, "UPL"), { 28: "AL" }, range(29, 31, "PH-REPL")),
  ORL0040: merge(range(1, 8, "AL"), range(9, 31, "ABS")),
  ORL0041: merge(range(1, 9, "UPL"), { 12: "UPL" }),
  ORL0046: merge(range(11, 23, "AL"), range(24, 31, "PH-REPL")),
  ORL0053: { 2: "PH-REPL" },
  ORL0055: range(6, 31, "ABS"),
  ORL0056: range(1, 3, "ABS"),
  ORL0057: range(1, 8, "ABS"),
  ORL0058: range(1, 14, "ABS"),
};

function dateStr(day) {
  return `${YEAR}-${String(MONTH).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
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

  console.log("Sheet leave totals (no SHIFT/OFF fill):");
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
    .select("id, emp_no, department_id")
    .eq("home_venue_id", venue.id)
    .like("emp_no", "ORL%")
    .order("emp_no");
  if (staffErr) {
    console.error("Staff load failed:", staffErr.message);
    process.exit(1);
  }

  const staffByEmp = new Map(staffRows.map((s) => [s.emp_no, s]));
  const now = new Date().toISOString();
  /** @type {object[]} */
  const rows = [];

  for (const [empNo, marks] of Object.entries(SHEET_MARKS)) {
    const staff = staffByEmp.get(empNo);
    if (!staff) {
      console.warn("Missing staff:", empNo);
      continue;
    }
    for (const [dayStr, code] of Object.entries(marks)) {
      rows.push({
        venue_id: venue.id,
        staff_id: staff.id,
        emp_no: empNo,
        work_date: dateStr(Number(dayStr)),
        label_code: code,
        department_id: staff.department_id ?? null,
        shift_template_id: null,
        source: "import",
        updated_at: now,
      });
    }
  }

  console.log(`\nLeave rows to upsert: ${rows.length}`);

  if (dryRun) {
    console.log("Dry run — no write.");
    return;
  }

  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await sb.from("hr_schedule_days").upsert(chunk, {
      onConflict: "staff_id,work_date",
    });
    if (error) {
      console.error(`Upsert failed at offset ${i}:`, error.message);
      process.exit(1);
    }
    console.log(`Upserted ${Math.min(i + 500, rows.length)} / ${rows.length}`);
  }

  const { count } = await sb
    .from("hr_schedule_days")
    .select("*", { count: "exact", head: true })
    .eq("venue_id", venue.id)
    .gte("work_date", "2026-07-01")
    .lte("work_date", "2026-07-31");

  console.log(`\nDone. July 2026 schedule days for Orilla: ${count}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
