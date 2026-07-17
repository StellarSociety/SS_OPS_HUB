#!/usr/bin/env node
/**
 * Apply supabase/migrations/20260717190000_hr_attendance_months.sql
 * using DATABASE_URL from SS_OPS_APP_REPO/.env.local
 *
 * Usage: node scripts/apply-hr-attendance-months.mjs
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const root = path.resolve(__dirname, "..");

function loadEnv(file) {
  const text = fs.readFileSync(file, "utf8");
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2];
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}

loadEnv(path.join(root, ".env.local"));

const sqlPath = path.join(
  root,
  "supabase/migrations/20260717190000_hr_attendance_months.sql",
);

(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL missing in .env.local");
  }
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  await client.query(fs.readFileSync(sqlPath, "utf8"));
  const { rows } = await client.query(
    "select count(*)::int as months from hr_attendance_months",
  );
  console.log("Applied. hr_attendance_months rows:", rows[0].months);
  await client.end();
})().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
