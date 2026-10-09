"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { MessageCircle, Search, Users } from "lucide-react";
import { ConnectAvatar } from "@/components/connect/connect-avatar";
import { MobileTabBar } from "@/components/mobile/mobile-tab-bar";
import { chatPreviewText, type ChatSummary } from "@/lib/connect/chat-types";
import { formatPostTime } from "@/lib/connect/format";
import type { ConnectGroup } from "@/lib/connect/types";
import { mobileConnectConversationHref } from "@/lib/mobile/app-path";
import type { MobileTabItem } from "@/lib/mobile/tab-bars";
import type { Venue } from "@/lib/types/database";

type ChatFilter = "all" | "direct" | "groups" | "archived";

const FILTERS: Array<{ id: ChatFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "direct", label: "Direct" },
  { id: "groups", label: "Groups" },
  { id: "archived", label: "Archived" },
];

export function MobileConnectScreen({ venue, chats, meId, onSelectTab }: {
  venue: Venue;
  chats: ChatSummary[];
  groups: ConnectGroup[];
  meId: string;
  onSelectTab?: (tab: MobileTabItem) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ChatFilter>("all");
  const unread = chats.reduce((sum, chat) => sum + chat.unreadCount, 0);
  const visibleChats = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return chats.filter((chat) => {
      if (filter === "archived" ? !chat.archived : chat.archived) return false;
      if (filter === "direct" && chat.kind !== "direct") return false;
      if (filter === "groups" && chat.kind !== "group") return false;
      if (!needle) return true;
      return `${chat.title} ${chatPreviewText(chat, meId)}`.toLocaleLowerCase().includes(needle);
    });
  }, [chats, filter, meId, query]);

  return (
    <div className="mobile-app-canvas relative flex h-full min-h-0 flex-col bg-[#F7F8F2]">
      <header className="shrink-0 border-b border-black/10 bg-white px-4 pb-3 pt-4">
        <h1 className="font-serif text-2xl font-semibold text-[#3D421F]">Connecteam</h1>
        <p className="text-xs text-black/50">
          {unread ? `${unread} unread message${unread === 1 ? "" : "s"}` : "Messages and team feeds"}
        </p>
        <label className="mt-3 flex h-10 items-center gap-2 rounded-xl border border-black/10 bg-[#F7F8F2] px-3 focus-within:border-[var(--venue-primary,#818a40)]">
          <Search className="h-4 w-4 shrink-0 text-black/40" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search chats" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-black/35" />
        </label>
        <div className="mt-3 grid grid-cols-4 gap-1 rounded-xl bg-[#F0F2E8] p-1">
          {FILTERS.map((item) => (
            <button key={item.id} type="button" onClick={() => setFilter(item.id)} className={`rounded-lg px-1 py-2 text-xs font-medium ${filter === item.id ? "bg-white text-[#3D421F] shadow-sm" : "text-black/50"}`}>
              {item.label}
            </button>
          ))}
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto pb-28">
        <ul className="divide-y divide-black/5 bg-white">
          {visibleChats.length === 0 ? (
            <li className="px-6 py-14 text-center text-sm text-black/45">
              <MessageCircle className="mx-auto mb-2 h-8 w-8 opacity-40" />
              No conversations found.
            </li>
          ) : visibleChats.map((chat) => (
            <li key={chat.id}>
              <Link href={mobileConnectConversationHref(venue.slug, chat.id)} className="flex items-center gap-3 px-4 py-3">
                {chat.kind === "direct" ? <ConnectAvatar name={chat.title} photoUrl={chat.photoUrl} /> : (
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white" style={{ backgroundColor: chat.color }}><Users className="h-5 w-5" /></span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={chat.unreadCount ? "truncate font-semibold text-[#2B2F16]" : "truncate font-medium text-[#2B2F16]"}>{chat.title}</span>
                    <time className="shrink-0 text-[11px] text-black/40">{formatPostTime(chat.activityAt)}</time>
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-black/50">{chatPreviewText(chat, meId)}</span>
                    {chat.unreadCount > 0 ? <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--venue-primary,#818a40)] px-1.5 text-[10px] font-semibold text-white">{chat.unreadCount}</span> : null}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
      <MobileTabBar app="connect" activeId="chats" venueSlug={venue.slug} onSelectTab={onSelectTab} />
    </div>
  );
}
