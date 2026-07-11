"use client";

import { useCallback, useState, type FocusEvent, type MouseEvent } from "react";
import { createPortal } from "react-dom";

type TriggerEvent =
  | MouseEvent<HTMLElement>
  | FocusEvent<HTMLElement>;

/**
 * Lightweight hover/focus tooltip for collapsed sidebar symbols.
 * Renders through a portal to `document.body` so it escapes the sidebar's
 * `overflow-hidden` clipping and floats to the right of the trigger.
 */
export function useNavTooltip(label: string, enabled: boolean) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  const show = useCallback(
    (event: TriggerEvent) => {
      if (!enabled) return;
      setRect(event.currentTarget.getBoundingClientRect());
    },
    [enabled],
  );

  const hide = useCallback(() => setRect(null), []);

  const triggerProps = {
    onMouseEnter: show,
    onMouseLeave: hide,
    onFocus: show,
    onBlur: hide,
  };

  const tooltip =
    enabled && rect && typeof document !== "undefined"
      ? createPortal(
          <span
            role="tooltip"
            style={{
              position: "fixed",
              top: rect.top + rect.height / 2,
              left: rect.right + 8,
              transform: "translateY(-50%)",
            }}
            className="pointer-events-none z-[100] whitespace-nowrap rounded-md bg-[#3D421F] px-2 py-1 text-xs font-medium text-white shadow-lg"
          >
            {label}
          </span>,
          document.body,
        )
      : null;

  return { triggerProps, tooltip };
}
