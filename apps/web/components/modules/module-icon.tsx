"use client";

import type { LucideIcon } from "lucide-react";
import {
  Building2,
  Calculator,
  CheckCircle2,
  ClipboardList,
  FolderKanban,
  GraduationCap,
  Landmark,
  Smile,
  TrendingUp,
  Users,
  Wrench,
} from "lucide-react";
import type { ModuleIconKey } from "@/lib/module-icons";
import { cn } from "@/lib/utils";

const MODULE_ICONS: Record<ModuleIconKey, LucideIcon> = {
  "clipboard-list": ClipboardList,
  "folder-kanban": FolderKanban,
  wrench: Wrench,
  smile: Smile,
  "trending-up": TrendingUp,
  calculator: Calculator,
  landmark: Landmark,
  users: Users,
  "graduation-cap": GraduationCap,
  "building-2": Building2,
  "check-circle-2": CheckCircle2,
};

type ModuleIconProps = {
  iconKey: ModuleIconKey;
  className?: string;
};

export function ModuleIcon({ iconKey, className }: ModuleIconProps) {
  const Icon = MODULE_ICONS[iconKey];

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
