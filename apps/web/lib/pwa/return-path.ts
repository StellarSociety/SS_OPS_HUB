import { MOBILE_APP_BASE, safeMobileAppPath } from "@/lib/mobile/app-path";
import { PWA_INSTALL_PATH, PWA_RETURN_PATH_KEY } from "@/lib/pwa/constants";

/** Validated internal mobile path for post-install navigation. Never an external URL. */
export function safePwaReturnPath(
  raw: string | null | undefined,
): string | null {
  const path = safeMobileAppPath(raw);
  if (!path) return null;
  const pathname = path.split("?")[0] ?? path;
  if (pathname === PWA_INSTALL_PATH || pathname.startsWith(`${PWA_INSTALL_PATH}/`)) {
    return null;
  }
  return path;
}

export function defaultPwaOpenPath(
  raw: string | null | undefined,
): string {
  return safePwaReturnPath(raw) ?? MOBILE_APP_BASE;
}

export function readStoredPwaReturnPath(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return safePwaReturnPath(sessionStorage.getItem(PWA_RETURN_PATH_KEY));
  } catch {
    return null;
  }
}

export function storePwaReturnPath(raw: string | null | undefined): string | null {
  const path = safePwaReturnPath(raw);
  if (typeof window === "undefined") return path;
  try {
    if (path) sessionStorage.setItem(PWA_RETURN_PATH_KEY, path);
    else sessionStorage.removeItem(PWA_RETURN_PATH_KEY);
  } catch {
    // Ignore quota / private-mode failures.
  }
  return path;
}

export function rememberCurrentMobilePath(pathname: string, search = ""): string | null {
  if (!pathname.startsWith(MOBILE_APP_BASE)) return null;
  return storePwaReturnPath(`${pathname}${search}`);
}
