"use client";

export type SavedInsuranceRequestDraftUnit = {
  staffId: string;
  empNo: string;
  fullName: string;
  requestType: "issue" | "renew";
  providerId: string | null;
  providerName: string;
  to: string;
  subject: string;
  body: string;
};

export type SavedInsuranceRequestDraftBatch = {
  id: string;
  savedAt: string;
  units: SavedInsuranceRequestDraftUnit[];
};

function storageKey(venueId: string): string {
  return `ss-ops.insurance-request-email-drafts.v1:${venueId}`;
}

function readAll(venueId: string): SavedInsuranceRequestDraftBatch[] {
  if (typeof window === "undefined" || !venueId) return [];
  try {
    const raw = window.localStorage.getItem(storageKey(venueId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (row): row is SavedInsuranceRequestDraftBatch =>
        Boolean(row) &&
        typeof row === "object" &&
        typeof (row as SavedInsuranceRequestDraftBatch).id === "string" &&
        Array.isArray((row as SavedInsuranceRequestDraftBatch).units),
    );
  } catch {
    return [];
  }
}

function writeAll(venueId: string, batches: SavedInsuranceRequestDraftBatch[]) {
  if (typeof window === "undefined" || !venueId) return;
  window.localStorage.setItem(storageKey(venueId), JSON.stringify(batches));
}

export function listInsuranceRequestDraftBatches(
  venueId: string,
): SavedInsuranceRequestDraftBatch[] {
  return readAll(venueId).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export function upsertInsuranceRequestDraftBatch(
  venueId: string,
  batch: SavedInsuranceRequestDraftBatch,
): SavedInsuranceRequestDraftBatch {
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

export function deleteInsuranceRequestDraftBatch(
  venueId: string,
  batchId: string,
): void {
  writeAll(
    venueId,
    readAll(venueId).filter((b) => b.id !== batchId),
  );
}

export function deleteInsuranceRequestDraftUnit(
  venueId: string,
  batchId: string,
  staffId: string,
): SavedInsuranceRequestDraftBatch | null {
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
  const next: SavedInsuranceRequestDraftBatch = {
    ...batch,
    units,
    savedAt: new Date().toISOString(),
  };
  all[idx] = next;
  writeAll(venueId, all);
  return next;
}

export function countInsuranceRequestDraftUnits(venueId: string): number {
  return readAll(venueId).reduce((sum, b) => sum + b.units.length, 0);
}

export function formatInsuranceDraftBatchSummary(
  batch: SavedInsuranceRequestDraftBatch,
): string {
  const issue = batch.units.filter((u) => u.requestType === "issue").length;
  const renew = batch.units.filter((u) => u.requestType === "renew").length;
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
  parts.push(stamp);
  return parts.join(" · ");
}
