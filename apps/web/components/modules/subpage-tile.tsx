"use client";

import { ScopedLink as Link } from "@/components/layout/scoped-link";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
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
      ? "h-14 w-14 shrink-0 text-[var(--venue-primary,#818a40)]"
      : "h-[72px] w-[72px] shrink-0 text-[var(--venue-primary,#818a40)]";
  const labelClass =
    size === "sm"
      ? "line-clamp-2 w-full max-w-[4.75rem] text-[10px] font-medium leading-[1.2] tracking-[-0.01em] text-[#3D421F]"
      : "line-clamp-2 w-full max-w-[5.75rem] text-[11px] font-medium leading-[1.2] tracking-[-0.01em] text-[#3D421F]";

  const inner = (
    <motion.div
      whileHover={{ scale: 1.07, y: -4 }}
      whileTap={comingSoon ? { scale: 0.98 } : { scale: 0.94 }}
      transition={{ type: "spring", stiffness: 460, damping: 22 }}
      className={cn(
        "group flex flex-col items-center gap-1.5 px-0.5 py-1 text-center",
        comingSoon ? "cursor-default" : "cursor-pointer",
      )}
    >
      <motion.div
        className="relative flex items-center justify-center"
        whileHover={{ scale: 1.05 }}
        transition={{ type: "spring", stiffness: 500, damping: 18 }}
      >
        <Icon
          className={cn(iconClass, comingSoon && "opacity-60")}
          strokeWidth={1.5}
          aria-hidden
        />
        {comingSoon ? (
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
