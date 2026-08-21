"use client";

import { ScopedLink as Link } from "@/components/layout/scoped-link";
import { motion } from "framer-motion";
import { Lock } from "lucide-react";
import { ModuleIcon } from "@/components/modules/module-icon";
import { usePageAccess } from "@/components/providers/page-access-provider";
import { AnimatedSymbol } from "@/components/ui/animated-symbol";
import type { ModuleIconKey } from "@/lib/module-icons";
import { cn } from "@/lib/utils";
import type { AppModuleState } from "@/lib/modules-registry";

type ModuleTileProps = {
  label: string;
  iconKey: ModuleIconKey;
  status: AppModuleState;
  href?: string;
  clickable: boolean;
  blockedReason?: "access" | null;
  /** When set, the tile selects instead of navigating. */
  onSelect?: () => void;
  selected?: boolean;
  /** Dashboard uses the stamp; the Apps Hub leaves icons unmarked. */
  comingSoonStyle?: "stamp" | "dot" | "none";
  selectNoun?: string;
  /** Soft olive well behind the glyph — Apps Hub only. */
  iconWell?: boolean;
  density?: "default" | "compact";
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
  comingSoonStyle = "stamp",
  selectNoun = "pages",
  iconWell = false,
  density = "default",
}: ModuleTileProps) {
  const compact = density === "compact";
  const { notifyAccessDenied } = usePageAccess();
  const isLive = status === "live" && clickable && Boolean(href);
  const isComingSoon = status === "coming_soon";
  const isLocked = status === "visible_locked";
  const isAccessBlocked = status === "live" && blockedReason === "access";
  const isSelectable = Boolean(onSelect);

  const inner = (
    <motion.div
      initial="rest"
      whileHover="hover"
      whileTap={isLive || isSelectable ? "tap" : undefined}
      variants={{
        rest: { scale: 1, y: 0 },
        hover: { scale: 1.07, y: -4 },
        tap: { scale: 0.94 },
      }}
      transition={{ type: "spring", stiffness: 460, damping: 22 }}
      className={cn(
        "group flex h-full flex-col items-center justify-start text-center",
        compact ? "gap-1 px-0 py-0.5" : "gap-1.5 px-0.5 py-1",
        isLive || isAccessBlocked || isSelectable
          ? "cursor-pointer"
          : "cursor-default",
      )}
    >
      <div
        className={cn(
          "relative flex items-center justify-center transition-[box-shadow,background-color,padding]",
          iconWell
            ? compact
              ? "h-14 w-14 rounded-2xl bg-[var(--venue-primary)]/12"
              : "h-[5.5rem] w-[5.5rem] rounded-3xl bg-[var(--venue-primary)]/12"
            : "rounded-2xl",
          selected &&
            (iconWell
              ? "ring-2 ring-[var(--venue-primary)]/35"
              : "bg-[var(--venue-primary)]/15 p-1.5 ring-2 ring-[var(--venue-primary)]/35"),
        )}
      >
        <AnimatedSymbol selfHover={false}>
          <ModuleIcon
            iconKey={iconKey}
            className={cn(
              iconWell && (compact ? "h-9 w-9" : "h-14 w-14"),
              isComingSoon && !iconWell && "opacity-60",
              isLocked && "opacity-40 grayscale",
              isAccessBlocked && "opacity-45 grayscale",
            )}
          />
        </AnimatedSymbol>
        {isAccessBlocked ? (
          <span
            aria-hidden
            className="pointer-events-none absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full border border-black/10 bg-white/90 text-black/55 shadow-sm"
          >
            <Lock className="h-3 w-3" />
          </span>
        ) : null}
        {isComingSoon && comingSoonStyle === "stamp" ? (
          <span
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-[18deg] whitespace-nowrap rounded-[2px] border border-[#b23b2e] px-1 py-px text-[7px] font-semibold uppercase leading-none tracking-[0.04em] text-[#b23b2e]"
          >
            Coming Soon
          </span>
        ) : null}
        {comingSoonStyle === "dot" && (isComingSoon || isLive) ? (
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute right-0.5 top-0.5 h-2 w-2 rounded-full",
              isLive ? "bg-[var(--venue-primary,#818a40)]" : "bg-black/25",
            )}
          />
        ) : null}
      </div>
      <p
        className={cn(
          "font-google-sans line-clamp-2 w-full font-medium leading-[1.2] tracking-[-0.01em] text-[#3D421F]",
          compact
            ? "max-w-[4.5rem] text-[10px] leading-tight"
            : "max-w-[5.75rem] text-[11px]",
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
        aria-label={
          selected
            ? `${label} — hide ${selectNoun}`
            : `${label} — show ${selectNoun}`
        }
        className="flex h-full w-full flex-col"
      >
        {inner}
      </button>
    );
  }

  if (isLive && href) {
    return (
      <Link href={href} className="flex h-full w-full flex-col">
        {inner}
      </Link>
    );
  }

  if (isAccessBlocked) {
    return (
      <button
        type="button"
        onClick={() => notifyAccessDenied()}
        aria-label={`${label} — access restricted`}
        className="flex h-full w-full flex-col"
      >
        {inner}
      </button>
    );
  }

  return inner;
}
