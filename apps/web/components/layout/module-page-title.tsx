"use client";

import { usePathname } from "next/navigation";
import { getModuleSidebarIconForPath } from "@/lib/module-sidebar";
import { cn } from "@/lib/utils";

type ModulePageTitleProps = {
  children: React.ReactNode;
  className?: string;
};

/** Page title that automatically prefixes the matching module sidebar symbol. */
export function ModulePageTitle({ children, className }: ModulePageTitleProps) {
  const pathname = usePathname();
  const Icon = getModuleSidebarIconForPath(pathname);

  return (
    <h1
      className={cn(
        "flex items-center gap-2.5 font-serif text-3xl text-[#3D421F]",
        className,
      )}
    >
      {Icon ? (
        <Icon
          className="h-7 w-7 shrink-0 text-[var(--venue-primary,#818a40)]"
          strokeWidth={1.5}
          aria-hidden
        />
      ) : null}
      {children}
    </h1>
  );
}
