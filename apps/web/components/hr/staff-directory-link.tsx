"use client";

import { ScopedLink } from "@/components/layout/scoped-link";
import { cn } from "@/lib/utils";

type StaffDirectoryLinkProps = {
  staffId: string;
  empNo: string;
  className?: string;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
  title?: string;
};

/**
 * Canonical staff-directory entry point: always the employee number,
 * always opens in a new tab. Never link the employee name.
 */
export function StaffDirectoryLink({
  staffId,
  empNo,
  className,
  onClick,
  title = "Open staff directory entry",
}: StaffDirectoryLinkProps) {
  return (
    <ScopedLink
      href={`/hr/${staffId}`}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      onClick={onClick}
      className={cn(
        "rounded font-mono text-xs text-[var(--venue-primary,#818a40)] underline-offset-2 transition hover:bg-[var(--venue-secondary,#F0F3DD)] hover:underline",
        className,
      )}
    >
      {empNo}
    </ScopedLink>
  );
}
