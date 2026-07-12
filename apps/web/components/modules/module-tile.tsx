"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ModuleIcon } from "@/components/modules/module-icon";
import type { ModuleIconKey } from "@/lib/module-icons";
import { cn } from "@/lib/utils";
import type { AppModuleState } from "@/lib/modules-registry";

type ModuleTileProps = {
  label: string;
  iconKey: ModuleIconKey;
  status: AppModuleState;
  href?: string;
  clickable: boolean;
};

export function ModuleTile({
  label,
  iconKey,
  status,
  href,
  clickable,
}: ModuleTileProps) {
  const isLive = status === "live" && clickable && href;
  const isComingSoon = status === "coming_soon";
  const isLocked = status === "visible_locked";

  const inner = (
    <motion.div
      whileHover={{ scale: 1.07, y: -4 }}
      whileTap={isLive ? { scale: 0.94 } : { scale: 0.98 }}
      transition={{ type: "spring", stiffness: 460, damping: 22 }}
      className={cn(
        "group flex flex-col items-center gap-1.5 px-0.5 py-1 text-center",
        isLive ? "cursor-pointer" : "cursor-default",
      )}
    >
      <motion.div
        className="relative flex items-center justify-center"
        whileHover={{ scale: 1.05 }}
        transition={{ type: "spring", stiffness: 500, damping: 18 }}
      >
        <ModuleIcon
          iconKey={iconKey}
          className={cn(
            isComingSoon && "opacity-60",
            isLocked && "opacity-40 grayscale",
          )}
        />
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
        )}
      >
        {label}
      </p>
    </motion.div>
  );

  if (isLive && href) {
    return (
      <Link href={href} className="block">
        {inner}
      </Link>
    );
  }

  return inner;
}
