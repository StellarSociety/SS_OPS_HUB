import { Cake, PartyPopper } from "lucide-react";
import { ConnectAvatar } from "@/components/connect/connect-avatar";
import { ScopedLink } from "@/components/layout/scoped-link";
import { celebrationCaption } from "@/lib/directory/celebrations";
import type { ConnectCelebrationItem } from "@/lib/connect/types";

/** Upcoming birthdays / work anniversaries with a one-click congratulate. */
export function CelebrationsCard({
  items,
  basePath,
  canPost,
}: {
  items: ConnectCelebrationItem[];
  /** Canonical page the congratulate link opens the composer on. */
  basePath: string;
  canPost: boolean;
}) {
  return (
    <section className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold text-[#2B2F16]">
        <Cake className="h-5 w-5 text-rose-500" aria-hidden />
        Celebrations
      </h2>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-black/50">
          No birthdays or work anniversaries this week.
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {items.map((c) => {
            const params = new URLSearchParams({
              celebrate: c.staffId,
              kind: c.kind,
            });
            if (c.years) params.set("years", String(c.years));
            return (
              <li key={`${c.kind}-${c.staffId}`} className="flex items-center gap-3">
                <ConnectAvatar name={c.staffName} photoUrl={c.photoUrl} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[#2B2F16]">{c.staffName}</p>
                  <p className="text-xs text-black/55">
                    {c.kind === "birthday"
                      ? "🎂 Birthday"
                      : `🎉 ${c.years} year${c.years === 1 ? "" : "s"} with us`}{" "}
                    · {celebrationCaption(c.daysFromToday)}
                  </p>
                </div>
                {canPost && c.daysFromToday <= 0 ? (
                  <ScopedLink
                    href={`${basePath}?${params.toString()}`}
                    scroll={false}
                    className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                    title="Post a congratulations"
                  >
                    <PartyPopper className="h-3.5 w-3.5" aria-hidden />
                    Congrats
                  </ScopedLink>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
