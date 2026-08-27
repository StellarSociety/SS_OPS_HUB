export const MODULE_ICON_KEYS = [
  "messages-square",
  "clipboard-list",
  "list-todo",
  "calendar-days",
  "cooking-pot",
  "martini",
  "wrench",
  "scan-face",
  "guests-intel",
  "notebook-pen",
  "trending-up",
  "chart-pie",
  "landmark",
  "users",
  "graduation-cap",
  "building-2",
  "vault-safe",
  "stamp",
  "smartphone",
  "settings",
] as const;

export type ModuleIconKey = (typeof MODULE_ICON_KEYS)[number];
