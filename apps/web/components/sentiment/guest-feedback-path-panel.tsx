"use client";

import { Check, ClipboardPen, Megaphone } from "lucide-react";
import { DEVICE_PREVIEW_PATH_PANEL_CLASS } from "@/components/simulators/device-preview-chrome";
import { Card } from "@/components/ui/card";
import { guestFeedbackPath } from "@/lib/sentiment/guest-feedback/types";
import { cn } from "@/lib/utils";

export type GuestFeedbackSimPageId = "promotions" | "form" | "thank-you";

const PAGES: Array<{
  id: GuestFeedbackSimPageId;
  label: string;
  icon: typeof ClipboardPen;
  hash?: string;
}> = [
  { id: "promotions", label: "Promotions", icon: Megaphone },
  { id: "form", label: "Feedback form", icon: ClipboardPen, hash: "#form" },
  { id: "thank-you", label: "Thank you", icon: Check, hash: "#thanks" },
];

function hrefFor(base: string, id: GuestFeedbackSimPageId): string {
  const hash = PAGES.find((page) => page.id === id)?.hash ?? "";
  return `${base}${hash}`;
}

export function GuestFeedbackPathPanel({
  code,
  selectedId,
  onSelect,
}: {
  code: string;
  selectedId: GuestFeedbackSimPageId;
  onSelect: (id: GuestFeedbackSimPageId) => void;
}) {
  const base = guestFeedbackPath(code);

  return (
    <Card className={DEVICE_PREVIEW_PATH_PANEL_CLASS}>
      <div className="flex min-w-0 items-baseline gap-3">
        <p className="shrink-0 font-serif text-xl text-[#3D421F]">Pages</p>
        <p className="min-w-0 truncate font-mono text-[11px] text-black/40">
          {hrefFor(base, selectedId)}
        </p>
      </div>
      <hr className="mt-3 border-black/10" />
      <nav aria-label="Guest page path" className="mt-4 flex flex-col">
        {PAGES.map((page, index) => {
          const active = selectedId === page.id;
          const Icon = page.icon;
          const href = hrefFor(base, page.id);
          return (
            <div key={page.id} className="flex flex-col">
              <button
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => onSelect(page.id)}
                className="flex w-full min-w-0 items-center gap-2.5 rounded-2xl py-0.5 pr-1 text-left transition-colors hover:bg-[var(--venue-primary,#818a40)]/8"
              >
                <span
                  className={cn(
                    "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                    active
                      ? "bg-[var(--venue-primary,#818a40)] text-white shadow-[0_0_0_4px_rgb(129_138_64_/_0.22)]"
                      : "bg-[var(--venue-primary,#818a40)]/12 text-[#3D421F]/70",
                  )}
                >
                  <Icon className="h-4 w-4" strokeWidth={active ? 2.25 : 1.75} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-baseline justify-between gap-2">
                    <span
                      className={cn(
                        "min-w-0 truncate font-nav text-sm text-[#3D421F]",
                        active ? "font-semibold" : "font-medium",
                      )}
                    >
                      {page.label}
                    </span>
                    <span className="max-w-[46%] shrink-0 truncate text-right font-mono text-[10px] text-black/40">
                      {href}
                    </span>
                  </span>
                  {active ? (
                    <span className="mt-0.5 block text-[10px] font-medium tracking-wide text-[var(--venue-primary,#818a40)]">
                      You are here
                    </span>
                  ) : null}
                </span>
              </button>
              {index < PAGES.length - 1 ? (
                <span
                  aria-hidden
                  className="ml-[17px] h-5 w-0.5 shrink-0 rounded-full bg-[var(--venue-primary,#818a40)]/30"
                />
              ) : null}
            </div>
          );
        })}
      </nav>
    </Card>
  );
}
