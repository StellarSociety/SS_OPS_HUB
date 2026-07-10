/**
 * CLI: import Orilla staff from data/orilla-staff.csv
 * Requires SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL in env.
 *
 * Usage: pnpm import-staff [path-to-csv]
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve as resolvePath, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolvePath(__dirname, "../.env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i === -1) continue;
    const key = line.slice(0, i);
    const value = line.slice(i + 1);
    if (!process.env[key]) process.env[key] = value;
  }
}
const csvPath =
  process.argv[2] ?? resolvePath(__dirname, "../../../data/orilla-staff.csv");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

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

const { data: venue, error: venueError } = await supabase
  .from("venues")
  .select("id")
  .eq("slug", "orilla")
  .single();
if (venueError || !venue) {
  console.error("Orilla venue not found. Apply migrations first.");
  process.exit(1);
}

const [departments, positions, statuses, nationalities] = await Promise.all([
  supabase.from("departments").select("*").eq("venue_id", venue.id),
  supabase.from("positions").select("*").eq("venue_id", venue.id),
  supabase.from("employment_statuses").select("*"),
  supabase.from("nationalities").select("*"),
]);

function resolveLookupId(items, name) {
  if (!name) return null;
  return (
    items?.find((i) => i.name.toLowerCase() === name.trim().toLowerCase())
      ?.id ?? null
  );
}

const csv = readFileSync(csvPath, "utf8");
const rows = parseCsv(csv);
let inserted = 0;
let updated = 0;

for (const row of rows) {
  const empNo = row.emp_no;
  if (!empNo) continue;
  const deptId = resolveLookupId(departments.data, row.department);
  const statusId = resolveLookupId(statuses.data, row.status);
  const natId = resolveLookupId(nationalities.data, row.nationality);
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
    full_name:
      row.full_name || `${row.first_name} ${row.last_name}`.trim() || empNo,
  };

  const { data: existing } = await supabase
    .from("staff")
    .select("id")
    .eq("home_venue_id", venue.id)
    .eq("emp_no", empNo)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("staff")
      .update(payload)
      .eq("id", existing.id);
    if (error) console.error(empNo, error.message);
    else updated++;
  } else {
    const { error } = await supabase.from("staff").insert(payload);
    if (error) console.error(empNo, error.message);
    else inserted++;
  }
}

console.log(
  `Import complete: ${inserted} inserted, ${updated} updated (${rows.length} rows)`,
);
