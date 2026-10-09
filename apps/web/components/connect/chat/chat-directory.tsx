"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, MessageCircle, Search } from "lucide-react";
import { ConnectAvatar } from "@/components/connect/connect-avatar";
import { ScopedLink } from "@/components/layout/scoped-link";
import { useVenueScope } from "@/components/providers/venue-scope-provider";
import { toast } from "@/components/ui/toast";
import { startDirectChat } from "@/lib/actions/connect-chat";
import type { ConnectPerson } from "@/lib/connect/types";
import { toScopedHref } from "@/lib/venue/scope-routing";

/** Everyone on the Hub at this venue — tap the message icon to start a 1:1 chat. */
export function ChatDirectory({
  people,
  venueName,
}: {
  people: ConnectPerson[];
  venueName: string;
}) {
  const router = useRouter();
  const { scope, slug } = useVenueScope();
  const [pending, startTransition] = useTransition();
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const shown = q
    ? people.filter((p) =>
        [p.name, p.positionName, p.departmentName]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(q)),
      )
    : people;

  function message(userId: string) {
    setOpeningId(userId);
    startTransition(async () => {
      const result = await startDirectChat(userId);
      if (!result.ok) {
        toast.error(result.error);
        setOpeningId(null);
        return;
      }
      router.push(toScopedHref(`/connect/chats/${result.id}`, scope, slug));
      router.refresh();
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-black/5 px-4 py-3">
        <ScopedLink
          href="/connect/chats"
          className="rounded-full p-1.5 text-black/55 hover:bg-black/5 md:hidden"
          aria-label="Back to chats"
        >
          <ArrowLeft className="h-5 w-5" />
        </ScopedLink>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold text-[#2B2F16]">{venueName} Directory</h2>
          <p className="text-xs text-black/50">
            {people.length} {people.length === 1 ? "person" : "people"} you can message
          </p>
        </div>
        <label className="flex w-full max-w-[16rem] items-center gap-2 rounded-full bg-[#F0F2E8] px-3 py-2">
          <Search className="h-4 w-4 text-black/40" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or position"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-black/40"
          />
        </label>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto bg-[#F7F8F2] p-4">
        {shown.length === 0 ? (
          <p className="py-10 text-center text-sm text-black/50">Nobody found.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {shown.map((p) => (
              <li
                key={p.userId}
                className="flex items-center gap-3 rounded-2xl border border-black/5 bg-white px-3 py-2.5 shadow-sm"
              >
                <ConnectAvatar name={p.name} photoUrl={p.photoUrl} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[#2B2F16]">{p.name}</p>
                  <p className="truncate text-xs text-black/55">
                    {p.positionName ?? p.departmentName ?? "—"}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => message(p.userId)}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--venue-primary,#818a40)] text-white shadow-sm hover:opacity-90 disabled:opacity-50"
                  aria-label={`Message ${p.name}`}
                  title={`Message ${p.name}`}
                >
                  <MessageCircle className={openingId === p.userId ? "h-4 w-4 animate-pulse" : "h-4 w-4"} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
