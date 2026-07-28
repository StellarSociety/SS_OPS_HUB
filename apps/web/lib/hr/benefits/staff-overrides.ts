import type { DisciplinaryWarningLevel } from "./types";

/** Per-staff overrides applied when calculating a benefit run. */
export type BenefitStaffOverride = {
  tipPoints?: number | null;
  warningLevel?: DisciplinaryWarningLevel | null;
};

export type BenefitStaffOverridesMap = Record<string, BenefitStaffOverride>;

export function readStaffOverridesFromSnapshot(
  snapshot: unknown,
): BenefitStaffOverridesMap {
  if (!snapshot || typeof snapshot !== "object") return {};
  const raw = (snapshot as Record<string, unknown>).staffOverrides;
  if (!raw || typeof raw !== "object") return {};

  const out: BenefitStaffOverridesMap = {};
  for (const [staffId, value] of Object.entries(
    raw as Record<string, unknown>,
  )) {
    if (!value || typeof value !== "object") continue;
    const row = value as Record<string, unknown>;
    const tipRaw = row.tipPoints ?? row.tip_points;
    const tipPoints =
      tipRaw == null || tipRaw === ""
        ? null
        : Number.isFinite(Number(tipRaw))
          ? Number(tipRaw)
          : null;
    const levelRaw = String(row.warningLevel ?? row.warning_level ?? "");
    const warningLevel =
      levelRaw === "verbal" ||
      levelRaw === "first_written" ||
      levelRaw === "second_written" ||
      levelRaw === "final"
        ? (levelRaw as DisciplinaryWarningLevel)
        : levelRaw === "" || levelRaw === "none" || levelRaw === "null"
          ? null
          : undefined;

    out[staffId] = {
      ...(tipPoints !== undefined ? { tipPoints } : {}),
      ...(warningLevel !== undefined ? { warningLevel } : {}),
    };
  }
  return out;
}

export function withStaffOverridesOnSnapshot<T extends Record<string, unknown>>(
  snapshot: T,
  staffOverrides: BenefitStaffOverridesMap,
): T & { staffOverrides: BenefitStaffOverridesMap } {
  const { staffOverrides: _drop, ...rest } = snapshot as T & {
    staffOverrides?: unknown;
  };
  return { ...rest, staffOverrides } as T & {
    staffOverrides: BenefitStaffOverridesMap;
  };
}

export function applyStaffOverrides<
  T extends {
    id: string;
    tip_points?: number | null;
    warning_level?: DisciplinaryWarningLevel | null;
  },
>(staff: T[], overrides: BenefitStaffOverridesMap): T[] {
  if (!overrides || Object.keys(overrides).length === 0) return staff;
  return staff.map((s) => {
    const o = overrides[s.id];
    if (!o) return s;
    return {
      ...s,
      tip_points:
        o.tipPoints !== undefined ? o.tipPoints : (s.tip_points ?? null),
      warning_level:
        o.warningLevel !== undefined
          ? o.warningLevel
          : (s.warning_level ?? null),
    };
  });
}
