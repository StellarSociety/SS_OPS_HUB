/**
 * Call preferences, per device (localStorage) — like the Connecteam alert
 * sounds, each browser / phone keeps its own camera and mirror settings.
 * The call ringtone lives with the other sounds in `sounds.ts`.
 */

import { useSyncExternalStore } from "react";

export type CallPreferences = {
  /** Show my own camera mirrored, like a mirror (others always see the real image). */
  mirrorSelf: boolean;
  /** Hide my own tile during video calls. */
  hideSelf: boolean;
  /** "cover" fills the tile (may crop); "contain" shows the whole image. */
  videoFit: "cover" | "contain";
  /** Start video calls with my camera off. */
  startCameraOff: boolean;
  /** Start every call muted. */
  startMuted: boolean;
  videoInputId: string | null;
  audioInputId: string | null;
  audioOutputId: string | null;
};

export const DEFAULT_CALL_PREFERENCES: CallPreferences = {
  mirrorSelf: true,
  hideSelf: false,
  videoFit: "cover",
  startCameraOff: false,
  startMuted: false,
  videoInputId: null,
  audioInputId: null,
  audioOutputId: null,
};

const STORAGE_KEY = "ssops.call-preferences.v1";
const CHANGE_EVENT = "ssops-call-preferences-change";

// Cached so useSyncExternalStore sees a stable object until storage changes.
let cachedRaw: string | null | undefined;
let cachedPreferences = DEFAULT_CALL_PREFERENCES;

export function readCallPreferences(): CallPreferences {
  if (typeof window === "undefined") return DEFAULT_CALL_PREFERENCES;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return cachedPreferences;
  }
  if (raw === cachedRaw) return cachedPreferences;
  cachedRaw = raw;
  try {
    cachedPreferences = raw
      ? { ...DEFAULT_CALL_PREFERENCES, ...(JSON.parse(raw) as Partial<CallPreferences>) }
      : DEFAULT_CALL_PREFERENCES;
  } catch {
    cachedPreferences = DEFAULT_CALL_PREFERENCES;
  }
  return cachedPreferences;
}

export function updateCallPreferences(patch: Partial<CallPreferences>) {
  const next = { ...readCallPreferences(), ...patch };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private mode or blocked storage: keep the change for this page only.
    cachedRaw = JSON.stringify(next);
    cachedPreferences = next;
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) onChange();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function useCallPreferences(): CallPreferences {
  return useSyncExternalStore(subscribe, readCallPreferences, () => DEFAULT_CALL_PREFERENCES);
}
