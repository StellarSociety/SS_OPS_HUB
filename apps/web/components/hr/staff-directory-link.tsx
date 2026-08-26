"use client";

import { ScopedLink } from "@/components/layout/scoped-link";
import { usePageAccess } from "@/components/providers/page-access-provider";
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
 * Without the Staff directory grant, the emp number is plain text so
 * assigned pages can still show identity without a "No access" bounce.
 */
export function StaffDirectoryLink({
  staffId,
  empNo,
  className,
  onClick,
  title = "Open staff directory entry",
}: StaffDirectoryLinkProps) {
  const { canOpenHref } = usePageAccess();
  const href = `/hr/${staffId}`;
  const numberClass = cn(
    "rounded font-mono text-xs underline-offset-2",
    className,
  );

  if (!canOpenHref(href)) {
    return <span className={cn(numberClass, "text-black/55")}>{empNo}</span>;
  }

  return (
    <ScopedLink
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      onClick={onClick}
      className={cn(
        numberClass,
        "text-[var(--venue-primary,#818a40)] transition hover:bg-[var(--venue-secondary,#F0F3DD)] hover:underline",
      )}
    >
      {empNo}
    </ScopedLink>
  );
}
