import "server-only";

import { zohoWorkDriveDownloadHost } from "@/lib/hr/workdrive/constants";
import {
  credentialsFromSettings,
  ensureAccessToken,
  WorkDriveApiError,
} from "@/lib/hr/workdrive/token";
import type { HrWorkDriveSettings } from "@/lib/hr/types";

export {
  WorkDriveApiError,
  credentialsFromSettings,
  ensureAccessToken,
  exchangeAuthorizationCode,
  clearAccessTokenCache,
  type WorkDriveCredentials,
} from "@/lib/hr/workdrive/token";

const JSON_HEADERS_BASE = {
  Accept: "application/vnd.api+json",
} as const;

export type WorkDriveFileRef = {
  id: string;
  name: string;
  permalink: string;
  isFolder: boolean;
  parentId?: string;
  downloadUrl?: string;
};

function stripProtocol(hostOrUrl: string): string {
  return hostOrUrl.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

function apiBase(apiDomain: string): string {
  const host = stripProtocol(apiDomain);
  return `https://${host}/workdrive/api/v1`;
}

function authHeader(accessToken: string): Record<string, string> {
  return {
    Authorization: `Zoho-oauthtoken ${accessToken}`,
    ...JSON_HEADERS_BASE,
  };
}

async function readError(res: Response): Promise<string> {
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

function parseResource(raw: unknown): WorkDriveFileRef | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as {
    id?: string;
    type?: string;
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

/** Alias matching the cursor prompt naming. */
export async function listChildren(
  apiDomain: string,
  accessToken: string,
  folderId: string,
): Promise<WorkDriveFileRef[]> {
  return listFolderChildren(apiDomain, accessToken, folderId);
}

export async function listFolderChildren(
  apiDomain: string,
  accessToken: string,
  folderId: string,
): Promise<WorkDriveFileRef[]> {
  const out: WorkDriveFileRef[] = [];
  let offset = 0;
  const limit = 50;

  for (;;) {
    const url = new URL(
      `${apiBase(apiDomain)}/files/${encodeURIComponent(folderId)}/files`,
    );
    url.searchParams.set("page[limit]", String(limit));
    url.searchParams.set("page[offset]", String(offset));

    const res = await fetch(url, {
      method: "GET",
      headers: authHeader(accessToken),
    });
    if (!res.ok) {
      throw new WorkDriveApiError(await readError(res), res.status, "");
    }
    const json = (await res.json()) as { data?: unknown[] };
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

export async function findChildByName(
  apiDomain: string,
  accessToken: string,
  parentId: string,
  name: string,
): Promise<WorkDriveFileRef | null> {
  const children = await listFolderChildren(apiDomain, accessToken, parentId);
  const needle = name.trim().toLowerCase();
  return (
    children.find(
      (c) => c.isFolder && c.name.trim().toLowerCase() === needle,
    ) ??
    children.find((c) => c.name.trim().toLowerCase() === needle) ??
    null
  );
}

export async function createFolder(
  apiDomain: string,
  accessToken: string,
  parentId: string,
  name: string,
): Promise<WorkDriveFileRef> {
  const res = await fetch(`${apiBase(apiDomain)}/files`, {
    method: "POST",
    headers: {
      ...authHeader(accessToken),
      "Content-Type": "application/vnd.api+json",
    },
    body: JSON.stringify({
      data: {
        type: "files",
        attributes: {
          name,
          parent_id: parentId,
        },
      },
    }),
  });
  if (!res.ok) {
    throw new WorkDriveApiError(await readError(res), res.status, "");
  }
  const json = (await res.json()) as { data?: unknown };
  const parsed = parseResource(json.data);
  if (!parsed) {
    throw new Error("Create folder succeeded but response had no folder id.");
  }
  return { ...parsed, isFolder: true, name: parsed.name || name };
}

/** `GET /files/{id}` — JSON:API metadata. */
export async function getMetadata(
  apiDomain: string,
  accessToken: string,
  resourceId: string,
): Promise<WorkDriveFileRef> {
  const res = await fetch(
    `${apiBase(apiDomain)}/files/${encodeURIComponent(resourceId)}`,
    {
      method: "GET",
      headers: authHeader(accessToken),
    },
  );
  if (!res.ok) {
    throw new WorkDriveApiError(await readError(res), res.status, "");
  }
  const json = (await res.json()) as { data?: unknown };
  const parsed = parseResource(json.data);
  if (!parsed) {
    throw new Error("Metadata response had no resource id.");
  }
  return parsed;
}

export async function renameFile(
  apiDomain: string,
  accessToken: string,
  fileId: string,
  name: string,
): Promise<void> {
  const res = await fetch(
    `${apiBase(apiDomain)}/files/${encodeURIComponent(fileId)}`,
    {
      method: "PATCH",
      headers: {
        ...authHeader(accessToken),
        "Content-Type": "application/vnd.api+json",
      },
      body: JSON.stringify({
        data: {
          type: "files",
          attributes: { name },
        },
      }),
    },
  );
  if (!res.ok) {
    throw new WorkDriveApiError(await readError(res), res.status, "");
  }
}

/** Move a file or folder to WorkDrive trash (`status: 51`). */
export async function trashFile(
  apiDomain: string,
  accessToken: string,
  resourceId: string,
): Promise<void> {
  const res = await fetch(
    `${apiBase(apiDomain)}/files/${encodeURIComponent(resourceId)}`,
    {
      method: "PATCH",
      headers: {
        ...authHeader(accessToken),
        "Content-Type": "application/vnd.api+json",
      },
      body: JSON.stringify({
        data: {
          type: "files",
          attributes: { status: "51" },
        },
      }),
    },
  );
  if (!res.ok) {
    throw new WorkDriveApiError(await readError(res), res.status, "");
  }
}

export async function uploadFile(params: {
  apiDomain: string;
  accessToken: string;
  parentId: string;
  fileName: string;
  bytes: Buffer;
  contentType: string;
  overrideNameExist?: boolean;
}): Promise<WorkDriveFileRef> {
  const form = new FormData();
  form.set("parent_id", params.parentId);
  form.set(
    "override-name-exist",
    params.overrideNameExist === true ? "true" : "false",
  );
  // OAS: filename field; also set Blob name for multipart Content-Disposition
  form.set("filename", params.fileName);
  form.set(
    "content",
    new Blob([new Uint8Array(params.bytes)], { type: params.contentType }),
    params.fileName,
  );

  const res = await fetch(`${apiBase(params.apiDomain)}/upload`, {
    method: "POST",
    headers: {
      Authorization: `Zoho-oauthtoken ${params.accessToken}`,
      // Do not set Content-Type — fetch sets multipart boundary
    },
    body: form,
  });
  if (!res.ok) {
    throw new WorkDriveApiError(await readError(res), res.status, "");
  }
  const json = (await res.json()) as { data?: unknown };
  const raw = Array.isArray(json.data) ? json.data[0] : json.data;
  const parsed = parseResource(raw);
  if (!parsed) {
    throw new Error("Upload succeeded but response had no file id.");
  }
  return parsed;
}

/**
 * Stream file bytes from WorkDrive.
 * Prefers the authenticated API host (`…/workdrive/api/v1/download/{id}`),
 * which accepts WorkDrive.files.READ. Falls back to download.zoho… when needed.
 */
export async function downloadFile(params: {
  region: HrWorkDriveSettings["region"];
  apiDomain: string;
  accessToken: string;
  resourceId: string;
}): Promise<{
  body: ReadableStream<Uint8Array> | null;
  contentType: string;
  contentLength: string | null;
  fileName: string | null;
}> {
  const auth = {
    Authorization: `Zoho-oauthtoken ${params.accessToken}`,
  };
  const primaryUrl = `${apiBase(params.apiDomain)}/download/${encodeURIComponent(params.resourceId)}`;
  let res = await fetch(primaryUrl, { method: "GET", headers: auth });

  if (!res.ok) {
    const primaryError = await readError(res);
    const host = zohoWorkDriveDownloadHost(params.region);
    const fallbackUrl = `https://${host}/v1/workdrive/download/${encodeURIComponent(params.resourceId)}`;
    const fallback = await fetch(fallbackUrl, { method: "GET", headers: auth });
    if (!fallback.ok) {
      const fallbackError = await readError(fallback);
      const combined = [primaryError, fallbackError]
        .filter(Boolean)
        .join(" | ");
      throw new WorkDriveApiError(
        /INVALID_OAUTHSCOPE/i.test(combined)
          ? `${combined}. Regenerate the Self Client grant with scope WorkDrive.files.ALL,WorkDrive.teamfolders.READ and exchange it again in Drive config.`
          : combined || `HTTP ${fallback.status}`,
        fallback.status,
        "",
      );
    }
    res = fallback;
  }

  const disposition = res.headers.get("content-disposition");
  let fileName: string | null = null;
  if (disposition) {
    const m =
      /filename\*=UTF-8''([^;]+)|filename="([^"]+)"|filename=([^;]+)/i.exec(
        disposition,
      );
    fileName = decodeURIComponent(
      (m?.[1] || m?.[2] || m?.[3] || "").trim(),
    ) || null;
  }

  return {
    body: res.body,
    contentType: res.headers.get("content-type") || "application/octet-stream",
    contentLength: res.headers.get("content-length"),
    fileName,
  };
}

/** Live connectivity check: refresh token + list Employee Docs (or HR) children. */
export async function verifyWorkDriveAccess(
  venueId: string,
  settings: HrWorkDriveSettings,
): Promise<{ childCount: number; folderId: string; apiDomain: string }> {
  const credentials = credentialsFromSettings(settings);
  const { accessToken, apiDomain } = await ensureAccessToken(
    venueId,
    credentials,
    { forceRefresh: true },
  );
  const folderId =
    settings.employeeDocsFolderId ||
    settings.hrFolderId ||
    settings.teamFolderId;
  if (!folderId) {
    throw new Error(
      "Set Employee Documents folder ID (or Human Resources / Team folder ID).",
    );
  }
  const children = await listFolderChildren(apiDomain, accessToken, folderId);
  return { childCount: children.length, folderId, apiDomain };
}
