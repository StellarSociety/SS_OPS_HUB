"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const links = [
  { href: "/hr", label: "Staff directory", exact: true },
  { href: "/hr/import", label: "Import" },
  { href: "/hr/lookups", label: "Lookups" },
];

export function HrSubNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-1 border-b border-black/10 pb-3">
      {links.map((link) => {
        const active = link.exact
          ? pathname === link.href
          : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors",
              active
                ? "bg-[var(--venue-primary)]/15 font-medium text-[#3D421F]"
                : "text-black/60 hover:bg-black/5",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
