"use client";

import { useState, useTransition } from "react";
import { ChevronDown, Clock, LogIn, LogOut, SquareArrowOutUpRight } from "lucide-react";
import { loadUserAccessLogs } from "@/lib/actions/access-log";
import type { AccessEventRow } from "@/lib/access/types";
import { getModuleLabel } from "@/lib/modules-catalog";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const EVENT_META: Record<
  AccessEventRow["event_type"],
  { label: string; Icon: typeof Clock; className: string }
> = {
  login: { label: "Signed in", Icon: LogIn, className: "text-emerald-600" },
  logout: { label: "Signed out", Icon: LogOut, className: "text-black/40" },
  module_access: {
    label: "Opened app",
    Icon: SquareArrowOutUpRight,
    className: "text-[#818a40]",
  },
  page_view: {
    label: "Viewed page",
    Icon: SquareArrowOutUpRight,
    className: "text-[#818a40]",
  },
};

function formatWhen(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function UserAccessLogs({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<AccessEventRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startLoad] = useTransition();

  function toggle() {
    const next = !open;
    setOpen(next);
    if (!next || events !== null || pending) return;
    startLoad(async () => {
      const result = await loadUserAccessLogs(userId);
      if (result.error) {
        setError(result.error);
        setEvents([]);
        return;
      }
      setError(null);
      setEvents(result.events ?? []);
    });
  }

  return (
    <Card className="p-4 sm:p-6">
      <button
        type="button"
        aria-expanded={open}
        onClick={toggle}
        className="flex w-full items-center gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--venue-primary,#818a40)]/40"
      >
        <Clock className="h-5 w-5 shrink-0 text-[#818a40]" aria-hidden />
        <h2 className="min-w-0 flex-1 font-serif text-xl text-[#3D421F]">
          Access logs
        </h2>
        <ChevronDown
          className={cn(
            "h-5 w-5 shrink-0 text-black/45 transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open ? (
        <div className="mt-4">
          {pending && events === null ? (
            <p className="text-sm text-black/50">Loading…</p>
          ) : error ? (
            <p className="text-sm text-red-700" role="alert">
              {error}
            </p>
          ) : events && events.length === 0 ? (
            <p className="text-sm text-black/50">
              No access recorded yet. Sign-ins and app visits will appear here.
            </p>
          ) : (
            <ul className="divide-y divide-black/5">
              {(events ?? []).map((e) => {
                const meta = EVENT_META[e.event_type];
                const Icon = meta.Icon;
                return (
                  <li
                    key={e.id}
                    className="flex items-center gap-3 py-2.5 text-sm"
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${meta.className}`} />
                    <span className="flex-1 text-[#3D421F]">
                      {meta.label}
                      {e.module_key ? (
                        <span className="text-black/50">
                          {" "}
                          · {getModuleLabel(e.module_key)}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-xs text-black/40">
                      {formatWhen(e.created_at)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </Card>
  );
}
