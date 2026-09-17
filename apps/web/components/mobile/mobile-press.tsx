"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { motion, type HTMLMotionProps } from "framer-motion";

/** Press-in used on compact mobile icons and controls. */
export const MOBILE_PRESS_SCALE = 0.86;

/** Gentle press-in for wide rows (profile hub, full-width cards). */
export const MOBILE_PRESS_SCALE_SOFT = 0.97;

export const MOBILE_PRESS_TRANSITION = {
  type: "spring" as const,
  stiffness: 640,
  damping: 22,
  mass: 0.5,
};

export const MOBILE_PRESS_TRANSITION_SOFT = {
  type: "spring" as const,
  stiffness: 500,
  damping: 32,
  mass: 0.5,
};

export const mobilePressTap = { scale: MOBILE_PRESS_SCALE };

const SHOW_DELAY_MS = 90;
const MOVE_CANCEL_PX = 10;
const TAP_FLASH_MS = 70;

export function useMobilePress() {
  const [pressed, setPressed] = useState(false);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const flashRef = useRef<number | null>(null);
  const trackingRef = useRef(false);
  const cancelledRef = useRef(false);
  const detachGuardsRef = useRef<(() => void) | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const clearFlash = useCallback(() => {
    if (flashRef.current != null) {
      window.clearTimeout(flashRef.current);
      flashRef.current = null;
    }
  }, []);

  const detachGuards = useCallback(() => {
    detachGuardsRef.current?.();
    detachGuardsRef.current = null;
  }, []);

  const cancelPress = useCallback(() => {
    cancelledRef.current = true;
    trackingRef.current = false;
    clearTimer();
    clearFlash();
    detachGuards();
    setPressed(false);
  }, [clearFlash, clearTimer, detachGuards]);

  const endPress = useCallback(() => {
    const shouldFlash = trackingRef.current && !cancelledRef.current;
    trackingRef.current = false;
    clearTimer();
    detachGuards();
    if (shouldFlash) {
      setPressed(true);
      clearFlash();
      flashRef.current = window.setTimeout(() => {
        setPressed(false);
        flashRef.current = null;
      }, TAP_FLASH_MS);
      return;
    }
    clearFlash();
    setPressed(false);
  }, [clearFlash, clearTimer, detachGuards]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent) => {
      if (event.button !== 0) return;
      trackingRef.current = true;
      cancelledRef.current = false;
      startXRef.current = event.clientX;
      startYRef.current = event.clientY;
      clearTimer();
      clearFlash();
      detachGuards();

      const onMove = (moveEvent: PointerEvent | TouchEvent) => {
        if (!trackingRef.current || cancelledRef.current) return;
        const point =
          "clientX" in moveEvent
            ? moveEvent
            : moveEvent.touches[0] ?? moveEvent.changedTouches[0];
        if (!point) return;
        const dx = point.clientX - startXRef.current;
        const dy = point.clientY - startYRef.current;
        if (dx * dx + dy * dy > MOVE_CANCEL_PX * MOVE_CANCEL_PX) {
          cancelPress();
        }
      };
      const onScroll = () => {
        if (trackingRef.current) cancelPress();
      };

      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("touchmove", onMove, { passive: true });
      document.addEventListener("scroll", onScroll, { capture: true, passive: true });
      window.addEventListener("scroll", onScroll, { capture: true, passive: true });
      window.addEventListener("pointercancel", cancelPress);
      detachGuardsRef.current = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("touchmove", onMove);
        document.removeEventListener("scroll", onScroll, true);
        window.removeEventListener("scroll", onScroll, true);
        window.removeEventListener("pointercancel", cancelPress);
      };

      timerRef.current = window.setTimeout(() => {
        if (trackingRef.current && !cancelledRef.current) {
          setPressed(true);
        }
      }, SHOW_DELAY_MS);
    },
    [cancelPress, clearFlash, clearTimer],
  );

  useEffect(
    () => () => {
      clearTimer();
      clearFlash();
      detachGuards();
    },
    [clearFlash, clearTimer, detachGuards],
  );

  return {
    pressed,
    pressProps: {
      onPointerDown,
      onPointerUp: endPress,
      onPointerCancel: endPress,
    },
  };
}

export function useMobilePressMotion(enabled = true) {
  const { pressed, pressProps } = useMobilePress();
  if (!enabled) {
    return { pressed: false, pressProps: {}, motionProps: {} };
  }
  return {
    pressed,
    pressProps,
    motionProps: {
      ...pressProps,
      animate: { scale: pressed ? MOBILE_PRESS_SCALE : 1 },
      transition: MOBILE_PRESS_TRANSITION,
    },
  };
}

type MobilePressTargetProps = {
  children: ReactNode;
  enabled?: boolean;
} & HTMLMotionProps<"button">;

export function MobilePressTarget({
  children,
  className,
  enabled = true,
  type = "button",
  ...rest
}: MobilePressTargetProps) {
  const { motionProps } = useMobilePressMotion(enabled);
  return (
    <motion.button type={type} className={className} {...rest} {...motionProps}>
      {children}
    </motion.button>
  );
}
