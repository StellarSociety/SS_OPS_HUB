/**
 * Client-side persistence for UI filters / date selections.
 * Writes cookies (primary, per user request) and mirrors to localStorage
 * so values survive refresh even if one store is unavailable.
 */

const DEFAULT_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 year

function storageScope(venueKey: string | null | undefined): string {
  return venueKey?.trim() || "global";
}

export function scopedPersistenceKey(
  base: string,
  venueKey: string | null | undefined,
): string {
  // Avoid `:` in cookie names — browsers/Next treat names as simple tokens.
  return `${base}__${storageScope(venueKey)}`;
}

function readCookieRaw(name: string): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${name}=`;
  const parts = document.cookie.split("; ");
  for (const part of parts) {
    if (part.startsWith(prefix)) {
      try {
        return decodeURIComponent(part.slice(prefix.length));
      } catch {
        return part.slice(prefix.length);
      }
    }
  }
  return null;
}

function writeCookieRaw(
  name: string,
  value: string,
  maxAgeSeconds = DEFAULT_MAX_AGE_SECONDS,
): void {
  if (typeof document === "undefined") return;
  const encodedValue = encodeURIComponent(value);
  document.cookie = `${name}=${encodedValue}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax`;
}

function deleteCookieRaw(name: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
}

function readLocalRaw(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocalRaw(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage may be unavailable (private mode / quota).
  }
}

function deleteLocalRaw(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/** Prefer cookie, fall back to localStorage (migration + resilience). */
export function readPersistedString(key: string): string | null {
  const fromCookie = readCookieRaw(key);
  if (fromCookie != null && fromCookie !== "") return fromCookie;
  // Legacy localStorage keys used `base:venue` before cookie migration.
  const legacyKey = key.includes("__") ? key.replace("__", ":") : key;
  return readLocalRaw(key) ?? readLocalRaw(legacyKey);
}

export function writePersistedString(key: string, value: string): void {
  writeCookieRaw(key, value);
  writeLocalRaw(key, value);
}

export function deletePersistedValue(key: string): void {
  deleteCookieRaw(key);
  deleteLocalRaw(key);
  if (key.includes("__")) {
    deleteLocalRaw(key.replace("__", ":"));
  }
}

export function readPersistedJson(key: string): unknown | null {
  const raw = readPersistedString(key);
  if (raw == null || raw === "") return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    // Legacy plain-string values (e.g. ISO dates written without JSON quotes).
    return raw;
  }
}

export function writePersistedJson(key: string, value: unknown): void {
  try {
    writePersistedString(key, JSON.stringify(value));
  } catch {
    // ignore serialize failures
  }
}
