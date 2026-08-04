/**
 * One-time: exchange a Zoho Self Client grant code for a refresh token.
 *
 * Usage:
 *   node --env-file=.env.local scripts/zoho-exchange-code.mjs <grant_code>
 *   ZOHO_GRANT_CODE=1000.… node --env-file=.env.local scripts/zoho-exchange-code.mjs
 *
 * Grant codes are single-use and expire in ~3–10 minutes. Run immediately after
 * generating the code in Zoho API Console → Self Client → Generate Code.
 *
 * Paste the returned `refresh_token` into ZOHO_REFRESH_TOKEN in .env.local
 * (and apps/web/.env.local). Never commit secrets.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

function loadEnvFile() {
  try {
    const raw = readFileSync(resolve(ROOT, ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      if (process.env[m[1]]) continue;
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
    }
  } catch {
    /* ignore */
  }
}

loadEnvFile();

const ACCOUNTS_BASE = (
  process.env.ZOHO_ACCOUNTS_BASE || "https://accounts.zoho.com"
).replace(/\/$/, "");
const CLIENT_ID = process.env.ZOHO_CLIENT_ID || "";
const CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET || "";
const GRANT_CODE = (
  process.argv[2] ||
  process.env.ZOHO_GRANT_CODE ||
  ""
).trim();

// Self Client does not require a registered redirect URI; Zoho still accepts a
// placeholder when the parameter is present.
const REDIRECT_URI =
  process.env.ZOHO_REDIRECT_URI || "https://localhost";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(
    "Missing ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET. Add them to .env.local first.",
  );
  process.exit(2);
}

if (!GRANT_CODE) {
  console.error(`
Missing grant code.

  node --env-file=.env.local scripts/zoho-exchange-code.mjs <grant_code>

Or set ZOHO_GRANT_CODE in the environment.
`);
  process.exit(2);
}

const body = new URLSearchParams({
  grant_type: "authorization_code",
  client_id: CLIENT_ID,
  client_secret: CLIENT_SECRET,
  code: GRANT_CODE,
  redirect_uri: REDIRECT_URI,
});

const url = `${ACCOUNTS_BASE}/oauth/v2/token`;
console.log(`POST ${url}`);
console.log(`client_id=${CLIENT_ID.slice(0, 12)}…  code=${GRANT_CODE.slice(0, 12)}…`);

const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body,
});

const text = await res.text();
let json;
try {
  json = JSON.parse(text);
} catch {
  json = { raw: text };
}

console.log("\n--- Zoho token response ---");
console.log(JSON.stringify(json, null, 2));
console.log("--- end ---\n");

if (!res.ok || json.error || !json.refresh_token) {
  console.error(
    "Exchange failed. Generate a fresh Self Client grant code and re-run immediately.",
  );
  process.exit(1);
}

console.log("SUCCESS — paste this into .env.local (both copies):\n");
console.log(`ZOHO_REFRESH_TOKEN=${json.refresh_token}`);
console.log(`\nThen restart \`pnpm dev\` (or reload env) and hit GET /api/zoho/health.`);
