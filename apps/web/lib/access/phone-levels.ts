import type { AccessMatrixLevel } from "@/lib/access/matrix";

/**
 * Which levels each phone app offers in Mobile App Access. Apps not listed
 * offer all four. Where an app has no Editor, "Viewer" is shown as "On".
 *
 * - Directory: nothing to edit on the phone → Hidden / No access / On.
 * - Connecteam: Viewer reads only; Editor starts chats, sends, posts, calls.
 * - Personal Employee Hub: Viewer views; Editor also applies for leave.
 */
const PHONE_APP_LEVELS: Record<string, AccessMatrixLevel[]> = {
  directory: ["hidden", "none", "viewer"],
};

const ALL_LEVELS: AccessMatrixLevel[] = ["hidden", "none", "viewer", "editor"];

export function phoneLevelsFor(appKey: string): AccessMatrixLevel[] {
  return PHONE_APP_LEVELS[appKey] ?? ALL_LEVELS;
}

/** A stored level shown within the app's options (e.g. an old Editor → On). */
export function phoneLevelForDisplay(
  appKey: string,
  level: AccessMatrixLevel,
): AccessMatrixLevel {
  const levels = phoneLevelsFor(appKey);
  if (levels.includes(level)) return level;
  return level === "editor" && levels.includes("viewer") ? "viewer" : level;
}

/**
 * Phone apps that have real screens in the mobile app. Others only appear as a
 * tile for now and are tagged "Coming soon" in Mobile App Access.
 */
const PHONE_BUILT_APPS = new Set([
  "sales",
  "sentiment",
  "directory",
  "team_connect",
]);

export function isPhoneAppBuilt(appKey: string): boolean {
  return PHONE_BUILT_APPS.has(appKey);
}
