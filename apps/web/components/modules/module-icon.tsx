"use client";

import type { LucideIcon } from "lucide-react";
import {
  CalendarDays,
  ChartPie,
  ClipboardList,
  CookingPot,
  createLucideIcon,
  GraduationCap,
  Landmark,
  ListTodo,
  Martini,
  Settings,
  ScanFace,
  Stamp,
  TrendingUp,
  Users,
  Wrench,
} from "lucide-react";
import { VaultSafe } from "@/components/modules/vault-safe-icon";
import { SafeLogHaccp } from "@/components/modules/safelog-haccp-icon";
import { GuestsIntel } from "@/components/modules/guests-intel-icon";
import type { ModuleIconKey } from "@/lib/module-icons";
import { cn } from "@/lib/utils";

export { VaultSafe, SafeLogHaccp, GuestsIntel };

/** One chat bubble with three dots — reads at hub size; overlapping squares do not. */
const TeamMessages = createLucideIcon("messages-square", [
  [
    "path",
    {
      d: "M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719",
      key: "bubble",
    },
  ],
  [
    "circle",
    {
      cx: "8",
      cy: "11.5",
      r: "1.2",
      fill: "currentColor",
      stroke: "none",
      key: "dot-1",
    },
  ],
  [
    "circle",
    {
      cx: "12",
      cy: "11.5",
      r: "1.2",
      fill: "currentColor",
      stroke: "none",
      key: "dot-2",
    },
  ],
  [
    "circle",
    {
      cx: "16",
      cy: "11.5",
      r: "1.2",
      fill: "currentColor",
      stroke: "none",
      key: "dot-3",
    },
  ],
]);

/**
 * Open-wall office block — Lucide Building2 stacks overlapping walls
 * and long window bars, so the strokes blob together at hub size.
 */
const HubBuilding = createLucideIcon("building-2", [
  [
    "path",
    {
      d: "M6 22V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v17",
      key: "tower",
    },
  ],
  [
    "path",
    {
      d: "M6 12H4a2 2 0 0 0-2 2v8",
      key: "left",
    },
  ],
  [
    "path",
    {
      d: "M18 10h2a2 2 0 0 1 2 2v10",
      key: "right",
    },
  ],
  ["path", { d: "M2 22h20", key: "ground" }],
  ["path", { d: "M10 8h.01", key: "w1" }],
  ["path", { d: "M14 8h.01", key: "w2" }],
  ["path", { d: "M10 12h.01", key: "w3" }],
  ["path", { d: "M14 12h.01", key: "w4" }],
  [
    "path",
    {
      d: "M14 22v-3a2 2 0 0 0-4 0v3",
      key: "door",
    },
  ],
]);

/** Simple phone: rounded chassis + a short top bar. */
const HubIphone = createLucideIcon("smartphone", [
  ["rect", { width: "10", height: "20", x: "7", y: "2", rx: "2.5", key: "body" }],
  ["path", { d: "M10 5h4", key: "island" }],
]);

const MODULE_ICONS: Record<ModuleIconKey, LucideIcon> = {
  "messages-square": TeamMessages,
  "clipboard-list": ClipboardList,
  "list-todo": ListTodo,
  "calendar-days": CalendarDays,
  "cooking-pot": CookingPot,
  martini: Martini,
  wrench: Wrench,
  "scan-face": ScanFace,
  "guests-intel": GuestsIntel,
  "notebook-pen": SafeLogHaccp,
  "trending-up": TrendingUp,
  "chart-pie": ChartPie,
  landmark: Landmark,
  users: Users,
  "graduation-cap": GraduationCap,
  "building-2": HubBuilding,
  "vault-safe": VaultSafe,
  stamp: Stamp,
  smartphone: HubIphone,
  settings: Settings,
};

type ModuleIconProps = {
  iconKey: ModuleIconKey | string;
  className?: string;
};

export function ModuleIcon({ iconKey, className }: ModuleIconProps) {
  const Icon =
    (MODULE_ICONS as Record<string, LucideIcon | undefined>)[iconKey] ??
    ClipboardList;

  return (
    <Icon
      className={cn(
        "h-[72px] w-[72px] shrink-0 text-[var(--venue-primary,#818a40)]",
        className,
      )}
      strokeWidth={1.5}
      aria-hidden
    />
  );
}
