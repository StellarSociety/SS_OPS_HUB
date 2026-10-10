"use client";

import { Archive, ArchiveRestore, MailOpen } from "lucide-react";
import { useRef, useState, type ReactNode, type TouchEvent } from "react";
import { isEdgeSwipeActive } from "@/components/mobile/edge-swipe-back";
import { cn } from "@/lib/utils";

const THRESHOLD = 80;
const MAX = 120;

/**
 * Chat-list row with touch swipes: left → right marks unread, right → left
 * archives (or restores). Mouse users keep the right-click menu.
 */
export function SwipeRow({
  archived,
  onMarkUnread,
  onArchive,
  className,
  children,
}: {
  archived: boolean;
  onMarkUnread?: () => void;
  onArchive: () => void;
  className?: string;
  children: ReactNode;
}) {
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number; horizontal: boolean | null } | null>(null);
  const swiped = useRef(false);

  function onTouchStart(e: TouchEvent) {
    const t = e.touches[0];
    // A swipe from the screen edge means "back", not "mark unread".
    if (!t || e.touches.length > 1 || isEdgeSwipeActive()) return;
    start.current = { x: t.clientX, y: t.clientY, horizontal: null };
    swiped.current = false;
  }

  function onTouchMove(e: TouchEvent) {
    const s = start.current;
    const t = e.touches[0];
    if (!s || !t) return;
    const x = t.clientX - s.x;
    const y = t.clientY - s.y;
    if (s.horizontal === null && (Math.abs(x) > 8 || Math.abs(y) > 8)) {
      s.horizontal = Math.abs(x) > Math.abs(y);
    }
    if (!s.horizontal) return;
    if (x > 0 && !onMarkUnread) return;
    swiped.current = true;
    setDx(Math.max(-MAX, Math.min(MAX, x)));
  }

  function onTouchEnd() {
    if (dx >= THRESHOLD) onMarkUnread?.();
    if (dx <= -THRESHOLD) onArchive();
    setDx(0);
    start.current = null;
  }

  const ArchiveIcon = archived ? ArchiveRestore : Archive;

  return (
    <div className={cn("relative overflow-hidden", className)}>
      {dx !== 0 ? (
        <div
          aria-hidden
          className={cn(
            "absolute inset-0 flex items-center px-5 text-sm font-semibold text-white",
            dx > 0 ? "justify-start bg-sky-600" : "justify-end bg-[var(--venue-primary,#818a40)]",
          )}
        >
          {dx > 0 ? (
            <span className={cn("flex items-center gap-2 transition-transform", dx >= THRESHOLD && "scale-110")}>
              <MailOpen className="h-5 w-5" />
              Unread
            </span>
          ) : (
            <span className={cn("flex items-center gap-2 transition-transform", dx <= -THRESHOLD && "scale-110")}>
              {archived ? "Unarchive" : "Archive"}
              <ArchiveIcon className="h-5 w-5" />
            </span>
          )}
        </div>
      ) : null}
      <div
        className={cn("relative bg-inherit", dx === 0 && "transition-transform duration-200")}
        style={dx ? { transform: `translateX(${dx}px)` } : undefined}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={() => {
          setDx(0);
          start.current = null;
        }}
        onClickCapture={(e) => {
          // A swipe must not also open the chat.
          if (swiped.current) {
            e.preventDefault();
            e.stopPropagation();
            swiped.current = false;
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
