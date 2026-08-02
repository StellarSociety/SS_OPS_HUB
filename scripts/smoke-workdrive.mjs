/**
 * WorkDrive smoke test (standalone — no Next runtime).
 *
 * Requires in .env.local:
 *   ZOHO_WD_CLIENT_ID, ZOHO_WD_CLIENT_SECRET, ZOHO_WD_REFRESH_TOKEN
 * Optional:
 *   ZOHO_WD_REGION=com
 *   ZOHO_WD_EMPLOYEE_DOCS_FOLDER_ID=vtvbm62a07bbd35f041bd996fea000998c43a
 *
 * Run: node --env-file=.env.local scripts/smoke-workdrive.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
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

const REGION = process.env.ZOHO_WD_REGION || "com";
const CLIENT_ID = process.env.ZOHO_WD_CLIENT_ID || "";
const CLIENT_SECRET = process.env.ZOHO_WD_CLIENT_SECRET || "";
const REFRESH_TOKEN = process.env.ZOHO_WD_REFRESH_TOKEN || "";
const EMPLOYEE_DOCS =
  process.env.ZOHO_WD_EMPLOYEE_DOCS_FOLDER_ID ||
  "vtvbm62a07bbd35f041bd996fea000998c43a";

const ACCOUNTS =
  REGION === "eu"
    ? "accounts.zoho.eu"
    : REGION === "in"
      ? "accounts.zoho.in"
      : "accounts.zoho.com";
const API =
  REGION === "eu"
    ? "www.zohoapis.eu"
    : REGION === "in"
      ? "www.zohoapis.in"
      : "www.zohoapis.com";

const JSON_ACCEPT = { Accept: "application/vnd.api+json" };

function fail(step, err) {
  console.error(`FAIL [${step}]`, err);
  process.exit(1);
}

function ok(step, detail) {
  console.log(`OK   [${step}]`, detail ?? "");
}

async function ensureAccessToken() {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: REFRESH_TOKEN,
  });
  const res = await fetch(`https://${ACCOUNTS}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || res.statusText);
  }
  return {
    accessToken: json.access_token,
    apiDomain: json.api_domain || `https://${API}`,
  };
}

function apiBase(apiDomain) {
  const host = String(apiDomain).replace(/^https?:\/\//, "").replace(/\/$/, "");
  return `https://${host}/workdrive/api/v1`;
}

async function listChildren(apiDomain, token, folderId) {
  const url = new URL(
    `${apiBase(apiDomain)}/files/${encodeURIComponent(folderId)}/files`,
  );
  url.searchParams.set("page[limit]", "50");
  url.searchParams.set("page[offset]", "0");
  const res = await fetch(url, {
    headers: { Authorization: `Zoho-oauthtoken ${token}`, ...JSON_ACCEPT },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text}`);
  const json = JSON.parse(text);
  return Array.isArray(json.data) ? json.data : [];
}

async function createFolder(apiDomain, token, parentId, name) {
  const res = await fetch(`${apiBase(apiDomain)}/files`, {
    method: "POST",
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      ...JSON_ACCEPT,
      "Content-Type": "application/vnd.api+json",
    },
    body: JSON.stringify({
      data: {
        type: "files",
        attributes: { name, parent_id: parentId },
      },
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text}`);
  const json = JSON.parse(text);
  return json.data;
}

async function renameFile(apiDomain, token, id, name) {
  const res = await fetch(
    `${apiBase(apiDomain)}/files/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        ...JSON_ACCEPT,
        "Content-Type": "application/vnd.api+json",
      },
      body: JSON.stringify({
        data: { type: "files", attributes: { name } },
      }),
    },
  );
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
}

async function uploadPdf(apiDomain, token, parentId, fileName, bytes) {
  const form = new FormData();
  form.set("parent_id", parentId);
  form.set("override-name-exist", "false");
  form.set("filename", fileName);
  form.set("content", new Blob([bytes], { type: "application/pdf" }), fileName);
  const res = await fetch(`${apiBase(apiDomain)}/upload`, {
    method: "POST",
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
    body: form,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text}`);
  const json = JSON.parse(text);
  return Array.isArray(json.data) ? json.data[0] : json.data;
}

function attr(row, key) {
  return row?.attributes?.[key] ?? row?.[key] ?? "";
}

function minimalPdf() {
  // Tiny valid-ish PDF bytes for smoke upload
  const content = `%PDF-1.1
1 0 obj<<>>endobj
2 0 obj<< /Length 44 >>stream
BT /F1 12 Tf 100 700 Td (SS Ops Hub smoke) Tj ET
endstream endobj
3 0 obj<< /Type /Page /Parent 4 0 R /Contents 2 0 R >>endobj
4 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
5 0 obj<< /Type /Catalog /Pages 4 0 R >>endobj
xref
0 6
trailer<< /Root 5 0 R /Size 6 >>
startxref
0
%%EOF
`;
  return Buffer.from(content, "utf8");
}

async function main() {
  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    console.error(`
Missing OAuth env. Add these to .env.local (Self Client → Generate Code → exchange):

  ZOHO_WD_CLIENT_ID=
  ZOHO_WD_CLIENT_SECRET=
  ZOHO_WD_REFRESH_TOKEN=
  ZOHO_WD_REGION=com
  ZOHO_WD_EMPLOYEE_DOCS_FOLDER_ID=${EMPLOYEE_DOCS}

Then re-run: node --env-file=.env.local scripts/smoke-workdrive.mjs
`);
    process.exit(2);
  }

  let token;
  let apiDomain;
  try {
    ({ accessToken: token, apiDomain } = await ensureAccessToken());
    ok("ensureAccessToken", `apiDomain=${apiDomain}`);
  } catch (e) {
    fail("ensureAccessToken", e.message);
  }

  let children;
  try {
    children = await listChildren(apiDomain, token, EMPLOYEE_DOCS);
    ok(
      "listChildren(Employee Documents)",
      `${children.length} item(s) under ${EMPLOYEE_DOCS}`,
    );
  } catch (e) {
    fail("listChildren", e.message);
  }

  const empName = "ORL0056 — Test Staff";
  const existingEmp = children.find(
    (c) =>
      String(attr(c, "name")).trim().toLowerCase() === empName.toLowerCase(),
  );
  let empFolder = existingEmp;
  if (!empFolder) {
    try {
      empFolder = await createFolder(apiDomain, token, EMPLOYEE_DOCS, empName);
      ok("createFolder(employee)", attr(empFolder, "name") || empFolder.id);
    } catch (e) {
      fail("createFolder(employee)", e.message);
    }
  } else {
    ok("createFolder(employee)", "already exists — reused");
  }

  const empId = empFolder.id;
  let passportKids;
  try {
    passportKids = await listChildren(apiDomain, token, empId);
  } catch (e) {
    fail("listChildren(employee)", e.message);
  }
  let passport = passportKids.find(
    (c) => String(attr(c, "name")).trim().toLowerCase() === "passport",
  );
  if (!passport) {
    try {
      passport = await createFolder(apiDomain, token, empId, "Passport");
      ok("createFolder(Passport)", passport.id);
    } catch (e) {
      fail("createFolder(Passport)", e.message);
    }
  } else {
    ok("createFolder(Passport)", "already exists — reused");
  }

  const targetName = "Passport_ORL0056_2026-08-02.pdf";
  let uploaded;
  try {
    uploaded = await uploadPdf(
      apiDomain,
      token,
      passport.id,
      targetName,
      minimalPdf(),
    );
    ok(
      "uploadFile",
      `id=${uploaded.id} name=${attr(uploaded, "FileName") || attr(uploaded, "name")} permalink=${attr(uploaded, "Permalink") || attr(uploaded, "permalink")}`,
    );
  } catch (e) {
    fail("uploadFile", e.message);
  }

  const stored =
    attr(uploaded, "FileName") || attr(uploaded, "name") || "";
  if (stored && stored !== targetName) {
    try {
      await renameFile(apiDomain, token, uploaded.id, targetName);
      ok("renameFile", `${stored} → ${targetName} (filename field did not stick)`);
    } catch (e) {
      fail("renameFile", e.message);
    }
  } else if (!stored) {
    try {
      await renameFile(apiDomain, token, uploaded.id, targetName);
      ok("renameFile", `forced rename to ${targetName} (no name in upload response)`);
    } catch (e) {
      fail("renameFile", e.message);
    }
  } else {
    ok("renameFile", "skipped — upload name already matched target");
  }

  const summary = {
    workdriveFileId: uploaded.id,
    resource_id: uploaded.id,
    permalink: attr(uploaded, "Permalink") || attr(uploaded, "permalink"),
    fileName: targetName,
    employeeFolderId: empId,
    passportFolderId: passport.id,
    employeeDocsFolderId: EMPLOYEE_DOCS,
  };
  const outPath = resolve(ROOT, "scripts/smoke-workdrive-result.json");
  writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.log("\nSmoke test passed.");
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Wrote ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
