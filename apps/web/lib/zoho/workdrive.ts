import "server-only";

/**
 * Zoho WorkDrive client using env-only OAuth (Self Client).
 *
 * Required env (see .env.example):
 *   ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN
 *   ZOHO_ACCOUNTS_BASE, ZOHO_WORKDRIVE_API_BASE
 */

type TokenCache = {
  accessToken: string;
  expiresAtMs: number;
};

let tokenCache: TokenCache | null = null;

export class ZohoWorkDriveError extends Error {
  status: number;
  body: string;

  constructor(message: string, status: number, body: string) {
    super(message);
    this.name = "ZohoWorkDriveError";
    this.status = status;
    this.body = body;
  }
}

export type WorkDriveResource = {
  id: string;
  name: string;
  permalink: string;
  isFolder: boolean;
  parentId?: string;
  downloadUrl?: string;
};

function env(name: string): string {
  return String(process.env[name] ?? "").trim();
}

function accountsBase(): string {
  return (env("ZOHO_ACCOUNTS_BASE") || "https://accounts.zoho.com").replace(
    /\/$/,
    "",
  );
}

function apiBase(): string {
  return (
    env("ZOHO_WORKDRIVE_API_BASE") ||
    "https://www.zohoapis.com/workdrive/api/v1"
  ).replace(/\/$/, "");
}

function requireOAuthEnv(): {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
} {
  const clientId = env("ZOHO_CLIENT_ID");
  const clientSecret = env("ZOHO_CLIENT_SECRET");
  const refreshToken = env("ZOHO_REFRESH_TOKEN");
  if (!clientId || !clientSecret || !refreshToken) {
    throw new ZohoWorkDriveError(
      "Missing ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, or ZOHO_REFRESH_TOKEN.",
      0,
      "",
    );
  }
  return { clientId, clientSecret, refreshToken };
}

async function readErrorBody(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  try {
    const json = JSON.parse(text) as {
      errors?: Array<{ title?: string; detail?: string; id?: string }>;
      error?: string;
      error_description?: string;
    };
    if (json.errors?.[0]) {
      const e = json.errors[0];
      return [e.id, e.title, e.detail].filter(Boolean).join(" — ") || text;
    }
    if (json.error) {
      return [json.error, json.error_description].filter(Boolean).join(" — ");
    }
  } catch {
    /* plain text */
  }
  return text || res.statusText || `HTTP ${res.status}`;
}

function parseResource(raw: unknown): WorkDriveResource | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as {
    id?: string;
    attributes?: Record<string, unknown>;
  };
  const attrs = row.attributes ?? {};
  const id =
    String(row.id ?? attrs.resource_id ?? attrs.Resource_Id ?? "").trim() ||
    "";
  if (!id) return null;
  const name = String(
    attrs.name ?? attrs.FileName ?? attrs.filename ?? "",
  ).trim();
  const permalink = String(
    attrs.Permalink ?? attrs.permalink ?? attrs.DownloadUrl ?? "",
  ).trim();
  const downloadUrl = attrs.DownloadUrl
    ? String(attrs.DownloadUrl)
    : attrs.download_url
      ? String(attrs.download_url)
      : undefined;
  const isFolder = Boolean(
    attrs.is_folder ?? attrs.isFolder ?? attrs.type === "folder",
  );
  const parentId = attrs.parent_id
    ? String(attrs.parent_id)
    : attrs.parentId
      ? String(attrs.parentId)
      : undefined;
  return { id, name, permalink, isFolder, parentId, downloadUrl };
}

/**
 * Refresh an access token via `grant_type=refresh_token`.
 * Cached in memory until ~5 minutes before Zoho's expiry (usually 1h).
 */
export async function getAccessToken(options?: {
  forceRefresh?: boolean;
}): Promise<string> {
  const now = Date.now();
  if (
    !options?.forceRefresh &&
    tokenCache &&
    tokenCache.expiresAtMs > now
  ) {
    return tokenCache.accessToken;
  }

  const { clientId, clientSecret, refreshToken } = requireOAuthEnv();
  const res = await fetch(`${accountsBase()}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
    signal: AbortSignal.timeout(12_000),
  });

  const rawText = await res.text().catch(() => "");
  let json: {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  } = {};
  try {
    json = rawText ? (JSON.parse(rawText) as typeof json) : {};
  } catch {
    json = {};
  }

  if (!res.ok || json.error || !json.access_token) {
    const summary =
      [json.error, json.error_description].filter(Boolean).join(" — ") ||
      (rawText.trim() ? rawText.trim().slice(0, 300) : "Token request failed");
    throw new ZohoWorkDriveError(summary, res.status, rawText);
  }

  const expiresIn = Number(json.expires_in) || 3600;
  // Refresh ~5 min before expiry
  tokenCache = {
    accessToken: json.access_token,
    expiresAtMs: now + Math.max(60, expiresIn - 300) * 1000,
  };
  return tokenCache.accessToken;
}

export function clearAccessTokenCache() {
  tokenCache = null;
}

/**
 * Authenticated fetch against `ZOHO_WORKDRIVE_API_BASE`.
 * Sets `Authorization: Zoho-oauthtoken …` and retries once on 401 after refresh.
 */
export async function authedFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const base = apiBase();
  const url = path.startsWith("http")
    ? path
    : `${base}${path.startsWith("/") ? path : `/${path}`}`;

  const doFetch = async (accessToken: string) => {
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Zoho-oauthtoken ${accessToken}`);
    if (!headers.has("Accept")) {
      headers.set("Accept", "application/vnd.api+json");
    }
    return fetch(url, { ...init, headers });
  };

  let token = await getAccessToken();
  let res = await doFetch(token);
  if (res.status === 401) {
    clearAccessTokenCache();
    token = await getAccessToken({ forceRefresh: true });
    res = await doFetch(token);
  }
  return res;
}

async function jsonApiGet(path: string): Promise<unknown> {
  const res = await authedFetch(path, { method: "GET" });
  if (!res.ok) {
    throw new ZohoWorkDriveError(await readErrorBody(res), res.status, "");
  }
  return res.json();
}

function withPage(path: string, limit: number, offset: number): string {
  const qs = new URLSearchParams({
    "page[limit]": String(limit),
    "page[offset]": String(offset),
  });
  return `${path}?${qs.toString()}`;
}

/** Current WorkDrive user (`GET /users/me`). */
export async function getCurrentUser(): Promise<{
  id: string;
  email?: string;
  displayName?: string;
  preferredTeamId?: string;
  orgId?: string;
}> {
  const json = (await jsonApiGet("/users/me")) as {
    data?: { id?: string; attributes?: Record<string, unknown> };
  };
  const id = String(json.data?.id ?? "").trim();
  if (!id) {
    throw new ZohoWorkDriveError("users/me response had no user id.", 0, "");
  }
  const attrs = json.data?.attributes ?? {};
  return {
    id,
    email: attrs.email_id ? String(attrs.email_id) : undefined,
    displayName: attrs.display_name
      ? String(attrs.display_name)
      : undefined,
    preferredTeamId: attrs.preferred_team_id
      ? String(attrs.preferred_team_id)
      : undefined,
    orgId: attrs.org_id ? String(attrs.org_id) : undefined,
  };
}

/** List team folders visible to the authenticated user. */
export async function listTeamFolders(): Promise<WorkDriveResource[]> {
  const user = await getCurrentUser();
  const out: WorkDriveResource[] = [];
  let offset = 0;
  const limit = 50;

  for (;;) {
    const json = (await jsonApiGet(
      withPage(`/users/${encodeURIComponent(user.id)}/teamfolders`, limit, offset),
    )) as { data?: unknown[] };
    const batch = Array.isArray(json.data) ? json.data : [];
    for (const item of batch) {
      const parsed = parseResource(item);
      if (parsed) out.push({ ...parsed, isFolder: true });
    }
    if (batch.length < limit) break;
    offset += limit;
    if (offset > 5000) break;
  }

  return out;
}

/** List files and folders under a parent folder. */
export async function listFolderContents(
  folderId: string,
): Promise<WorkDriveResource[]> {
  const out: WorkDriveResource[] = [];
  let offset = 0;
  const limit = 50;

  for (;;) {
    const json = (await jsonApiGet(
      withPage(
        `/files/${encodeURIComponent(folderId)}/files`,
        limit,
        offset,
      ),
    )) as { data?: unknown[] };
    const batch = Array.isArray(json.data) ? json.data : [];
    for (const item of batch) {
      const parsed = parseResource(item);
      if (parsed) out.push(parsed);
    }
    if (batch.length < limit) break;
    offset += limit;
    if (offset > 5000) break;
  }

  return out;
}

export type UploadFileInput = {
  name: string;
  bytes: Buffer | Uint8Array;
  contentType?: string;
  overrideNameExist?: boolean;
};

/** Upload a file into a parent folder (`POST /upload`). */
export async function uploadFile(
  parentId: string,
  file: UploadFileInput,
): Promise<WorkDriveResource> {
  const form = new FormData();
  form.set("parent_id", parentId);
  form.set(
    "override-name-exist",
    file.overrideNameExist === true ? "true" : "false",
  );
  form.set("filename", file.name);
  form.set(
    "content",
    new Blob([new Uint8Array(file.bytes)], {
      type: file.contentType || "application/octet-stream",
    }),
    file.name,
  );

  const res = await authedFetch("/upload", {
    method: "POST",
    // Do not set Content-Type — fetch sets multipart boundary
    body: form,
    headers: {
      // Override default Accept for multipart upload responses
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    throw new ZohoWorkDriveError(await readErrorBody(res), res.status, "");
  }

  const json = (await res.json()) as { data?: unknown };
  const raw = Array.isArray(json.data) ? json.data[0] : json.data;
  const parsed = parseResource(raw);
  if (!parsed) {
    throw new ZohoWorkDriveError(
      "Upload succeeded but response had no file id.",
      res.status,
      "",
    );
  }
  return parsed;
}

/** Download file bytes (`GET /download/{fileId}`). */
export async function downloadFile(fileId: string): Promise<{
  body: ReadableStream<Uint8Array> | null;
  contentType: string;
  contentLength: string | null;
  fileName: string | null;
  arrayBuffer: () => Promise<ArrayBuffer>;
}> {
  const res = await authedFetch(`/download/${encodeURIComponent(fileId)}`, {
    method: "GET",
    headers: { Accept: "*/*" },
  });

  if (!res.ok) {
    throw new ZohoWorkDriveError(await readErrorBody(res), res.status, "");
  }

  const disposition = res.headers.get("content-disposition");
  let fileName: string | null = null;
  if (disposition) {
    const m =
      /filename\*=UTF-8''([^;]+)|filename="([^"]+)"|filename=([^;]+)/i.exec(
        disposition,
      );
    fileName =
      decodeURIComponent((m?.[1] || m?.[2] || m?.[3] || "").trim()) || null;
  }

  return {
    body: res.body,
    contentType: res.headers.get("content-type") || "application/octet-stream",
    contentLength: res.headers.get("content-length"),
    fileName,
    arrayBuffer: () => res.arrayBuffer(),
  };
}
