"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

const MENU_PAD = 8;

type RightClickMenuProps = {
  className?: string;
  menuClassName?: string;
  ariaLabel: string;
  children: ReactNode;
  renderMenu: (close: () => void) => ReactNode;
  /** Return false to keep the browser’s native menu (e.g. on text fields). */
  shouldHandle?: (event: MouseEvent) => boolean;
};

export function RightClickMenu({
  className,
  menuClassName,
  ariaLabel,
  children,
  renderMenu,
  shouldHandle,
}: RightClickMenuProps) {
  const [coords, setCoords] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setCoords(null), []);

  const onContextMenu = useCallback(
    (event: MouseEvent) => {
      if (shouldHandle && !shouldHandle(event)) return;
      event.preventDefault();
      event.stopPropagation();
      setCoords({ x: event.clientX, y: event.clientY });
    },
    [shouldHandle],
  );

  useLayoutEffect(() => {
    if (!coords || !menuRef.current) return;
    const el = menuRef.current;
    const { x, y } = coords;

    function clamp() {
      const rect = el.getBoundingClientRect();
      let left = x;
      let top = y;
      if (left + rect.width > window.innerWidth - MENU_PAD) {
        left = window.innerWidth - rect.width - MENU_PAD;
      }
      if (top + rect.height > window.innerHeight - MENU_PAD) {
        top = window.innerHeight - rect.height - MENU_PAD;
      }
      left = Math.max(MENU_PAD, left);
      top = Math.max(MENU_PAD, top);
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
    }

    clamp();
    const observer = new ResizeObserver(clamp);
    observer.observe(el);
    return () => observer.disconnect();
  }, [coords]);

  useEffect(() => {
    if (!coords) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", close);
    };
  }, [coords, close]);

  useEffect(() => {
    if (!coords) return;
    const first = menuRef.current?.querySelector<HTMLElement>("[role=menuitem]");
    first?.focus();
  }, [coords]);

  return (
    <div className={cn(className)} onContextMenu={onContextMenu}>
      {children}
      {coords && typeof document !== "undefined"
        ? createPortal(
            <>
              <div
                className="fixed inset-0 z-[450]"
                aria-hidden
                onClick={close}
                onContextMenu={(event) => {
                  event.preventDefault();
                  close();
                }}
              />
              <div
                ref={menuRef}
                role="menu"
                aria-label={ariaLabel}
                style={{
                  position: "fixed",
                  top: coords.y,
                  left: coords.x,
                }}
                className={cn(
                  "z-[451] overflow-hidden rounded-lg border border-black/10 bg-white py-1.5 shadow-lg",
                  menuClassName,
                )}
              >
                {renderMenu(close)}
              </div>
            </>,
            document.body,
          )
        : null}
    </div>
  );
}

export const rightClickMenuItemClass = cn(
  "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-black/70 transition-colors",
  "hover:bg-black/5 hover:text-[#3D421F] focus:bg-black/5 focus:text-[#3D421F] focus:outline-none",
);
