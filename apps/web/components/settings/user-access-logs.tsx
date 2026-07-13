import { Clock, LogIn, LogOut, SquareArrowOutUpRight } from "lucide-react";
import type { AccessEventRow } from "@/lib/access/types";
import { getModuleLabel } from "@/lib/modules-catalog";
import { Card } from "@/components/ui/card";

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

export function UserAccessLogs({ events }: { events: AccessEventRow[] }) {
  return (
    <Card className="space-y-4 p-4 sm:p-6">
      <div className="flex items-center gap-2">
        <Clock className="h-5 w-5 text-[#818a40]" />
        <h2 className="font-serif text-xl text-[#3D421F]">Access logs</h2>
      </div>

      {events.length === 0 ? (
        <p className="text-sm text-black/50">
          No access recorded yet. Sign-ins and app visits will appear here.
        </p>
      ) : (
        <ul className="divide-y divide-black/5">
          {events.map((e) => {
            const meta = EVENT_META[e.event_type];
            const Icon = meta.Icon;
            return (
              <li key={e.id} className="flex items-center gap-3 py-2.5 text-sm">
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
    </Card>
  );
}
