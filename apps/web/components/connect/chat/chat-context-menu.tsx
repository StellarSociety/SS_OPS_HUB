"use client";

import { Archive, ArchiveRestore } from "lucide-react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export type ChatMenuState = {
  x: number;
  y: number;
  conversationId: string;
  archived: boolean;
} | null;

/** Right-click menu for a chat in a list: archive or restore it. */
export function ChatContextMenu({
  menu,
  onClose,
  onArchive,
}: {
  menu: ChatMenuState;
  onClose: () => void;
  onArchive: (conversationId: string, archived: boolean) => void;
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
  const top = Math.min(menu.y, window.innerHeight - 60);

  return createPortal(
    <div
      ref={ref}
      role="menu"
      className="fixed z-[300] w-44 overflow-hidden rounded-lg border border-black/10 bg-white py-1 shadow-lg"
      style={{ left, top }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button
        type="button"
        role="menuitem"
        autoFocus
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
