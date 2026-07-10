/**
 * CLI: import Orilla staff from data/orilla-staff.csv
 * Requires SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL in env.
 *
 * Usage: node scripts/import-orilla-staff.mjs [path-to-csv]
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const csvPath = process.argv[2] ?? resolve(__dirname, "../data/orilla-staff.csv");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

// Minimal inline import (mirrors lib/hr/import.ts)
const HEADER_ALIASES = {
  "emp no": "emp_no",
  stattus: "status",
  nacionality: "nationality",
  "first name": "first_name",
  "last name": "last_name",
  "full name": "full_name",
  department: "department",
  position: "position",
  nationality: "nationality",
  status: "status",
};

function normalizeHeader(h) {
  const key = h.trim().toLowerCase();
  return HEADER_ALIASES[key] ?? key.replace(/\s+/g, "_");
}

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  const headers = lines[0].split(",").map(normalizeHeader);
  return lines.slice(1).map((line) => {
    const vals = line.split(",");
    const row = {};
    headers.forEach((h, i) => (row[h] = vals[i]?.trim() ?? ""));
    return row;
  });
}

const supabase = createClient(url, key);

const { data: venue } = await supabase
  .from("venues")
  .select("id")
  .eq("slug", "orilla")
  .single();
if (!venue) throw new Error("Orilla venue not found");

const [departments, positions, statuses, nationalities] = await Promise.all([
  supabase.from("departments").select("*").eq("venue_id", venue.id),
  supabase.from("positions").select("*").eq("venue_id", venue.id),
  supabase.from("employment_statuses").select("*"),
  supabase.from("nationalities").select("*"),
]);

function resolve(items, name) {
  if (!name) return null;
  return items.find((i) => i.name.toLowerCase() === name.trim().toLowerCase())?.id ?? null;
}

const csv = readFileSync(csvPath, "utf8");
const rows = parseCsv(csv);
let inserted = 0;
let updated = 0;

for (const row of rows) {
  const empNo = row.emp_no;
  if (!empNo) continue;
  const deptId = resolve(departments.data, row.department);
  const statusId = resolve(statuses.data, row.status);
  const natId = resolve(nationalities.data, row.nationality);
  const posId = positions.data?.find(
    (p) =>
      p.name.toLowerCase() === (row.position ?? "").toLowerCase() &&
      (!deptId || p.department_id === deptId),
  )?.id;

  const payload = {
    home_venue_id: venue.id,
    emp_no: empNo,
    department_id: deptId,
    position_id: posId,
    employment_status_id: statusId,
    nationality_id: natId,
    first_name: row.first_name || null,
    last_name: row.last_name || null,
    full_name: row.full_name || `${row.first_name} ${row.last_name}`.trim() || empNo,
  };

  const { data: existing } = await supabase
    .from("staff")
    .select("id")
    .eq("home_venue_id", venue.id)
    .eq("emp_no", empNo)
    .maybeSingle();

  if (existing) {
    await supabase.from("staff").update(payload).eq("id", existing.id);
    updated++;
  } else {
    await supabase.from("staff").insert(payload);
    inserted++;
  }
}

console.log(`Import complete: ${inserted} inserted, ${updated} updated (${rows.length} rows)`);
