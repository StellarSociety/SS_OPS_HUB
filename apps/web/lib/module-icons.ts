export const MODULE_ICON_KEYS = [
  "clipboard-list",
  "folder-kanban",
  "wrench",
  "smile",
  "trending-up",
  "calculator",
  "landmark",
  "users",
  "graduation-cap",
  "building-2",
  "check-circle-2",
] as const;

export type ModuleIconKey = (typeof MODULE_ICON_KEYS)[number];
