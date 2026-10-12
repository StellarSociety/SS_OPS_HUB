"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Search } from "lucide-react";
import { PersonInfoCard, PersonTile, PersonTileGrid } from "@/components/connect/person-tile";
import { PresenceAvatar } from "@/components/connect/presence";
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
  const [infoId, setInfoId] = useState<string | null>(null);
  const infoPerson = infoId ? (people.find((p) => p.userId === infoId) ?? null) : null;

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
          <PersonTileGrid>
            {shown.map((p) => (
              <PersonTile
                key={p.userId}
                person={p}
                avatar={<PresenceAvatar userId={p.userId} name={p.name} photoUrl={p.photoUrl} size="lg" className="h-[72px] w-[72px] text-lg" />}
                opening={openingId === p.userId}
                disabled={pending}
                onInfo={() => setInfoId(p.userId)}
                onMessage={() => message(p.userId)}
              />
            ))}
          </PersonTileGrid>
        )}
      </div>
      {infoPerson ? (
        <PersonInfoCard
          person={infoPerson}
          avatar={<PresenceAvatar userId={infoPerson.userId} name={infoPerson.name} photoUrl={infoPerson.photoUrl} size="lg" className="h-24 w-24 text-2xl" />}
          opening={openingId === infoPerson.userId}
          onMessage={() => message(infoPerson.userId)}
          onClose={() => setInfoId(null)}
        />
      ) : null}
    </div>
  );
}
