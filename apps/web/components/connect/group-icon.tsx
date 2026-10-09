import { createElement } from "react";
import {
  ChefHat,
  Coffee,
  Martini,
  Megaphone,
  MessagesSquare,
  PartyPopper,
  Shield,
  Sparkles,
  Users,
  Utensils,
  Wine,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  megaphone: Megaphone,
  "messages-square": MessagesSquare,
  utensils: Utensils,
  "chef-hat": ChefHat,
  martini: Martini,
  users: Users,
  "party-popper": PartyPopper,
  sparkles: Sparkles,
  wine: Wine,
  coffee: Coffee,
  shield: Shield,
  wrench: Wrench,
};

export function groupIconFor(key: string): LucideIcon {
  return ICONS[key] ?? Users;
}

/** Rounded colour tile with the group's icon. */
export function GroupBadge({
  icon,
  color,
  size = "md",
  className,
}: {
  icon: string;
  color: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const box =
    size === "sm" ? "h-8 w-8 rounded-lg" : size === "lg" ? "h-14 w-14 rounded-2xl" : "h-10 w-10 rounded-xl";
  const glyph = size === "sm" ? "h-4 w-4" : size === "lg" ? "h-7 w-7" : "h-5 w-5";
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center text-white", box, className)}
      style={{ backgroundColor: color }}
      aria-hidden
    >
      {createElement(groupIconFor(icon), { className: glyph })}
    </span>
  );
}
