"use client";

import type { HrEmailStaffDocumentKey } from "@/lib/hr/types";

export type SavedCertRequestDraftAttachment = {
  key: HrEmailStaffDocumentKey;
  label: string;
  fileName: string | null;
  ok: boolean;
};

export type SavedCertRequestDraftUnit = {
  id: string;
  staffId: string;
  empNo: string;
  employeeName: string;
  to: string;
  providerCompany: string;
  providerContact: string;
  subject: string;
  body: string;
  certificationNames: string[];
  attachments: SavedCertRequestDraftAttachment[];
};

export type SavedCertRequestDraftSelection = {
  staffId: string;
  certificationIds: string[];
};

export type SavedCertRequestDraftBatch = {
  id: string;
  savedAt: string;
  selections: SavedCertRequestDraftSelection[];
  units: SavedCertRequestDraftUnit[];
};

function storageKey(venueId: string): string {
  return `ss-ops.cert-request-email-drafts.v1:${venueId}`;
}

function readAll(venueId: string): SavedCertRequestDraftBatch[] {
  if (typeof window === "undefined" || !venueId) return [];
  try {
    const raw = window.localStorage.getItem(storageKey(venueId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (row): row is SavedCertRequestDraftBatch =>
        Boolean(row) &&
        typeof row === "object" &&
        typeof (row as SavedCertRequestDraftBatch).id === "string" &&
        Array.isArray((row as SavedCertRequestDraftBatch).units),
    );
  } catch {
    return [];
  }
}

function writeAll(venueId: string, batches: SavedCertRequestDraftBatch[]) {
  if (typeof window === "undefined" || !venueId) return;
  window.localStorage.setItem(storageKey(venueId), JSON.stringify(batches));
}

export function listCertRequestDraftBatches(
  venueId: string,
): SavedCertRequestDraftBatch[] {
  return readAll(venueId).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export function getCertRequestDraftBatch(
  venueId: string,
  batchId: string,
): SavedCertRequestDraftBatch | null {
  return readAll(venueId).find((b) => b.id === batchId) ?? null;
}

export function upsertCertRequestDraftBatch(
  venueId: string,
  batch: SavedCertRequestDraftBatch,
): SavedCertRequestDraftBatch {
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

export function deleteCertRequestDraftBatch(
  venueId: string,
  batchId: string,
): void {
  writeAll(
    venueId,
    readAll(venueId).filter((b) => b.id !== batchId),
  );
}

export function deleteCertRequestDraftUnit(
  venueId: string,
  batchId: string,
  unitId: string,
): SavedCertRequestDraftBatch | null {
  const all = readAll(venueId);
  const idx = all.findIndex((b) => b.id === batchId);
  if (idx < 0) return null;
  const batch = all[idx]!;
  const units = batch.units.filter((u) => u.id !== unitId);
  if (units.length === 0) {
    all.splice(idx, 1);
    writeAll(venueId, all);
    return null;
  }
  const next: SavedCertRequestDraftBatch = {
    ...batch,
    units,
    selections: batch.selections.filter((sel) =>
      units.some((u) => u.staffId === sel.staffId),
    ),
    savedAt: new Date().toISOString(),
  };
  all[idx] = next;
  writeAll(venueId, all);
  return next;
}

export function countCertRequestDraftUnits(venueId: string): number {
  return readAll(venueId).reduce((sum, b) => sum + b.units.length, 0);
}

export function formatDraftBatchSummary(
  batch: SavedCertRequestDraftBatch,
): string {
  const employees = new Set(batch.units.map((u) => u.staffId)).size;
  const when = new Date(batch.savedAt);
  const stamp = Number.isNaN(when.getTime())
    ? batch.savedAt
    : when.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
  return `${batch.units.length} draft${batch.units.length === 1 ? "" : "s"} · ${employees} employee${employees === 1 ? "" : "s"} · ${stamp}`;
}
