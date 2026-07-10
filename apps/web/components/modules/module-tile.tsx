"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ModuleStatus } from "@/lib/modules-registry";

type ModuleTileProps = {
  label: string;
  description: string;
  icon: LucideIcon;
  status: ModuleStatus;
  href?: string;
  clickable: boolean;
};

export function ModuleTile({
  label,
  description,
  icon: Icon,
  status,
  href,
  clickable,
}: ModuleTileProps) {
  const isLive = status === "live" && clickable && href;
  const chip =
    status === "live" && clickable
      ? { text: "Live", className: "bg-emerald-100 text-emerald-800" }
      : { text: "Coming soon", className: "bg-black/8 text-black/50" };

  const inner = (
    <motion.div
      whileHover={isLive ? { y: -4, scale: 1.02 } : undefined}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className={cn(
        "flex h-full flex-col gap-4 rounded-xl border border-black/10 bg-white p-5 shadow-sm",
        isLive
          ? "cursor-pointer hover:border-[var(--venue-primary)]/40 hover:shadow-md"
          : "cursor-default opacity-90",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl",
            isLive
              ? "bg-[var(--venue-primary)]/15 text-[#3D421F]"
              : "bg-black/5 text-black/40",
          )}
        >
          <Icon className="h-6 w-6" />
        </span>
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-medium",
            chip.className,
          )}
        >
          {chip.text}
        </span>
      </div>
      <div>
        <h2 className="font-serif text-xl text-[#3D421F]">{label}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-black/55">
          {description}
        </p>
      </div>
    </motion.div>
  );

  if (isLive && href) {
    return (
      <Link href={href} className="block h-full">
        {inner}
      </Link>
    );
  }

  return inner;
}
