"use client";

import { cn } from "@/lib/utils";

const BADGE_CLASS =
  "flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-black/10 bg-white shadow-sm";
const GLYPH_CLASS = "h-8 w-8";

export function GuestFeedbackSocialIcon({
  icon,
  className,
}: {
  icon: string;
  className?: string;
}) {
  return (
    <span className={cn(BADGE_CLASS, className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/email/social/${icon}.svg?v=g5`}
        alt=""
        aria-hidden
        className={GLYPH_CLASS}
      />
    </span>
  );
}
