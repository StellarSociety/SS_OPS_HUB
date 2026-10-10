"use client";

import { ChevronLeft } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode, type TouchEvent } from "react";
import { cn } from "@/lib/utils";

/** A drag must start this close to the left edge of the screen. */
const EDGE_PX = 24;
/** Drag at least this far right to go back. */
const TRIGGER_PX = 90;

// Set while an edge swipe is in progress, so row / message swipes stand down.
let edgeGestureActive = false;
export function isEdgeSwipeActive(): boolean {
  return edgeGestureActive;
}

/**
 * Swipe from the left edge to the right to go back, like iOS. Works with
 * touch, and with a mouse drag for the desktop simulator. A back arrow follows
 * the finger and fills once releasing would go back.
 */
export function EdgeSwipeBack({
  onBack,
  disabled = false,
  className,
  children,
}: {
  onBack: () => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number; horizontal: boolean | null } | null>(null);
  const [dx, setDx] = useState(0);
  const [y, setY] = useState(0);

  function begin(clientX: number, clientY: number): boolean {
    if (disabled) return false;
    const rect = ref.current?.getBoundingClientRect();
    if (!rect || clientX - rect.left > EDGE_PX) return false;
    start.current = { x: clientX, y: clientY, horizontal: null };
    edgeGestureActive = true;
    setY(clientY - rect.top);
    return true;
  }

  function move(clientX: number, clientY: number) {
    const s = start.current;
    if (!s) return;
    const x = clientX - s.x;
    const yy = clientY - s.y;
    if (s.horizontal === null && (Math.abs(x) > 8 || Math.abs(yy) > 8)) {
      s.horizontal = Math.abs(x) > Math.abs(yy);
      if (!s.horizontal) {
        end(false);
        return;
      }
    }
    if (s.horizontal) setDx(Math.max(0, Math.min(x, TRIGGER_PX * 1.6)));
  }

  function end(commit: boolean) {
    const go = commit && start.current?.horizontal && dxRef.current >= TRIGGER_PX;
    start.current = null;
    edgeGestureActive = false;
    setDx(0);
    if (go) onBack();
  }

  // Latest offset for `end`, which can run from a window listener.
  const dxRef = useRef(0);
  useEffect(() => {
    dxRef.current = dx;
  }, [dx]);

  // Mouse drags (desktop simulator) continue outside the element.
  const [mouseDragging, setMouseDragging] = useState(false);
  useEffect(() => {
    if (!mouseDragging) return;
    const onMove = (e: MouseEvent) => move(e.clientX, e.clientY);
    const onUp = () => {
      setMouseDragging(false);
      end(true);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  });

  const progress = Math.min(1, dx / TRIGGER_PX);

  return (
    <div
      ref={ref}
      className={cn("relative", className)}
      onTouchStartCapture={(e: TouchEvent) => {
        const t = e.touches[0];
        if (t && e.touches.length === 1) begin(t.clientX, t.clientY);
      }}
      onTouchMoveCapture={(e: TouchEvent) => {
        const t = e.touches[0];
        if (t) move(t.clientX, t.clientY);
      }}
      onTouchEndCapture={() => end(true)}
      onTouchCancelCapture={() => end(false)}
      onMouseDownCapture={(e) => {
        if (e.button === 0 && begin(e.clientX, e.clientY)) setMouseDragging(true);
      }}
    >
      {children}
      {dx > 0 ? (
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute left-0 z-[60] flex h-10 w-10 items-center justify-center rounded-full shadow-lg transition-colors",
            progress >= 1 ? "bg-[var(--venue-primary,#818a40)] text-white" : "bg-white text-[#3D421F]",
          )}
          style={{
            top: y,
            transform: `translate(${Math.min(dx, TRIGGER_PX) * 0.6 - 20}px, -50%)`,
            opacity: 0.4 + progress * 0.6,
          }}
        >
          <ChevronLeft className="h-5 w-5" />
        </span>
      ) : null}
    </div>
  );
}
