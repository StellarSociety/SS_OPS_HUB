"use client";

import { Archive, ArchiveRestore, Columns2, MailOpen } from "lucide-react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export type ChatMenuState = {
  x: number;
  y: number;
  conversationId: string;
  archived: boolean;
} | null;

/** Right-click menu for a chat in a list: open it side by side, archive or restore it. */
export function ChatContextMenu({
  menu,
  onClose,
  onArchive,
  onOpenSide,
  onMarkUnread,
}: {
  menu: ChatMenuState;
  onClose: () => void;
  onArchive: (conversationId: string, archived: boolean) => void;
  /** When set, offers marking the chat unread again. */
  onMarkUnread?: (conversationId: string) => void;
  /** When set, offers opening the chat in another window next to the current one. */
  onOpenSide?: (conversationId: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => {
      if (e instanceof MouseEvent && ref.current?.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu, onClose]);

  if (!menu || typeof document === "undefined") return null;

  // Keep the menu on screen near the cursor.
  const left = Math.min(menu.x, window.innerWidth - 190);
  const items = 1 + (onOpenSide ? 1 : 0) + (onMarkUnread ? 1 : 0);
  const top = Math.min(menu.y, window.innerHeight - (items * 40 + 20));

  return createPortal(
    <div
      ref={ref}
      role="menu"
      className="fixed z-[300] w-44 overflow-hidden rounded-lg border border-black/10 bg-white py-1 shadow-lg"
      style={{ left, top }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {onOpenSide ? (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onOpenSide(menu.conversationId);
            onClose();
          }}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[#2B2F16] hover:bg-[var(--venue-primary,#818a40)] hover:text-white"
        >
          <Columns2 className="h-4 w-4" />
          Open side by side
        </button>
      ) : null}
      {onMarkUnread ? (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onMarkUnread(menu.conversationId);
            onClose();
          }}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[#2B2F16] hover:bg-[var(--venue-primary,#818a40)] hover:text-white"
        >
          <MailOpen className="h-4 w-4" />
          Mark as unread
        </button>
      ) : null}
      <button
        type="button"
        role="menuitem"
        autoFocus={!onOpenSide && !onMarkUnread}
        onClick={() => {
          onArchive(menu.conversationId, !menu.archived);
          onClose();
        }}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[#2B2F16] hover:bg-[var(--venue-primary,#818a40)] hover:text-white"
      >
        {menu.archived ? (
          <ArchiveRestore className="h-4 w-4" />
        ) : (
          <Archive className="h-4 w-4" />
        )}
        {menu.archived ? "Unarchive chat" : "Archive chat"}
      </button>
    </div>,
    document.body,
  );
}
