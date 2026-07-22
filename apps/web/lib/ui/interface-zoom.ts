export const DEFAULT_UI_ZOOM = 100;
export const MIN_UI_ZOOM = 80;
export const MAX_UI_ZOOM = 120;
export const UI_ZOOM_STEP = 10;

export function uiZoomStorageKey(email: string) {
  return `ss-ops-ui-zoom:${email.trim().toLowerCase()}`;
}

export function parseStoredUiZoom(raw: string | null): number {
  const storedValue = Number.parseInt(raw ?? "", 10);
  if (
    Number.isFinite(storedValue) &&
    storedValue >= MIN_UI_ZOOM &&
    storedValue <= MAX_UI_ZOOM
  ) {
    return storedValue;
  }
  return DEFAULT_UI_ZOOM;
}

/** Scales the UI via rem (reflows layout). Avoid CSS `zoom`, which breaks flex/h-dvh. */
export function applyInterfaceZoom(percent: number) {
  const bounded = Math.min(
    MAX_UI_ZOOM,
    Math.max(MIN_UI_ZOOM, percent),
  );
  const scale = bounded / 100;
  document.documentElement.style.setProperty("--ui-scale", String(scale));
  document.documentElement.style.removeProperty("zoom");
}

export function readStoredUiZoom(storageKey: string): number {
  try {
    return parseStoredUiZoom(window.localStorage.getItem(storageKey));
  } catch {
    return DEFAULT_UI_ZOOM;
  }
}

export function persistUiZoom(storageKey: string, percent: number) {
  try {
    window.localStorage.setItem(storageKey, String(percent));
  } catch {
    // Keep the zoom active for this session if persistence is unavailable.
  }
}
