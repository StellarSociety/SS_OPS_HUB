"use client";

import { ScopedLink as Link } from "@/components/layout/scoped-link";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { AnimatedSymbol } from "@/components/ui/animated-symbol";
import { cn } from "@/lib/utils";

type SubpageTileProps = {
  label: string;
  href: string;
  icon: LucideIcon;
  comingSoon?: boolean;
  size?: "sm" | "md";
};

export function SubpageTile({
  label,
  href,
  icon: Icon,
  comingSoon = false,
  size = "md",
}: SubpageTileProps) {
  const iconClass =
    size === "sm"
      ? "h-12 w-12 shrink-0 text-[var(--venue-primary,#818a40)]"
      : "h-[60px] w-[60px] shrink-0 text-[var(--venue-primary,#818a40)]";
  const labelClass =
    size === "sm"
      ? "line-clamp-2 w-full max-w-[4rem] text-[10px] font-medium leading-[1.2] tracking-[-0.01em] text-[#3D421F]"
      : "line-clamp-2 w-full max-w-[4.75rem] text-[11px] font-medium leading-[1.2] tracking-[-0.01em] text-[#3D421F]";

  const inner = (
    <motion.div
      initial="rest"
      whileHover="hover"
      whileTap={comingSoon ? undefined : "tap"}
      variants={{
        rest: { scale: 1, y: 0 },
        hover: { scale: 1.07, y: -4 },
        tap: { scale: 0.94 },
      }}
      transition={{ type: "spring", stiffness: 460, damping: 22 }}
      className={cn(
        "group flex flex-col items-center px-0.5 text-center",
        size === "sm" ? "gap-1 py-0.5" : "gap-1.5 py-1",
        comingSoon ? "cursor-default" : "cursor-pointer",
      )}
    >
      <div className="relative flex items-center justify-center">
        <AnimatedSymbol selfHover={false}>
          <Icon
            className={cn(iconClass, comingSoon && "opacity-60")}
            strokeWidth={1.5}
            aria-hidden
          />
        </AnimatedSymbol>
        {comingSoon ? (
          <span
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-[18deg] whitespace-nowrap rounded-[3px] border-2 border-[#b23b2e] px-1.5 py-0.5 text-[9px] font-extrabold uppercase leading-none tracking-[0.08em] text-[#b23b2e]"
          >
            Coming Soon
          </span>
        ) : null}
      </div>
      <p
        className={cn(
          labelClass,
          "font-[system-ui,-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',sans-serif]",
        )}
      >
        {label}
      </p>
    </motion.div>
  );

  if (comingSoon) {
    return inner;
  }

  return (
    <Link href={href} className="block">
      {inner}
    </Link>
  );
}
