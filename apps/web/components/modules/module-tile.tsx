"use client";

import { ScopedLink as Link } from "@/components/layout/scoped-link";
import { motion } from "framer-motion";
import { Lock } from "lucide-react";
import { ModuleIcon } from "@/components/modules/module-icon";
import type { ModuleIconKey } from "@/lib/module-icons";
import {
  ACCESS_DENIED_MESSAGE,
  ACCESS_DENIED_TITLE,
} from "@/lib/access/messages";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { AppModuleState } from "@/lib/modules-registry";

type ModuleTileProps = {
  label: string;
  iconKey: ModuleIconKey;
  status: AppModuleState;
  href?: string;
  clickable: boolean;
  blockedReason?: "access" | null;
  /** When set, a live tile expands/selects instead of navigating. */
  onSelect?: () => void;
  selected?: boolean;
};

export function ModuleTile({
  label,
  iconKey,
  status,
  href,
  clickable,
  blockedReason,
  onSelect,
  selected = false,
}: ModuleTileProps) {
  const isLive = status === "live" && clickable && Boolean(href);
  const isComingSoon = status === "coming_soon";
  const isLocked = status === "visible_locked";
  const isAccessBlocked = status === "live" && blockedReason === "access";
  // Prefer expand/select over navigation whenever the parent opts in.
  const isSelectable = Boolean(onSelect) && (isLive || isComingSoon);

  const inner = (
    <motion.div
      whileHover={{ scale: 1.07, y: -4 }}
      whileTap={isLive || isSelectable ? { scale: 0.94 } : { scale: 0.98 }}
      transition={{ type: "spring", stiffness: 460, damping: 22 }}
      className={cn(
        "group flex flex-col items-center gap-1.5 px-0.5 py-1 text-center",
        isLive || isAccessBlocked || isSelectable
          ? "cursor-pointer"
          : "cursor-default",
      )}
    >
      <motion.div
        className={cn(
          "relative flex items-center justify-center rounded-2xl transition-[box-shadow,background-color,padding]",
          selected &&
            "bg-[var(--venue-primary)]/15 p-1.5 ring-2 ring-[var(--venue-primary)]/35",
        )}
        whileHover={{ scale: 1.05 }}
        transition={{ type: "spring", stiffness: 500, damping: 18 }}
      >
        <ModuleIcon
          iconKey={iconKey}
          className={cn(
            isComingSoon && "opacity-60",
            isLocked && "opacity-40 grayscale",
            isAccessBlocked && "opacity-45 grayscale",
          )}
        />
        {isAccessBlocked ? (
          <span
            aria-hidden
            className="pointer-events-none absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full border border-black/10 bg-white/90 text-black/55 shadow-sm"
          >
            <Lock className="h-3 w-3" />
          </span>
        ) : null}
        {isComingSoon ? (
          <span
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-[18deg] whitespace-nowrap rounded-[3px] border-2 border-[#b23b2e] px-1.5 py-0.5 text-[9px] font-extrabold uppercase leading-none tracking-[0.08em] text-[#b23b2e]"
          >
            Coming Soon
          </span>
        ) : null}
      </motion.div>
      <p
        className={cn(
          "line-clamp-2 w-full max-w-[5.75rem] text-[11px] font-medium leading-[1.2] tracking-[-0.01em] text-[#3D421F]",
          "font-[system-ui,-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',sans-serif]",
          isLocked && "opacity-50",
          selected && "font-semibold",
        )}
      >
        {label}
      </p>
    </motion.div>
  );

  if (isSelectable && onSelect) {
    return (
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onSelect();
        }}
        aria-pressed={selected}
        aria-label={selected ? `${label} — hide pages` : `${label} — show pages`}
        className="block w-full"
      >
        {inner}
      </button>
    );
  }

  if (isLive && href) {
    return (
      <Link href={href} className="block">
        {inner}
      </Link>
    );
  }

  if (isAccessBlocked) {
    return (
      <button
        type="button"
        onClick={() =>
          toast.alert({
            title: ACCESS_DENIED_TITLE,
            message: ACCESS_DENIED_MESSAGE,
          })
        }
        aria-label={`${label} — access restricted`}
        className="block w-full"
      >
        {inner}
      </button>
    );
  }

  return inner;
}
