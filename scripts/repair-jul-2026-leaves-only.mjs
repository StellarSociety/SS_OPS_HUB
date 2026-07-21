/**
 * July 2026 repair: remove imported SHIFT/OFF; keep/apply sheet leave marks only.
 * Sheet PH → PH-REPL (replacement days, same as remap-sheet-ph-to-ph-repl).
 *
 *   node scripts/repair-jul-2026-leaves-only.mjs
 *   node scripts/repair-jul-2026-leaves-only.mjs --dry-run
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

/** Screenshot leave marks only (no SHIFT/OFF). PH stored as PH-REPL. */
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

async function loadJulyRows(sb, venueId) {
  /** @type {object[]} */
  const all = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from("hr_schedule_days")
      .select("id, staff_id, emp_no, work_date, label_code, source")
      .eq("venue_id", venueId)
      .gte("work_date", "2026-07-01")
      .lte("work_date", "2026-07-31")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    all.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return all;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  console.log("Sheet leave totals:");
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
  const existing = await loadJulyRows(sb, venue.id);
  const beforeCounts = {};
  for (const r of existing) {
    beforeCounts[r.label_code] = (beforeCounts[r.label_code] ?? 0) + 1;
  }
  console.log("\nBefore label counts:", beforeCounts);

  const toDelete = existing.filter(
    (r) => r.label_code === "SHIFT" || r.label_code === "OFF",
  );
  console.log(`SHIFT/OFF rows to delete: ${toDelete.length}`);

  const now = new Date().toISOString();
  /** @type {object[]} */
  const leaveRows = [];
  for (const [empNo, marks] of Object.entries(SHEET_MARKS)) {
    const staff = staffByEmp.get(empNo);
    if (!staff) {
      console.warn("Missing staff:", empNo);
      continue;
    }
    for (const [dayStr, code] of Object.entries(marks)) {
      const day = Number(dayStr);
      leaveRows.push({
        venue_id: venue.id,
        staff_id: staff.id,
        emp_no: empNo,
        work_date: dateStr(day),
        label_code: code,
        department_id: staff.department_id ?? null,
        shift_template_id: null,
        source: "import",
        updated_at: now,
      });
    }
  }
  console.log(`Leave rows to upsert: ${leaveRows.length}`);

  if (dryRun) {
    console.log("Dry run — no write.");
    return;
  }

  // Delete SHIFT/OFF in chunks by id
  const chunkSize = 200;
  for (let i = 0; i < toDelete.length; i += chunkSize) {
    const ids = toDelete.slice(i, i + chunkSize).map((r) => r.id);
    const { error } = await sb.from("hr_schedule_days").delete().in("id", ids);
    if (error) {
      console.error(`Delete failed at offset ${i}:`, error.message);
      process.exit(1);
    }
    console.log(
      `Deleted ${Math.min(i + chunkSize, toDelete.length)} / ${toDelete.length} SHIFT/OFF`,
    );
  }

  for (let i = 0; i < leaveRows.length; i += 500) {
    const chunk = leaveRows.slice(i, i + 500);
    const { error } = await sb.from("hr_schedule_days").upsert(chunk, {
      onConflict: "staff_id,work_date",
    });
    if (error) {
      console.error(`Upsert failed at offset ${i}:`, error.message);
      process.exit(1);
    }
    console.log(
      `Upserted leaves ${Math.min(i + 500, leaveRows.length)} / ${leaveRows.length}`,
    );
  }

  const after = await loadJulyRows(sb, venue.id);
  const afterCounts = {};
  for (const r of after) {
    afterCounts[r.label_code] = (afterCounts[r.label_code] ?? 0) + 1;
  }
  console.log("\nAfter label counts:", afterCounts);
  console.log(`Total July rows: ${after.length}`);
  console.log("\nDone. July SHIFT/OFF cleared; sheet leaves re-applied.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
