"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const items = [
  { label: "Overview", href: "/settings" },
  { label: "Users & access", href: "/settings/users" },
  { label: "Venue modules", href: "/settings/venue-modules" },
];

export function SettingsSubNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-2 border-b border-black/10 pb-3">
      {items.map((item) => {
        const active =
          item.href === "/settings"
            ? pathname === "/settings"
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm transition-colors",
              active
                ? "bg-[var(--venue-primary)]/15 font-medium text-[#3D421F]"
                : "text-black/60 hover:bg-black/5 hover:text-[#3D421F]",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
