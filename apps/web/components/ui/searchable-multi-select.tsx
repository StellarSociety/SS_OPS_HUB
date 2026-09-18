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
import type { SelectOption } from "@/components/ui/searchable-select";

type SearchableMultiSelectProps = {
  values: string[];
  onChange: (next: string[]) => void;
  options: SelectOption[];
  placeholder: string;
  searchPlaceholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
};

const triggerClass =
  "flex h-10 w-full items-center gap-2 rounded-md border border-black/10 bg-white pl-3 pr-2 text-sm text-[#3D421F] outline-none transition focus:border-[var(--venue-primary)]/50 focus:ring-2 focus:ring-[var(--venue-primary)]/20 disabled:cursor-not-allowed disabled:bg-black/[0.03] disabled:text-black/55";

export function SearchableMultiSelect({
  values,
  onChange,
  options,
  placeholder,
  searchPlaceholder = "Type to search…",
  className,
  disabled = false,
  id,
  "aria-label": ariaLabel,
}: SearchableMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelPos, setPanelPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  const selectedSet = useMemo(() => new Set(values), [values]);
  const selectedLabels = useMemo(
    () =>
      values
        .map((value) => options.find((option) => option.value === value)?.label)
        .filter((label): label is string => Boolean(label)),
    [options, values],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((option) => {
      const haystack = `${option.label} ${option.searchText ?? ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [options, query]);

  function updatePanelPos() {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.max(rect.width, 220);
    const left = Math.min(
      Math.max(8, rect.left),
      window.innerWidth - width - 8,
    );
    setPanelPos({ top: rect.bottom + 4, left, width });
  }

  useLayoutEffect(() => {
    if (!open) {
      setPanelPos(null);
      return;
    }
    updatePanelPos();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
    };
    const onReposition = () => updatePanelPos();
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  function toggle(value: string) {
    if (selectedSet.has(value)) {
      onChange(values.filter((item) => item !== value));
    } else {
      onChange([...values, value]);
    }
  }

  const summary =
    selectedLabels.length === 0 ? placeholder : selectedLabels.join(", ");

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((current) => !current);
        }}
        className={triggerClass}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-multiselectable
      >
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-left",
            selectedLabels.length === 0 && "text-black/45",
          )}
        >
          {summary}
        </span>
        {values.length > 0 ? (
          <span
            role="button"
            tabIndex={-1}
            aria-label="Clear"
            onClick={(event) => {
              event.stopPropagation();
              if (disabled) return;
              onChange([]);
            }}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-black/5 text-black/45 transition-colors hover:bg-black/15 hover:text-[#3D421F]"
          >
            <X className="h-3 w-3" />
          </span>
        ) : null}
        <ChevronDown className="h-4 w-4 shrink-0 text-black/40" />
      </button>

      {open && panelPos
        ? createPortal(
            <div
              ref={panelRef}
              className="fixed overflow-hidden rounded-md border border-black/10 bg-white shadow-lg"
              style={{
                top: panelPos.top,
                left: panelPos.left,
                width: panelPos.width,
                zIndex: 450,
              }}
            >
              <div className="relative border-b border-black/5 p-2">
                <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-black/40" />
                <input
                  autoFocus
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={searchPlaceholder}
                  className="h-9 w-full rounded-md border border-black/10 bg-white pl-9 pr-3 text-sm text-[#3D421F] outline-none focus:border-[var(--venue-primary)]/50"
                />
              </div>
              {values.length > 0 ? (
                <div className="flex items-center justify-between border-b border-black/5 px-3 py-1.5 text-xs text-black/50">
                  <span>
                    {values.length} selected
                  </span>
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
                {filtered.map((option) => {
                  const isSelected = selectedSet.has(option.value);
                  return (
                    <li key={option.value}>
                      <button
                        type="button"
                        onClick={() => toggle(option.value)}
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
                        <span className="min-w-0 flex-1 truncate">
                          {option.label}
                        </span>
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
