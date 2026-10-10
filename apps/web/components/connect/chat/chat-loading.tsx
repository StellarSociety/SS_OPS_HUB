import { cn } from "@/lib/utils";

function Bone({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-pulse rounded-full bg-[var(--venue-primary,#818a40)]/12", className)}
    />
  );
}

const BUBBLES: { mine: boolean; w: string }[] = [
  { mine: false, w: "w-40" },
  { mine: false, w: "w-56" },
  { mine: true, w: "w-48" },
  { mine: false, w: "w-32" },
  { mine: true, w: "w-60" },
  { mine: true, w: "w-28" },
];

/** Conversation-shaped placeholder for the right pane. */
export function ChatPaneSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col" aria-hidden>
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-black/5 px-4">
        <Bone className="h-11 w-11" />
        <div className="space-y-2">
          <Bone className="h-3.5 w-36" />
          <Bone className="h-3 w-24" />
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-hidden bg-[#f6f7f0] px-5 py-6">
        {BUBBLES.map((b, i) => (
          <div key={i} className={cn("flex items-end gap-2", b.mine ? "justify-end" : "justify-start")}>
            {!b.mine ? <Bone className="h-8 w-8 shrink-0" /> : null}
            <div
              className={cn(
                "h-9 animate-pulse rounded-2xl",
                b.w,
                b.mine
                  ? "bg-[var(--venue-primary,#818a40)]/25"
                  : "bg-white shadow-sm",
              )}
            />
          </div>
        ))}
      </div>
      <div className="border-t border-black/5 bg-white px-3 py-3">
        <Bone className="h-11 w-full rounded-3xl" />
      </div>
    </div>
  );
}

/** Whole-messenger placeholder (first load of Connecteam). */
export function ChatShellSkeleton() {
  return (
    <div
      className="grid h-full min-h-[520px] w-full overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm md:grid-cols-[20rem_1fr]"
      style={{ zoom: 0.9 }}
      aria-busy
      aria-label="Loading Connecteam"
    >
      <aside className="hidden min-h-0 flex-col border-r border-black/5 md:flex">
        <div className="space-y-3 border-b border-black/5 px-4 py-4">
          <Bone className="h-9 w-full" />
          <Bone className="h-9 w-full" />
        </div>
        <div className="space-y-1 p-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-2.5 py-2.5">
              <Bone className="h-11 w-11 shrink-0" />
              <div className="flex-1 space-y-2">
                <Bone className={cn("h-3.5", i % 3 === 0 ? "w-28" : i % 3 === 1 ? "w-36" : "w-24")} />
                <Bone className={cn("h-3", i % 2 === 0 ? "w-44" : "w-32")} />
              </div>
            </div>
          ))}
        </div>
      </aside>
      <section className="flex min-h-0 min-w-0">
        <ChatPaneSkeleton />
      </section>
    </div>
  );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-black/5 bg-white p-4 shadow-sm", className)}>
      {children}
    </div>
  );
}

/** Feed-shaped placeholder for the right pane (sits on the feed backdrop). */
export function FeedPaneSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col" aria-hidden>
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-white/60 bg-[#fbfaf6] px-4">
        <Bone className="h-11 w-11" />
        <div className="space-y-2">
          <Bone className="h-3.5 w-32" />
          <Bone className="h-3 w-24" />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden border-l border-white/70">
        <div className="mx-auto grid max-w-[1040px] gap-5 p-4 xl:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-4">
            <Card>
              <div className="flex items-center gap-3">
                <Bone className="h-11 w-11 shrink-0" />
                <Bone className="h-11 flex-1 rounded-2xl" />
              </div>
              <div className="mt-4 flex gap-3">
                <Bone className="h-7 w-20" />
                <Bone className="h-7 w-16" />
              </div>
            </Card>
            {[0, 1].map((i) => (
              <Card key={i}>
                <div className="flex items-center gap-3">
                  <Bone className="h-11 w-11 shrink-0" />
                  <div className="space-y-2">
                    <Bone className="h-3.5 w-40" />
                    <Bone className="h-3 w-16" />
                  </div>
                </div>
                <Bone className="mt-4 h-20 w-full rounded-2xl" />
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <Bone className="h-8" />
                  <Bone className="h-8" />
                </div>
              </Card>
            ))}
          </div>
          <div className="hidden xl:block">
            <Card className="space-y-3">
              <Bone className="h-4 w-28" />
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Bone className="h-9 w-9 shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Bone className="h-3 w-28" />
                    <Bone className="h-2.5 w-20" />
                  </div>
                </div>
              ))}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Whole-messenger placeholder for the Feed: backdrop + glass list + feed. */
export function FeedShellSkeleton() {
  return (
    <div
      className="feed-backdrop grid h-full min-h-[520px] w-full overflow-hidden rounded-2xl border border-black/5 shadow-sm md:grid-cols-[20rem_1fr]"
      style={{ zoom: 0.9 }}
      aria-busy
      aria-label="Loading feed"
    >
      <aside className="liquid-glass hidden min-h-0 flex-col md:flex">
        <div className="flex h-16 shrink-0 items-center border-b border-white/60 bg-[#fbfaf6] px-4">
          <Bone className="h-9 w-full bg-white/60" />
        </div>
        <div className="space-y-1 p-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-2.5 py-2">
              <Bone className="h-11 w-11 shrink-0 bg-white/60" />
              <div className="flex-1 space-y-2">
                <Bone className={cn("h-3.5 bg-white/60", i % 2 === 0 ? "w-32" : "w-24")} />
                <Bone className="h-3 w-20 bg-white/50" />
              </div>
            </div>
          ))}
        </div>
      </aside>
      <section className="flex min-h-0 min-w-0">
        <FeedPaneSkeleton />
      </section>
    </div>
  );
}

/**
 * Full-screen "opening chat" state for phones: the chat wallpaper behind a
 * header and composer placeholder. Keep the chat surface plain while the
 * conversation opens so it does not flash a differently-scaled wallpaper.
 */
export function ChatOpeningLoader({ label = "Opening chat…" }: { label?: string }) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-white" aria-busy aria-label={label}>
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-black/5 px-4">
        <Bone className="h-6 w-6" />
        <Bone className="h-11 w-11" />
        <div className="space-y-2">
          <Bone className="h-3.5 w-32" />
          <Bone className="h-3 w-20" />
        </div>
      </div>
      {/* Plain chat background colour: no pattern while loading. */}
      <div className="chat-wallpaper relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        <div className="relative flex flex-col items-center gap-3">
          <span className="relative flex h-12 w-12 items-center justify-center">
            <svg
              viewBox="0 0 48 48"
              className="absolute inset-0 h-full w-full animate-spin text-[var(--venue-primary,#818a40)] [animation-duration:1.1s]"
              aria-hidden
            >
              <circle cx="24" cy="24" r="21" fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="3" />
              <circle
                cx="24"
                cy="24"
                r="21"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                className="chat-loader-arc"
              />
            </svg>
          </span>
          <p className="rounded-full bg-white/85 px-3 py-1 text-xs font-medium text-[#3D421F] shadow-sm backdrop-blur">
            {label}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1.5 border-t border-black/[0.06] bg-[#F7F7F5] px-2 py-1.5">
        <Bone className="h-9 w-9" />
        <Bone className="h-9 flex-1 rounded-[20px] bg-white" />
        <Bone className="h-9 w-9" />
      </div>
    </div>
  );
}
