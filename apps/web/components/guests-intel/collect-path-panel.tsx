"use client";

import { ClipboardPen, Ticket } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type CollectSimPageId = "form" | "pass";

const PAGES: Array<{
  id: CollectSimPageId;
  label: string;
  icon: typeof ClipboardPen;
}> = [
  { id: "form", label: "Guest form", icon: ClipboardPen },
  { id: "pass", label: "Guest pass", icon: Ticket },
];

export function CollectPathPanel({
  selectedId,
  onSelect,
}: {
  selectedId: CollectSimPageId;
  onSelect: (id: CollectSimPageId) => void;
}) {
  return (
    <Card className="flex h-full min-h-0 w-[18rem] shrink-0 flex-col p-4">
      <p className="font-serif text-xl text-[#3D421F]">Pages</p>
      <hr className="mt-3 border-black/10" />
      <nav aria-label="Collect path" className="mt-4 flex flex-col">
        {PAGES.map((page, index) => {
          const active = selectedId === page.id;
          const Icon = page.icon;
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
                  <span
                    className={cn(
                      "block min-w-0 truncate font-nav text-sm text-[#3D421F]",
                      active ? "font-semibold" : "font-medium",
                    )}
                  >
                    {page.label}
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
