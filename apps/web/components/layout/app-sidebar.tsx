"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  LayoutGrid,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Venue } from "@/lib/types/database";

const navItems = [
  { label: "Dashboards", href: "/dashboard", icon: LayoutDashboard },
  { label: "Modules", href: "/modules", icon: LayoutGrid },
  { label: "Settings", href: "/settings", icon: Settings },
];

type AppSidebarProps = {
  venue: Venue;
};

export function AppSidebar({ venue }: AppSidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 border-r border-black/5 bg-white/50 backdrop-blur-md md:flex md:flex-col">
      <div className="border-b border-black/5 px-5 py-6">
        <p className="font-serif text-lg text-[#3D421F]">{venue.name}</p>
        <p className="text-xs text-black/50">Operational Hub</p>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {navItems.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                active
                  ? "bg-[var(--venue-primary)]/15 font-medium text-[#3D421F]"
                  : "text-black/60 hover:bg-black/5 hover:text-[#3D421F]",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
