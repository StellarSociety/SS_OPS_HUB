import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  pillSubNavLinkClass,
  segmentedSubNavLinkClass,
} from "@/lib/sub-nav-ui";
import { NavigationPendingIndicator } from "@/components/layout/navigation-pending-indicator";

type SubNavTabProps = {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  variant?: "segmented" | "pill";
};

export function SubNavTab({
  href,
  label,
  icon: Icon,
  active,
  variant = "segmented",
}: SubNavTabProps) {
  return (
    <Link
      href={href}
      className={
        variant === "segmented"
          ? segmentedSubNavLinkClass(active)
          : pillSubNavLinkClass(active)
      }
    >
      <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
      <span
        className={
          variant === "segmented" ? "min-w-0 truncate text-center" : undefined
        }
      >
        {label}
      </span>
      <NavigationPendingIndicator />
    </Link>
  );
}
