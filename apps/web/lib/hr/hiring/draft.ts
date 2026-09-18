export type HiringFormDraft = {
  values: Record<string, string>;
  bodyPage: number;
  savedAt: string;
};

function storageKey(publicCode: string) {
  return `ss-ops-hiring-draft:${publicCode}`;
}

export function loadHiringFormDraft(publicCode: string): HiringFormDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(publicCode));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HiringFormDraft;
    if (!parsed || typeof parsed !== "object" || !parsed.values) return null;
    const values: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed.values)) {
      if (typeof value === "string") values[key] = value;
    }
    return {
      values,
      bodyPage:
        typeof parsed.bodyPage === "number" && Number.isInteger(parsed.bodyPage)
          ? Math.max(0, parsed.bodyPage)
          : 0,
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : "",
    };
  } catch {
    return null;
  }
}

export function saveHiringFormDraft(
  publicCode: string,
  draft: { values: Record<string, string>; bodyPage: number },
): string {
  const savedAt = new Date().toISOString();
  window.localStorage.setItem(
    storageKey(publicCode),
    JSON.stringify({ ...draft, savedAt } satisfies HiringFormDraft),
  );
  return savedAt;
}

export function clearHiringFormDraft(publicCode: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(storageKey(publicCode));
}
