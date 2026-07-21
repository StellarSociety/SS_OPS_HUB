/**
 * April 2026 schedule import from spreadsheet screenshot.
 * Sheet PL → AL; AB → ABS; LD → LD (new label); blanks → SHIFT + weekly OFF.
 *
 *   node scripts/import-apr-2026-schedule.mjs
 *   node scripts/import-apr-2026-schedule.mjs --dry-run
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
const MONTH = 4;
const DAYS_IN_MONTH = 30;
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

/** Full-month helpers */
const ALL_ABS = range(1, 30, "ABS");
const ALL_UPL = range(1, 30, "UPL");

/**
 * Marks from Vision OCR + header-aligned crops + sheet summary fills.
 * Sheet green PL → AL. Yellow LD kept as LD.
 */
const SHEET_MARKS = {
  ORL0001: ALL_ABS,
  ORL0002: ALL_ABS,
  ORL0003: ALL_ABS,
  // Summary PL9 AB5 PH4
  ORL0004: merge(
    range(9, 11, "PH-REPL"),
    { 13: "PH-REPL" },
    range(14, 22, "AL"),
    range(23, 27, "ABS"),
  ),
  ORL0005: { 3: "PH-REPL" },
  // Summary PL14 PH5 AB11
  ORL0009: merge(range(1, 14, "AL"), range(15, 19, "PH-REPL"), range(20, 30, "ABS")),
  ORL0010: ALL_ABS,
  ORL0012: ALL_ABS,
  ORL0013: { 7: "PH-REPL", 14: "PH-REPL", 23: "PH-REPL" },
  ORL0014: range(1, 6, "UPL"),
  ORL0015: ALL_UPL,
  ORL0016: ALL_UPL,
  // Summary PL15 PH6; LD 26–30. OCR: PL…19, PH 20–25, LD 26–30
  ORL0017: merge(range(5, 19, "AL"), range(20, 25, "PH-REPL"), range(26, 30, "LD")),
  ORL0018: { 15: "PH-REPL", 22: "PH-REPL" },
  ORL0020: ALL_ABS,
  ORL0021: { 4: "PH-REPL", 17: "PH-REPL" },
  ORL0023: ALL_UPL,
  ORL0025: ALL_UPL,
  ORL0026: merge({ 1: "PH-REPL", 10: "PH-REPL" }, range(21, 30, "UPL")),
  ORL0027: ALL_UPL,
  ORL0029: merge({ 5: "PH-REPL" }, range(6, 20, "UPL"), { 24: "PH-REPL" }),
  ORL0032: ALL_UPL,
  ORL0034: ALL_ABS,
  ORL0035: ALL_ABS,
  ORL0036: ALL_ABS,
  ORL0038: { 11: "PH-REPL", 24: "PH-REPL" },
  ORL0039: { 17: "PH-REPL", 27: "PH-REPL" },
  ORL0040: merge(
    range(9, 10, "UPL"),
    range(14, 17, "UPL"),
    { 19: "UPL" },
    range(21, 24, "UPL"),
    range(29, 30, "UPL"),
  ),
  ORL0041: merge(
    range(9, 10, "UPL"),
    range(13, 16, "UPL"),
    range(19, 24, "UPL"),
    { 27: "UPL" },
    range(29, 30, "UPL"),
  ),
  ORL0042: merge(range(1, 6, "UPL"), range(7, 30, "ABS")),
  ORL0043: merge(range(9, 10, "UPL"), range(19, 30, "UPL")),
  ORL0044: merge(
    range(1, 3, "UPL"),
    range(20, 21, "UPL"),
    { 24: "UPL", 27: "UPL" },
    range(28, 30, "UPL"),
  ),
  ORL0045: ALL_UPL,
  ORL0046: merge(
    range(9, 10, "UPL"),
    range(16, 18, "UPL"),
    range(23, 24, "UPL"),
    { 30: "UPL" },
  ),
  ORL0048: ALL_UPL,
  ORL0049: ALL_UPL,
  ORL0050: ALL_UPL,
  ORL0052: range(4, 18, "UPL"),
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

async function ensureLdLabel(sb) {
  const { data } = await sb
    .from("schedule_day_labels")
    .select("code")
    .eq("code", "LD")
    .maybeSingle();
  if (data) return;
  const { error } = await sb.from("schedule_day_labels").insert({
    code: "LD",
    abbreviation: "LD",
    name: "Leave day (LD)",
    bg_color: "#fef3c7",
    text_color: "#92400e",
    border_color: "#fde68a",
    sort_order: 11,
  });
  if (error) {
    console.error("Could not create LD label:", error.message);
    process.exit(1);
  }
  console.log("Created schedule_day_labels LD");
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
    const c = summarizeMarks(SHEET_MARKS[emp]);
    console.log(`  ${emp}  ${JSON.stringify(c)}`);
  }

  const sb = createClient(url, key, { auth: { persistSession: false } });
  await ensureLdLabel(sb);

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
    .gte("work_date", "2026-04-01")
    .lte("work_date", "2026-04-30");

  console.log(`\nDone. April 2026 schedule days for Orilla: ${count}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
