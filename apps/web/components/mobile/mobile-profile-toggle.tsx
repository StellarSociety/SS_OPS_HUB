"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function MobileProfileToggle({
  title,
  count,
  icon: Icon,
  children,
}: {
  title: string;
  count: number;
  icon?: LucideIcon;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="overflow-hidden rounded-xl border border-black/10 bg-black/[0.03] dark:border-white/12 dark:bg-white/[0.08]">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium text-[#3D421F] dark:text-[CanvasText]">
          {Icon ? (
            <Icon
              className="h-4 w-4 shrink-0 text-[var(--venue-primary,#818a40)]"
              strokeWidth={2}
              aria-hidden
            />
          ) : null}
          {title}
        </span>
        <span
          className={cn(
            "inline-flex min-w-[1.25rem] shrink-0 items-center justify-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums leading-none",
            count > 0
              ? "bg-[var(--venue-primary,#818a40)] text-white"
              : "bg-black/[0.06] text-black/40 dark:bg-white/[0.1] dark:text-white/40",
          )}
        >
          {count}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-black/40 transition-transform dark:text-white/40",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {open ? (
        <div className="border-t border-black/10 px-4 py-3 text-sm dark:border-white/12">
          {children}
        </div>
      ) : null}
    </div>
  );
}
