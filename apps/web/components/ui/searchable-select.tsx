"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type SelectOption = { value: string; label: string };

type SearchableSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  /** Shown in the trigger when nothing is selected, and as the reset row. */
  placeholder: string;
  /** Placeholder inside the search input. */
  searchPlaceholder?: string;
  className?: string;
};

const triggerClass =
  "flex h-10 w-full items-center gap-2 rounded-md border border-black/10 bg-white pl-3 pr-2 text-sm text-[#3D421F] outline-none transition focus:border-[var(--venue-primary)]/50 focus:ring-2 focus:ring-[var(--venue-primary)]/20";

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder = "Type to search…",
  className,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  function select(next: string) {
    onChange(next);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={triggerClass}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-left",
            !selected && "text-black/45",
          )}
        >
          {selected?.label ?? placeholder}
        </span>
        {value ? (
          <span
            role="button"
            tabIndex={-1}
            aria-label="Clear"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-black/5 text-black/45 transition-colors hover:bg-black/15 hover:text-[#3D421F]"
          >
            <X className="h-3 w-3" />
          </span>
        ) : null}
        <ChevronDown className="h-4 w-4 shrink-0 text-black/40" />
      </button>

      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 overflow-hidden rounded-md border border-black/10 bg-white shadow-lg">
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
          <ul
            role="listbox"
            className="max-h-60 overflow-y-auto py-1 text-sm"
          >
            <li>
              <button
                type="button"
                onClick={() => select("")}
                className={cn(
                  "flex w-full items-center px-3 py-2 text-left transition-colors hover:bg-[var(--venue-secondary)]/40",
                  value === "" && "font-medium text-[#3D421F]",
                )}
              >
                {placeholder}
              </button>
            </li>
            {filtered.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  onClick={() => select(o.value)}
                  className={cn(
                    "flex w-full items-center px-3 py-2 text-left transition-colors hover:bg-[var(--venue-secondary)]/40",
                    value === o.value
                      ? "bg-[var(--venue-secondary)]/30 font-medium text-[#3D421F]"
                      : "text-black/70",
                  )}
                >
                  {o.label}
                </button>
              </li>
            ))}
            {filtered.length === 0 ? (
              <li className="px-3 py-3 text-center text-xs text-black/45">
                No matches.
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
