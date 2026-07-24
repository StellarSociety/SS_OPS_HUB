#!/usr/bin/env node
/**
 * Apply the HR payroll migration against DATABASE_URL from .env.local.
 * Run from SS_OPS_APP_REPO:
 *   node scripts/apply-hr-payroll-migration.mjs
 */
const fs = require("fs");
const path = require("path");

async function main() {
  const root = path.resolve(__dirname, "..");
  const envPath = path.join(root, ".env.local");
  const sqlPath = path.join(
    root,
    "supabase/migrations/20260724170000_hr_payroll.sql",
  );
  if (!fs.existsSync(envPath)) {
    console.error("Missing .env.local");
    process.exit(1);
  }
  const env = fs.readFileSync(envPath, "utf8");
  const match = env.match(/^DATABASE_URL=(.+)$/m);
  if (!match) {
    console.error("DATABASE_URL not found in .env.local");
    process.exit(1);
  }
  const connectionString = match[1].trim().replace(/^["']|["']$/g, "");
  const sql = fs.readFileSync(sqlPath, "utf8");

  let Client;
  try {
    ({ Client } = require("pg"));
  } catch {
    console.error("Install pg in the repo root: pnpm add -wD pg");
    process.exit(1);
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query(sql);
    console.log("Applied 20260724170000_hr_payroll.sql");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
