import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

function loadEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let val = m[2];
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[m[1]] = val;
  }
  return out;
}

const rootEnv = loadEnv(path.resolve(".env.local"));
const webEnv = loadEnv(path.resolve("apps/web/.env.local"));
const env = { ...webEnv, ...rootEnv };
const url = env.DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not found in .env.local");
  process.exit(1);
}

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/apply-migration.mjs <sql-file>");
  process.exit(1);
}
const resolvedFile = path.resolve(file);
const sql = fs.readFileSync(resolvedFile, "utf8");
const version = path.basename(resolvedFile, ".sql");

function toPoolerUrl(connectionString) {
  const parsed = new URL(connectionString);
  const match = parsed.hostname.match(/^db\.([^.]+)\.supabase\.co$/);
  if (!match) return connectionString;
  parsed.hostname = "aws-0-ap-northeast-1.pooler.supabase.com";
  parsed.port = "6543";
  parsed.username = `postgres.${match[1]}`;
  return parsed.toString();
}

const client = new Client({
  connectionString: toPoolerUrl(url),
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 30000,
});

try {
  await client.connect();
  await client.query("BEGIN");
  await client.query(`
    CREATE SCHEMA IF NOT EXISTS supabase_migrations;
    CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
      version TEXT PRIMARY KEY,
      name TEXT,
      inserted_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  const applied = await client.query(
    "SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = $1",
    [version],
  );
  if (applied.rowCount) {
    await client.query("ROLLBACK");
    console.log("SKIP: already applied", file);
  } else {
    await client.query(sql);
    await client.query(
      "INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ($1, $2)",
      [version, path.basename(resolvedFile)],
    );
    await client.query("COMMIT");
    await client.query("NOTIFY pgrst, 'reload schema'");
    console.log("OK: applied", file);
  }
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("FAILED:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
