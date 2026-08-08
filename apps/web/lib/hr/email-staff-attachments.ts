import "server-only";

import type { SendAppEmailAttachment } from "@/lib/email/transport/types";
import {
  emailStaffDocumentOption,
  type HrEmailStaffDocumentKey,
} from "@/lib/hr/email-staff-documents";
import {
  credentialsFromSettings,
  downloadFile,
  ensureAccessToken,
} from "@/lib/hr/workdrive/client";
import {
  listStaffWorkDriveDocuments,
  type StaffWorkDriveDocumentRow,
} from "@/lib/hr/workdrive/documents";
import { loadWorkDriveSettings } from "@/lib/hr/workdrive/settings";
import type { SupabaseClient } from "@supabase/supabase-js";

export type StaffEmailAttachmentStatus = {
  key: HrEmailStaffDocumentKey;
  label: string;
  fileName: string | null;
  ok: boolean;
};

function pickLatestDoc(
  rows: StaffWorkDriveDocumentRow[],
  slotId?: string | null,
): StaffWorkDriveDocumentRow | null {
  const filtered =
    slotId == null || slotId === "" || slotId === "default"
      ? rows
      : rows.filter((r) => {
          const slot = String(r.file_slot_id ?? "").trim().toLowerCase();
          if (slot === slotId.toLowerCase()) return true;
          // Filename heuristics for older uploads without slot metadata.
          const name = String(r.file_name ?? "").toLowerCase();
          if (slotId === "front") return /front|_f\b/.test(name);
          if (slotId === "back") return /back|_b\b/.test(name);
          return name.includes(slotId.toLowerCase());
        });
  if (filtered.length === 0) return null;
  return [...filtered].sort((a, b) =>
    String(b.uploaded_at ?? "").localeCompare(String(a.uploaded_at ?? "")),
  )[0]!;
}

async function streamToBuffer(
  stream: ReadableStream<Uint8Array>,
): Promise<Buffer> {
  const reader = stream.getReader();
  const parts: Buffer[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) parts.push(Buffer.from(value));
  }
  return Buffer.concat(parts);
}

async function downloadDocAsAttachment(params: {
  settings: Awaited<ReturnType<typeof loadWorkDriveSettings>>;
  accessToken: string;
  apiDomain: string;
  doc: StaffWorkDriveDocumentRow;
  attachmentLabel: string;
  empNo: string;
}): Promise<SendAppEmailAttachment> {
  const downloaded = await downloadFile({
    region: params.settings.region,
    apiDomain: params.apiDomain,
    accessToken: params.accessToken,
    resourceId: params.doc.workdrive_file_id,
  });
  if (!downloaded.body) {
    throw new Error(`Empty download for ${params.attachmentLabel}.`);
  }
  const buffer = await streamToBuffer(downloaded.body);
  const rawName =
    downloaded.fileName ||
    params.doc.file_name ||
    `${params.attachmentLabel}.bin`;
  const safeEmp = params.empNo.replace(/[^\w.-]+/g, "_") || "staff";
  const safeLabel = params.attachmentLabel.replace(/[^\w.-]+/g, "_");
  const filename = `${safeEmp}_${safeLabel}_${rawName}`.replace(/\s+/g, "_");
  return {
    filename,
    content: buffer.toString("base64"),
    content_type: downloaded.contentType || params.doc.content_type || undefined,
  };
}

export async function inspectStaffEmailAttachments(
  supabase: SupabaseClient,
  venueId: string,
  staffId: string,
  keys: readonly HrEmailStaffDocumentKey[],
): Promise<StaffEmailAttachmentStatus[]> {
  if (keys.length === 0) return [];

  const kinds = [...new Set(keys.map((k) => emailStaffDocumentOption(k)!.kind))];
  const byKind = new Map<string, StaffWorkDriveDocumentRow[]>();
  await Promise.all(
    kinds.map(async (kind) => {
      const rows = await listStaffWorkDriveDocuments(
        supabase,
        venueId,
        staffId,
        kind,
      );
      byKind.set(kind, rows);
    }),
  );

  return keys.map((key) => {
    const option = emailStaffDocumentOption(key)!;
    const doc = pickLatestDoc(byKind.get(option.kind) ?? [], option.slotId);
    return {
      key,
      label: option.label,
      fileName: doc?.file_name ?? null,
      ok: Boolean(doc),
    };
  });
}

export async function loadStaffEmailAttachments(params: {
  supabase: SupabaseClient;
  venueId: string;
  staffId: string;
  empNo: string;
  keys: readonly HrEmailStaffDocumentKey[];
  /** When false, missing docs are skipped instead of failing. Default true. */
  requireAll?: boolean;
}): Promise<
  | {
      ok: true;
      attachments: SendAppEmailAttachment[];
      status: StaffEmailAttachmentStatus[];
    }
  | {
      ok: false;
      error: string;
      status: StaffEmailAttachmentStatus[];
    }
> {
  const requireAll = params.requireAll !== false;
  const status = await inspectStaffEmailAttachments(
    params.supabase,
    params.venueId,
    params.staffId,
    params.keys,
  );
  if (params.keys.length === 0) {
    return { ok: true, attachments: [], status };
  }

  const missing = status.filter((s) => !s.ok);
  if (requireAll && missing.length > 0) {
    return {
      ok: false,
      error: `Missing WorkDrive documents for this employee: ${missing
        .map((m) => m.label)
        .join(", ")}. Upload them under the employee documents folder first.`,
      status,
    };
  }

  const availableKeys = requireAll
    ? [...params.keys]
    : params.keys.filter((key) => status.some((s) => s.key === key && s.ok));
  if (availableKeys.length === 0) {
    return { ok: true, attachments: [], status };
  }

  const kinds = [
    ...new Set(availableKeys.map((k) => emailStaffDocumentOption(k)!.kind)),
  ];
  const byKind = new Map<string, StaffWorkDriveDocumentRow[]>();
  await Promise.all(
    kinds.map(async (kind) => {
      const rows = await listStaffWorkDriveDocuments(
        params.supabase,
        params.venueId,
        params.staffId,
        kind,
      );
      byKind.set(kind, rows);
    }),
  );

  try {
    const settings = await loadWorkDriveSettings(
      params.supabase,
      params.venueId,
    );
    const credentials = credentialsFromSettings(settings);
    const { accessToken, apiDomain } = await ensureAccessToken(
      params.venueId,
      credentials,
    );

    const attachments: SendAppEmailAttachment[] = [];
    for (const key of availableKeys) {
      const option = emailStaffDocumentOption(key)!;
      const doc = pickLatestDoc(byKind.get(option.kind) ?? [], option.slotId);
      if (!doc) {
        if (requireAll) {
          return {
            ok: false,
            error: `Could not resolve ${option.label}.`,
            status,
          };
        }
        continue;
      }
      attachments.push(
        await downloadDocAsAttachment({
          settings,
          accessToken,
          apiDomain,
          doc,
          attachmentLabel: option.label.replace(/\s+/g, "_"),
          empNo: params.empNo,
        }),
      );
    }

    return { ok: true, attachments, status };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not download documents from WorkDrive.",
      status,
    };
  }
}
