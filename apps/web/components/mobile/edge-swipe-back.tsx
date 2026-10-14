"use client";

import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "framer-motion";
import { useEffect, useRef, useState, type ReactNode, type TouchEvent } from "react";
import { cn } from "@/lib/utils";

/** A drag must start this close to the left edge of the screen. */
const EDGE_PX = 24;
/** Movement before we decide the drag is horizontal (hysteresis). */
const DECIDE_PX = 8;
/** A flick this fast (px/s) goes back even from a short drag. */
const FLICK_VELOCITY = 500;
/** If nothing navigates within this time, slide the page back in. */
const NAV_FALLBACK_MS = 900;
/** The screen underneath starts this far left and slides in with the page (iOS parallax). */
const UNDER_PARALLAX = 0.3;
/** Previous screens kept for the swipe (oldest dropped first). */
const MAX_SNAPSHOTS = 8;

/** Critically damped, iOS-like: settles without bouncing. */
const SPRING = { type: "spring", bounce: 0, duration: 0.35 } as const;

// Set while an edge swipe is in progress, so row / message swipes stand down.
let edgeGestureActive = false;
export function isEdgeSwipeActive(): boolean {
  return edgeGestureActive;
}

/** Apple's momentum projection: where a release at this speed would come to rest. */
function project(velocity: number, decelerationRate = 0.998) {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/** Past the limit the page follows less and less, like iOS at an edge. */
function rubberband(distance: number, dimension: number, constant = 0.55) {
  return (distance * dimension * constant) / (dimension + constant * distance);
}

function solidBackground(from: HTMLElement | null): string {
  for (let element = from; element; element = element.parentElement) {
    const color = getComputedStyle(element).backgroundColor;
    if (color && color !== "transparent" && !/rgba\(.*,\s*0\)$/.test(color)) return color;
  }
  return "#fff";
}

type Sample = { x: number; t: number };

/** A frozen copy of a screen as it looked when the user left it. */
type Snapshot = {
  key: string;
  node: HTMLElement | null;
  /** [element index, scrollTop] for scrolled elements, restored on the copy. */
  scrolls: [number, number][];
};

/**
 * Swipe from the left edge to go back, like iOS: the page follows the finger
 * 1:1 and uncovers the previous screen, which slides in from slightly left.
 * Release speed counts — a quick flick goes back from a short drag. Works with
 * touch, and with a mouse drag in the desktop simulator.
 *
 * The previous screen is no longer rendered once you leave it, so a copy of
 * each screen is kept from the tap that left it. With no copy (e.g. right
 * after a reload) the page only rubber-bands and nothing navigates.
 *
 * `resetKey` should change once the previous screen is showing (pathname, or
 * the simulator's page id) so the page snaps back into place only then.
 */
export function EdgeSwipeBack({
  onBack,
  disabled = false,
  resetKey = "",
  className,
  children,
}: {
  onBack: () => void;
  disabled?: boolean;
  resetKey?: string;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const underRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const x = useMotionValue(0);
  const width = useRef(1);
  const start = useRef<{ x: number; y: number; horizontal: boolean | null } | null>(null);
  const samples = useRef<Sample[]>([]);
  const leaving = useRef(false);
  const canGoBack = useRef(false);
  const fallback = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snapshots = useRef<Snapshot[]>([]);
  const latest = useRef<Snapshot | null>(null);
  const shownKey = useRef(resetKey);
  const [active, setActive] = useState(false);

  // The screen underneath dims less as the page uncovers it; the page's edge shadow fades too.
  const dim = useTransform(x, (value) => 0.18 * (1 - value / width.current));
  const underX = useTransform(x, (value) => (value - width.current) * UNDER_PARALLAX);
  const shadow = useTransform(x, (value) =>
    value > 0
      ? `-10px 0 28px rgba(0,0,0,${(0.22 * (1 - value / width.current)).toFixed(3)})`
      : "none",
  );

  /** Copy this screen as it looks now, in case the tap leaves it. */
  function capture() {
    const page = pageRef.current;
    if (!page) return;
    const scrolls: [number, number][] = [];
    page.querySelectorAll<HTMLElement>("*").forEach((element, index) => {
      if (element.scrollTop > 0) scrolls.push([index, element.scrollTop]);
    });
    const node = page.cloneNode(true) as HTMLElement;
    node.style.transform = "";
    node.style.boxShadow = "";
    node.style.willChange = "";
    node.style.backgroundColor = "";
    latest.current = { key: shownKey.current, node, scrolls };
  }

  // A new screen is showing: remember the one we left, or drop it when we came back to it.
  useEffect(() => {
    if (fallback.current) clearTimeout(fallback.current);
    fallback.current = null;
    leaving.current = false;
    x.jump(0);
    underRef.current?.replaceChildren();
    if (pageRef.current) pageRef.current.style.backgroundColor = "";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset after navigation
    setActive(false);

    const left = shownKey.current;
    if (left === resetKey) return;
    shownKey.current = resetKey;
    const stack = snapshots.current;
    if (stack.at(-1)?.key === resetKey) {
      stack.pop();
    } else {
      stack.push(
        latest.current?.key === left ? latest.current : { key: left, node: null, scrolls: [] },
      );
      if (stack.length > MAX_SNAPSHOTS) stack.shift();
    }
    latest.current = null;
  }, [resetKey, x]);

  useEffect(
    () => () => {
      if (fallback.current) clearTimeout(fallback.current);
    },
    [],
  );

  /** Put the previous screen's copy underneath the page. */
  function mountPrevious(): boolean {
    const previous = snapshots.current.at(-1);
    const under = underRef.current;
    const page = pageRef.current;
    if (!previous?.node || !under || !page) return false;
    // Both layers need the app's solid background, or they show through each other.
    const background = solidBackground(ref.current);
    under.style.backgroundColor = background;
    page.style.backgroundColor = background;
    if (under.firstChild !== previous.node) {
      under.replaceChildren(previous.node);
      const elements = previous.node.querySelectorAll<HTMLElement>("*");
      for (const [index, top] of previous.scrolls) {
        const element = elements[index];
        if (element) element.scrollTop = top;
      }
    }
    return true;
  }

  function begin(clientX: number, clientY: number): boolean {
    if (disabled || leaving.current) return false;
    const rect = ref.current?.getBoundingClientRect();
    if (!rect || clientX - rect.left > EDGE_PX) return false;
    width.current = Math.max(1, rect.width);
    start.current = { x: clientX, y: clientY, horizontal: null };
    samples.current = [{ x: 0, t: performance.now() }];
    canGoBack.current = mountPrevious();
    // Grab mid-flight: carry on from where the page is now.
    x.stop();
    edgeGestureActive = true;
    return true;
  }

  function move(clientX: number, clientY: number) {
    const s = start.current;
    if (!s) return;
    const dx = clientX - s.x;
    const dy = clientY - s.y;
    if (s.horizontal === null) {
      if (Math.abs(dx) < DECIDE_PX && Math.abs(dy) < DECIDE_PX) return;
      s.horizontal = Math.abs(dx) > Math.abs(dy);
      if (!s.horizontal) {
        cancel();
        return;
      }
      setActive(true);
    }
    const travel = Math.max(0, Math.min(dx, width.current));
    // Nothing to uncover: resist instead of showing an empty screen.
    const next = canGoBack.current ? travel : rubberband(travel, width.current * 0.25);
    x.set(next);
    const now = performance.now();
    samples.current.push({ x: next, t: now });
    // Keep ~100ms of history for the release velocity.
    while (samples.current.length > 2 && now - samples.current[0]!.t > 100) {
      samples.current.shift();
    }
  }

  function releaseVelocity(): number {
    const list = samples.current;
    if (list.length < 2) return 0;
    const first = list[0]!;
    const last = list[list.length - 1]!;
    const dt = (last.t - first.t) / 1000;
    return dt > 0 ? (last.x - first.x) / dt : 0;
  }

  function settle() {
    setActive(false);
    if (pageRef.current) pageRef.current.style.backgroundColor = "";
  }

  function cancel() {
    start.current = null;
    edgeGestureActive = false;
    animate(x, 0, { ...SPRING, onComplete: settle });
  }

  function end() {
    const s = start.current;
    start.current = null;
    edgeGestureActive = false;
    if (!s?.horizontal) {
      settle();
      return;
    }
    const velocity = releaseVelocity();
    const current = x.get();
    // Moving back towards the edge cancels, whatever the position.
    const goBack =
      canGoBack.current &&
      velocity > -50 &&
      (velocity > FLICK_VELOCITY ||
        current + project(velocity) > width.current / 2);

    if (!goBack) {
      animate(x, 0, { ...SPRING, velocity, onComplete: settle });
      return;
    }

    leaving.current = true;
    const navigate = () => {
      onBack();
      // Nothing navigated: slide the page back in.
      fallback.current = setTimeout(() => {
        leaving.current = false;
        animate(x, 0, { ...SPRING, onComplete: settle });
      }, NAV_FALLBACK_MS);
    };
    if (reduceMotion) {
      navigate();
      return;
    }
    animate(x, width.current, {
      ...SPRING,
      velocity: Math.max(velocity, 0),
      onComplete: navigate,
    });
  }

  // Mouse drags (desktop simulator) continue outside the element.
  const [mouseDragging, setMouseDragging] = useState(false);
  useEffect(() => {
    if (!mouseDragging) return;
    const onMove = (e: MouseEvent) => move(e.clientX, e.clientY);
    const onUp = () => {
      setMouseDragging(false);
      end();
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  });

  return (
    <div
      ref={ref}
      className={cn("relative overflow-hidden", className)}
      onClickCapture={() => {
        if (!start.current) capture();
      }}
      onTouchStartCapture={(e: TouchEvent) => {
        const t = e.touches[0];
        if (t && e.touches.length === 1) begin(t.clientX, t.clientY);
      }}
      onTouchMoveCapture={(e: TouchEvent) => {
        const t = e.touches[0];
        if (t) move(t.clientX, t.clientY);
      }}
      onTouchEndCapture={() => end()}
      onTouchCancelCapture={() => cancel()}
      onMouseDownCapture={(e) => {
        if (e.button === 0 && begin(e.clientX, e.clientY)) setMouseDragging(true);
      }}
    >
      <motion.div
        ref={underRef}
        aria-hidden
        inert
        className="pointer-events-none absolute inset-0 overflow-hidden"
        style={{ x: underX, visibility: active ? "visible" : "hidden" }}
      />
      {active ? (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-black"
          style={{ opacity: dim }}
        />
      ) : null}
      <motion.div
        ref={pageRef}
        className="relative h-full min-h-0"
        style={{ x, boxShadow: shadow, willChange: active ? "transform" : undefined }}
      >
        {children}
      </motion.div>
    </div>
  );
}
