"use client";

export type SavedVisaRequestDraftUnit = {
  staffId: string;
  empNo: string;
  fullName: string;
  requestType: "issue" | "renew" | "cancel";
  providerId: string | null;
  providerName: string;
  to: string;
  subject: string;
  body: string;
};

export type SavedVisaRequestDraftBatch = {
  id: string;
  savedAt: string;
  units: SavedVisaRequestDraftUnit[];
};

function storageKey(venueId: string): string {
  return `ss-ops.visa-request-email-drafts.v1:${venueId}`;
}

function readAll(venueId: string): SavedVisaRequestDraftBatch[] {
  if (typeof window === "undefined" || !venueId) return [];
  try {
    const raw = window.localStorage.getItem(storageKey(venueId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (row): row is SavedVisaRequestDraftBatch =>
        Boolean(row) &&
        typeof row === "object" &&
        typeof (row as SavedVisaRequestDraftBatch).id === "string" &&
        Array.isArray((row as SavedVisaRequestDraftBatch).units),
    );
  } catch {
    return [];
  }
}

function writeAll(venueId: string, batches: SavedVisaRequestDraftBatch[]) {
  if (typeof window === "undefined" || !venueId) return;
  window.localStorage.setItem(storageKey(venueId), JSON.stringify(batches));
}

export function listVisaRequestDraftBatches(
  venueId: string,
): SavedVisaRequestDraftBatch[] {
  return readAll(venueId).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export function upsertVisaRequestDraftBatch(
  venueId: string,
  batch: SavedVisaRequestDraftBatch,
): SavedVisaRequestDraftBatch {
  const next = {
    ...batch,
    savedAt: new Date().toISOString(),
  };
  const all = readAll(venueId);
  const idx = all.findIndex((b) => b.id === next.id);
  if (idx >= 0) all[idx] = next;
  else all.unshift(next);
  writeAll(venueId, all);
  return next;
}

export function deleteVisaRequestDraftBatch(
  venueId: string,
  batchId: string,
): void {
  writeAll(
    venueId,
    readAll(venueId).filter((b) => b.id !== batchId),
  );
}

export function deleteVisaRequestDraftUnit(
  venueId: string,
  batchId: string,
  staffId: string,
): SavedVisaRequestDraftBatch | null {
  const all = readAll(venueId);
  const idx = all.findIndex((b) => b.id === batchId);
  if (idx < 0) return null;
  const batch = all[idx]!;
  const units = batch.units.filter((u) => u.staffId !== staffId);
  if (units.length === 0) {
    all.splice(idx, 1);
    writeAll(venueId, all);
    return null;
  }
  const next: SavedVisaRequestDraftBatch = {
    ...batch,
    units,
    savedAt: new Date().toISOString(),
  };
  all[idx] = next;
  writeAll(venueId, all);
  return next;
}

export function countVisaRequestDraftUnits(venueId: string): number {
  return readAll(venueId).reduce((sum, b) => sum + b.units.length, 0);
}

export function listStaffVisaCancelDrafts(
  venueId: string,
  staffId: string,
): Array<SavedVisaRequestDraftBatch & { unit: SavedVisaRequestDraftUnit }> {
  const id = String(staffId ?? "").trim();
  if (!id) return [];
  const out: Array<
    SavedVisaRequestDraftBatch & { unit: SavedVisaRequestDraftUnit }
  > = [];
  for (const batch of listVisaRequestDraftBatches(venueId)) {
    const unit = batch.units.find(
      (row) => row.staffId === id && row.requestType === "cancel",
    );
    if (!unit) continue;
    out.push({ ...batch, unit });
  }
  return out;
}

export function formatVisaDraftBatchSummary(
  batch: SavedVisaRequestDraftBatch,
): string {
  const issue = batch.units.filter((u) => u.requestType === "issue").length;
  const renew = batch.units.filter((u) => u.requestType === "renew").length;
  const cancel = batch.units.filter((u) => u.requestType === "cancel").length;
  const when = new Date(batch.savedAt);
  const stamp = Number.isNaN(when.getTime())
    ? batch.savedAt
    : when.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
  const parts = [
    `${batch.units.length} draft${batch.units.length === 1 ? "" : "s"}`,
  ];
  if (issue > 0) parts.push(`${issue} issue`);
  if (renew > 0) parts.push(`${renew} renew`);
  if (cancel > 0) parts.push(`${cancel} cancel`);
  parts.push(stamp);
  return parts.join(" · ");
}
