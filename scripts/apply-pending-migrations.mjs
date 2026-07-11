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

/**
 * Migrations whose objects already exist in the remote DB (applied before the
 * schema_migrations tracking table existed). These are recorded as applied
 * without re-running the SQL, since re-running non-idempotent DDL would fail.
 */
const RECORD_ONLY = new Set(["20260710000000_initial_schema"]);

/** Auto-discover every migration file, sorted by version (filename). */
function discoverMigrations() {
  return fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

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

  for (const file of discoverMigrations()) {
    const version = file.replace(/\.sql$/, "");
    if (await isApplied(client, version)) {
      console.log(`skip  ${version} (already applied)`);
      continue;
    }

    if (RECORD_ONLY.has(version)) {
      await client.query(
        "INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ($1, $2) ON CONFLICT (version) DO NOTHING",
        [version, file],
      );
      console.log(`mark  ${version} (record-only, objects already present)`);
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
