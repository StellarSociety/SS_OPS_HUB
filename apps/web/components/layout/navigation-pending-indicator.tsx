"use client";

import { useLinkStatus } from "next/link";
import { cn } from "@/lib/utils";

type NavigationPendingIndicatorProps = {
  className?: string;
};

export function NavigationPendingIndicator({
  className,
}: NavigationPendingIndicatorProps) {
  const { pending } = useLinkStatus();

  return (
    <span
      aria-hidden
      className={cn(
        "relative h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-0 transition-opacity",
        pending && "opacity-70",
        className,
      )}
    >
      <span className="absolute inset-0 rounded-full bg-current opacity-40 motion-safe:animate-ping" />
    </span>
  );
}
