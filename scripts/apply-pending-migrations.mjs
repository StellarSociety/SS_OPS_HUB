#!/usr/bin/env node
/**
 * Apply pending SQL migrations to the remote database via DATABASE_URL.
 * Reads apps/web/.env.local for connection string.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const envPath = path.join(repoRoot, "apps/web/.env.local");
const migrationsDir = path.join(repoRoot, "supabase/migrations");

function loadDatabaseUrl() {
  if (!fs.existsSync(envPath)) {
    throw new Error(`Missing ${envPath}`);
  }
  const line = fs
    .readFileSync(envPath, "utf8")
    .split("\n")
    .find((l) => l.startsWith("DATABASE_URL="));
  if (!line) throw new Error("DATABASE_URL not set in .env.local");
  return line.slice("DATABASE_URL=".length).trim();
}

/** Prefer Supavisor pooler — direct db.*.supabase.co often blocks from dev networks. */
function toPoolerUrl(directUrl) {
  const url = new URL(directUrl);
  const refMatch = url.hostname.match(/^db\.([^.]+)\.supabase\.co$/);
  if (!refMatch) return directUrl;

  const ref = refMatch[1];
  url.hostname = "aws-0-ap-northeast-1.pooler.supabase.com";
  url.port = "6543";
  url.username = `postgres.${ref}`;
  return url.toString();
}

const PENDING = [
  "20260710120000_hr_schema.sql",
  "20260710140000_user_access_schema.sql",
  "20260710150000_seed_venue_modules.sql",
  "20260710160000_access_model_submit.sql",
  "20260710160000_operational_apps_modules.sql",
  "20260710160000_orilla_brand_color_svg.sql",
  "20260710140000_orilla_logo_assets.sql",
  "20260710170000_notifications.sql",
  "20260710180000_enable_sales_module.sql",
  "20260710200000_venue_daily_sales.sql",
  "20260710210000_venue_daily_sales_venue_hire.sql",
  "20260710220000_rename_venue_hire_to_service_fees.sql",
  "20260710230000_venue_daily_discounts.sql",
  "20260710240000_venue_waiters.sql",
  "20260710250000_venue_tenders_and_waiter_sales.sql",
  "20260710260000_venue_waiter_daily_sales_comments.sql",
  "20260710270000_venue_waiter_on_accounts_comments.sql",
  "20260710280000_venue_waiter_groups_service_charge.sql",
  "20260710290000_daily_sales_tobacco_waiter_sort_order.sql",
  "20260710300000_venue_daily_vs_waiters_comments.sql",
];

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE SCHEMA IF NOT EXISTS supabase_migrations;
    CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
      version TEXT PRIMARY KEY,
      name TEXT,
      inserted_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function isApplied(client, version) {
  const { rows } = await client.query(
    "SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = $1",
    [version],
  );
  return rows.length > 0;
}

async function main() {
  const databaseUrl = toPoolerUrl(loadDatabaseUrl());
  const client = new pg.Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 30000,
  });

  await client.connect();
  await ensureMigrationsTable(client);

  for (const file of PENDING) {
    const version = file.replace(/\.sql$/, "");
    if (await isApplied(client, version)) {
      console.log(`skip  ${version} (already applied)`);
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    console.log(`apply ${version}…`);
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query(
        "INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ($1, $2)",
        [version, file],
      );
      await client.query("COMMIT");
      await client.query("NOTIFY pgrst, 'reload schema'");
      console.log(`done  ${version}`);
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`fail  ${version}:`, err.message);
      process.exitCode = 1;
      break;
    }
  }

  await client.end();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
