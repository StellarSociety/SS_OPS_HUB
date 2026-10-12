"use client";

import { useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, MessageCircle, Search, Users, UsersRound, X } from "lucide-react";
import { ChatModal } from "@/components/connect/chat/chat-modal";
import { GroupChatForm } from "@/components/connect/chat/group-chat-form";
import { SwipeRow } from "@/components/connect/chat/swipe-row";
import { ConnectAvatar } from "@/components/connect/connect-avatar";
import { PersonInfoCard, PersonTile, PersonTileGrid } from "@/components/connect/person-tile";
import { toast } from "@/components/ui/toast";
import { markChatUnread, setChatArchived, startDirectChat } from "@/lib/actions/connect-chat";
import { MobileTabBar } from "@/components/mobile/mobile-tab-bar";
import { ModuleIcon } from "@/components/modules/module-icon";
import { chatPreviewText, type ChatSummary } from "@/lib/connect/chat-types";
import { formatPostTime } from "@/lib/connect/format";
import type { ConnectGroup, ConnectPerson } from "@/lib/connect/types";
import { mobileConnectConversationHref } from "@/lib/mobile/app-path";
import type { MobileTabItem } from "@/lib/mobile/tab-bars";
import type { Venue } from "@/lib/types/database";
import { cn } from "@/lib/utils";

/** All / Direct / Groups sit in the segmented control; Archived and Directory are icon modes beside it. */
type ChatFilter = "all" | "direct" | "groups" | "archived" | "directory";

const SEGMENTS: Array<{ id: ChatFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "direct", label: "Direct" },
  { id: "groups", label: "Groups" },
];

/** iOS-like critically damped ease for the sliding pill and the search reveal. */
const EASE = "ease-[cubic-bezier(0.25,1,0.5,1)]";

export function MobileConnectScreen({ venue, chats: initialChats, meId, people = [], onSelectTab, onOpenChat, readOnly = false, canCreateGroups = false }: {
  /** Admins / moderators: show "New group chat" in the header. */
  canCreateGroups?: boolean;
  /** Simulator: open the chat in-frame instead of navigating. */
  onOpenChat?: (conversationId: string) => void;
  /** Previewing another employee: no archive / unread swipes. */
  readOnly?: boolean;
  venue: Venue;
  chats: ChatSummary[];
  groups: ConnectGroup[];
  meId: string;
  /** Everyone on the Hub at this venue, for the directory. */
  people?: ConnectPerson[];
  onSelectTab?: (tab: MobileTabItem) => void;
}) {
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  // Local copy so swipes (unread / archive) update the list straight away.
  const [chats, setChats] = useState(initialChats);
  const [synced, setSynced] = useState(initialChats);
  if (synced !== initialChats) {
    setSynced(initialChats);
    setChats(initialChats);
  }

  async function archive(chat: ChatSummary) {
    const archived = !chat.archived;
    setChats((prev) => prev.map((c) => (c.id === chat.id ? { ...c, archived } : c)));
    const result = await setChatArchived(chat.id, archived);
    if (!result.ok) {
      setChats((prev) => prev.map((c) => (c.id === chat.id ? { ...c, archived: !archived } : c)));
      toast.error(result.error);
      return;
    }
    toast.saved(archived ? "Chat archived." : "Chat moved back to your chats.");
  }

  async function markUnread(chat: ChatSummary) {
    const result = await markChatUnread(chat.id);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setChats((prev) =>
      prev.map((c) => (c.id === chat.id ? { ...c, unreadCount: Math.max(1, c.unreadCount) } : c)),
    );
  }

  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ChatFilter>("all");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const [opening, startOpening] = useTransition();
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [infoId, setInfoId] = useState<string | null>(null);
  const infoPerson = infoId ? (people.find((p) => p.userId === infoId) ?? null) : null;
  const unread = chats.reduce((sum, chat) => sum + chat.unreadCount, 0);
  const needle = query.trim().toLocaleLowerCase();
  const visibleChats = useMemo(() => {
    return chats.filter((chat) => {
      if (filter === "archived" ? !chat.archived : chat.archived) return false;
      if (filter === "direct" && chat.kind !== "direct") return false;
      if (filter === "groups" && chat.kind !== "group") return false;
      if (!needle) return true;
      return `${chat.title} ${chatPreviewText(chat, meId)}`.toLocaleLowerCase().includes(needle);
    });
  }, [chats, filter, meId, needle]);
  const directory = useMemo(
    () =>
      people
        .filter((person) => person.userId !== meId)
        .filter((person) =>
          !needle
            ? true
            : [person.name, person.positionName, person.departmentName]
                .filter(Boolean)
                .some((v) => v!.toLocaleLowerCase().includes(needle)),
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    [people, meId, needle],
  );
  // Faces on the directory button: people with photos first.
  const stackFaces = useMemo(
    () =>
      people
        .filter((person) => person.userId !== meId)
        .sort((a, b) => Number(Boolean(b.photoUrl)) - Number(Boolean(a.photoUrl)))
        .slice(0, 3),
    [people, meId],
  );
  const segmentIndex = SEGMENTS.findIndex((item) => item.id === filter);

  function toggleSearch() {
    if (searchOpen) {
      setSearchOpen(false);
      setQuery("");
      searchRef.current?.blur();
      return;
    }
    setSearchOpen(true);
    // Focus inside the tap so the phone keyboard opens with the field.
    searchRef.current?.focus({ preventScroll: true });
  }

  function toggleMode(mode: "archived" | "directory") {
    setFilter((current) => (current === mode ? "all" : mode));
  }

  function messagePerson(person: ConnectPerson) {
    if (readOnly) {
      toast.error("Preview only: you can't start chats as another employee.");
      return;
    }
    setOpeningId(person.userId);
    startOpening(async () => {
      const result = await startDirectChat(person.userId);
      if (!result.ok) {
        toast.error(result.error);
        setOpeningId(null);
        return;
      }
      setOpeningId(null);
      if (onOpenChat) onOpenChat(result.id);
      else router.push(mobileConnectConversationHref(venue.slug, result.id));
    });
  }

  return (
    <div className="mobile-app-canvas ios-plain relative flex h-full min-h-0 flex-col bg-[#F7F8F2]">
      <header className="shrink-0 border-b border-black/10 bg-white px-4 pb-3 pt-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--venue-secondary,#F0F3DD)]">
            <ModuleIcon iconKey="messages-square" className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h1 className="font-serif text-2xl font-semibold leading-tight text-[#3D421F]">Connecteam</h1>
            <p className="text-xs text-black/50">
              {unread ? `${unread} unread message${unread === 1 ? "" : "s"}` : "Messages and team feeds"}
            </p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-1.5">
          {/* Segmented control with a sliding selection pill. */}
          <div role="tablist" aria-label="Chat filter" className="relative grid min-w-0 flex-1 grid-cols-3 rounded-full bg-[#F0F2E8] p-[3px]">
            <span
              aria-hidden
              className={cn(
                "seg-pill pointer-events-none absolute bottom-[3px] left-[3px] top-[3px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.12),0_0_0_0.5px_rgba(0,0,0,0.04)] transition-[transform,opacity] duration-300 motion-reduce:transition-none",
                EASE,
                segmentIndex < 0 && "opacity-0",
              )}
              style={{
                width: "calc((100% - 6px) / 3)",
                transform: `translateX(${Math.max(0, segmentIndex) * 100}%)`,
              }}
            />
            {SEGMENTS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={filter === item.id}
                onClick={() => setFilter(item.id)}
                className={cn(
                  "relative z-10 h-8 rounded-full px-1 text-[13px] font-medium transition-colors active:opacity-60",
                  filter === item.id ? "text-[#3D421F]" : "text-black/50",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          <IconToggle label="Archived chats" active={filter === "archived"} onClick={() => toggleMode("archived")}>
            <Archive className="h-[17px] w-[17px]" strokeWidth={2} />
          </IconToggle>
          {canCreateGroups && !readOnly ? (
            <IconToggle label="New group chat" active={newGroupOpen} onClick={() => setNewGroupOpen(true)}>
              <span className="relative flex">
                <UsersRound className="h-[17px] w-[17px]" strokeWidth={2} />
                <span
                  aria-hidden
                  className="absolute -right-[5px] -top-[4px] flex h-[11px] w-[11px] items-center justify-center rounded-full bg-[var(--venue-primary,#818a40)] text-[10px] font-bold leading-none text-white ring-[1.5px] ring-[#F0F2E8]"
                >
                  +
                </span>
              </span>
            </IconToggle>
          ) : null}
          <IconToggle label="Directory" active={filter === "directory"} onClick={() => toggleMode("directory")} wide={stackFaces.length > 1}>
            {stackFaces.length > 0 ? (
              <span className="flex items-center -space-x-[7px]">
                {stackFaces.map((person) => (
                  <ConnectAvatar
                    key={person.userId}
                    name={person.name}
                    photoUrl={person.photoUrl}
                    className="h-[20px] w-[20px] text-[8px] ring-[1.5px]"
                  />
                ))}
              </span>
            ) : (
              <Users className="h-[17px] w-[17px]" strokeWidth={2} />
            )}
          </IconToggle>
          <IconToggle label={searchOpen ? "Close search" : "Search"} active={searchOpen} onClick={toggleSearch}>
            <Search className="h-[17px] w-[17px]" strokeWidth={2.2} />
          </IconToggle>
        </div>
        {/* Search drops in under the bar only when asked for. */}
        <div
          className={cn(
            "grid transition-[grid-template-rows,opacity,margin] duration-300 motion-reduce:transition-none",
            EASE,
            searchOpen ? "mt-2.5 grid-rows-[1fr] opacity-100" : "mt-0 grid-rows-[0fr] opacity-0",
          )}
          aria-hidden={!searchOpen}
        >
          <div className="overflow-hidden">
            <label className="flex h-9 items-center gap-2 rounded-[10px] bg-[#F0F2E8] px-2.5">
              <Search className="h-4 w-4 shrink-0 text-black/40" />
              <input
                ref={searchRef}
                type="search"
                value={query}
                tabIndex={searchOpen ? 0 : -1}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") toggleSearch();
                }}
                placeholder={filter === "directory" ? "Search people" : "Search chats"}
                className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-black/35 [&::-webkit-search-cancel-button]:hidden"
              />
              {query ? (
                <button type="button" aria-label="Clear search" onClick={() => setQuery("")} className="flex h-5 w-5 items-center justify-center rounded-full bg-black/25 text-white">
                  <X className="h-3 w-3" strokeWidth={3} />
                </button>
              ) : null}
            </label>
          </div>
        </div>
      </header>

      <main data-ptr-body="" className="min-h-0 flex-1 overflow-y-auto pb-28">
        {filter === "directory" ? (
          directory.length === 0 ? (
            <div className="px-6 py-14 text-center text-sm text-black/45">
              <Users className="mx-auto mb-2 h-8 w-8 opacity-40" />
              {needle ? "No one matches that search." : "No one else is on the Hub yet."}
            </div>
          ) : (
            <PersonTileGrid compact className="p-3">
              {directory.map((person) => (
                <PersonTile
                  key={person.userId}
                  person={person}
                  avatar={<ConnectAvatar name={person.name} photoUrl={person.photoUrl} className="h-[60px] w-[60px] text-base" />}
                  compact
                  opening={openingId === person.userId}
                  disabled={opening}
                  onInfo={() => setInfoId(person.userId)}
                  onMessage={() => messagePerson(person)}
                />
              ))}
            </PersonTileGrid>
          )
        ) : (
        <ul className="divide-y divide-black/5 bg-white">
          {visibleChats.length === 0 ? (
            <li className="px-6 py-14 text-center text-sm text-black/45">
              <MessageCircle className="mx-auto mb-2 h-8 w-8 opacity-40" />
              {filter === "archived" ? "No archived chats." : "No conversations found."}
            </li>
          ) : visibleChats.map((chat) => (
            <li key={chat.id}>
              <SwipeRow
                archived={chat.archived}
                onMarkUnread={chat.lastMessage && !readOnly ? () => void markUnread(chat) : undefined}
                onArchive={() => {
                  if (!readOnly) void archive(chat);
                }}
                className="bg-white"
              >
              <Link
                href={mobileConnectConversationHref(venue.slug, chat.id)}
                onClick={(e) => {
                  if (!onOpenChat) return;
                  e.preventDefault();
                  onOpenChat(chat.id);
                }}
                className="flex items-center gap-3 bg-white px-4 py-3"
              >
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
              </SwipeRow>
            </li>
          ))}
        </ul>
        )}
      </main>
      {infoPerson ? (
        <PersonInfoCard
          contained
          person={infoPerson}
          avatar={<ConnectAvatar name={infoPerson.name} photoUrl={infoPerson.photoUrl} className="h-20 w-20 text-xl" />}
          opening={openingId === infoPerson.userId}
          onMessage={() => messagePerson(infoPerson)}
          onClose={() => setInfoId(null)}
        />
      ) : null}
      <MobileTabBar app="connect" activeId="chats" venueSlug={venue.slug} onSelectTab={onSelectTab} />
      {newGroupOpen ? (
        <ChatModal title="New group chat" onClose={() => setNewGroupOpen(false)}>
          <GroupChatForm
            people={people.filter((person) => person.userId !== meId)}
            onDone={(id) => {
              setNewGroupOpen(false);
              if (onOpenChat) onOpenChat(id);
              else router.push(mobileConnectConversationHref(venue.slug, id));
            }}
          />
        </ChatModal>
      ) : null}
    </div>
  );
}

/** Round icon button beside the segmented control; filled when its mode is on. */
function IconToggle({
  label,
  active,
  onClick,
  wide = false,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex h-[38px] shrink-0 items-center justify-center rounded-full transition-[background-color,color,transform] duration-200 active:scale-[0.92] motion-reduce:transition-none",
        wide ? "min-w-[38px] px-2" : "w-[38px]",
        active
          ? "bg-[var(--venue-primary,#818a40)] text-white"
          : "bg-[#F0F2E8] text-[#3D421F]",
      )}
    >
      {children}
    </button>
  );
}
