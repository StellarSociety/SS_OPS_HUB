"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

type MultiSelectProps = {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** Shown in the trigger when nothing is selected. */
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
};

export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Filter…",
  searchPlaceholder = "Search…",
  className,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, query]);

  const updatePosition = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      top: r.bottom + 4,
      left: r.left,
      width: Math.max(r.width, 224),
    });
  };

  useLayoutEffect(() => {
    if (open) updatePosition();
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    const onReflow = () => updatePosition();
    const onPointer = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        popRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("scroll", onReflow, true);
    window.addEventListener("resize", onReflow);
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", onReflow, true);
      window.removeEventListener("resize", onReflow);
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle(value: string) {
    if (selectedSet.has(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  }

  const count = selected.length;

  return (
    <div className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "flex h-7 w-full min-w-[7rem] items-center gap-1 rounded border bg-white px-2 text-xs font-normal normal-case outline-none transition",
          count > 0
            ? "border-[var(--venue-primary)]/50 text-[#3D421F]"
            : "border-black/10 text-black/45",
        )}
      >
        <span className="min-w-0 flex-1 truncate text-left">
          {count > 0 ? `${count} selected` : placeholder}
        </span>
        {count > 0 ? (
          <span
            role="button"
            tabIndex={-1}
            aria-label="Clear"
            onClick={(e) => {
              e.stopPropagation();
              onChange([]);
            }}
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-black/5 text-black/45 transition-colors hover:bg-black/15 hover:text-[#3D421F]"
          >
            <X className="h-2.5 w-2.5" />
          </span>
        ) : null}
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-black/40" />
      </button>

      {open && pos
        ? createPortal(
            <div
              ref={popRef}
              style={{
                position: "fixed",
                top: pos.top,
                left: pos.left,
                width: pos.width,
              }}
              className="z-50 overflow-hidden rounded-md border border-black/10 bg-white shadow-lg"
            >
              <div className="relative border-b border-black/5 p-2">
                <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-black/40" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="h-9 w-full rounded-md border border-black/10 bg-white pl-9 pr-3 text-sm text-[#3D421F] outline-none focus:border-[var(--venue-primary)]/50"
                />
              </div>
              {count > 0 ? (
                <div className="flex items-center justify-between border-b border-black/5 px-3 py-1.5 text-xs text-black/50">
                  <span>{count} selected</span>
                  <button
                    type="button"
                    onClick={() => onChange([])}
                    className="font-medium text-black/50 transition-colors hover:text-[#3D421F]"
                  >
                    Clear
                  </button>
                </div>
              ) : null}
              <ul role="listbox" className="max-h-60 overflow-y-auto py-1 text-sm">
                {filtered.map((o) => {
                  const isSelected = selectedSet.has(o);
                  return (
                    <li key={o}>
                      <button
                        type="button"
                        onClick={() => toggle(o)}
                        className={cn(
                          "flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-[var(--venue-secondary)]/40",
                          isSelected ? "text-[#3D421F]" : "text-black/70",
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                            isSelected
                              ? "border-[var(--venue-primary)] bg-[var(--venue-primary)] text-white"
                              : "border-black/20 bg-white",
                          )}
                        >
                          {isSelected ? <Check className="h-3 w-3" /> : null}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{o}</span>
                      </button>
                    </li>
                  );
                })}
                {filtered.length === 0 ? (
                  <li className="px-3 py-3 text-center text-xs text-black/45">
                    No matches.
                  </li>
                ) : null}
              </ul>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
