import type { AccessMatrixLevel } from "@/lib/access/matrix";
import type { ModuleIconKey } from "@/lib/module-icons";

/**
 * Phone shortcuts: welcome-screen tiles that open one screen rather than a
 * whole app (e.g. Hiring Forms). Each venue chooses which are shown; each
 * person gets a level in `mobile_app_access` under the shortcut key.
 */
export type PhoneShortcut = {
  key: string;
  label: string;
  description: string;
  iconKey: ModuleIconKey;
};

export const HIRING_SHORTCUT_KEY = "shortcut_hiring";

export const PHONE_SHORTCUTS: PhoneShortcut[] = [
  {
    key: HIRING_SHORTCUT_KEY,
    label: "Hiring Forms",
    description:
      "Candidate replies and the interview calendar. Editors can change a candidate's status.",
    iconKey: "hiring",
  },
];

export function isPhoneShortcutKey(key: string): boolean {
  return PHONE_SHORTCUTS.some((shortcut) => shortcut.key === key);
}

export function isShortcutOpen(level: AccessMatrixLevel | undefined): boolean {
  return level === "viewer" || level === "editor";
}

/** A shortcut as one person's welcome screen shows it. */
export type WelcomeShortcut = PhoneShortcut & { level: AccessMatrixLevel };
