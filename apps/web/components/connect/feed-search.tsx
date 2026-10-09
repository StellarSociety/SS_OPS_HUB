"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { useVenueScope } from "@/components/providers/venue-scope-provider";
import { cn } from "@/lib/utils";
import { toScopedHref } from "@/lib/venue/scope-routing";

/** Search icon that expands into a search box and filters the open feed. */
export function FeedSearch({ basePath, initialQuery }: { basePath: string; initialQuery: string }) {
  const router = useRouter();
  const { scope, slug } = useVenueScope();
  const [open, setOpen] = useState(Boolean(initialQuery));
  const [value, setValue] = useState(initialQuery);
  const inputRef = useRef<HTMLInputElement>(null);
  const applied = useRef(initialQuery);

  // Update the feed shortly after typing stops.
  useEffect(() => {
    const q = value.trim();
    if (q === applied.current) return;
    const id = window.setTimeout(() => {
      applied.current = q;
      const href = q ? `${basePath}?q=${encodeURIComponent(q)}` : basePath;
      router.replace(toScopedHref(href, scope, slug), { scroll: false });
    }, 350);
    return () => window.clearTimeout(id);
  }, [value, basePath, router, scope, slug]);

  function expand() {
    setOpen(true);
    // Focus once the width animation has started.
    window.setTimeout(() => inputRef.current?.focus(), 60);
  }

  function collapse() {
    setValue("");
    setOpen(false);
  }

  return (
    <div
      className={cn(
        "flex h-10 items-center overflow-hidden rounded-full transition-[width,background-color,box-shadow] duration-300 ease-out",
        open
          ? "w-56 bg-white/90 shadow-sm ring-1 ring-black/10 sm:w-72"
          : "w-10 bg-transparent hover:bg-black/5",
      )}
    >
      <button
        type="button"
        onClick={() => (open ? inputRef.current?.focus() : expand())}
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center text-black/55 hover:text-[#2B2F16]"
        aria-label="Search this feed"
        title="Search this feed"
        aria-expanded={open}
      >
        <Search className="h-5 w-5" />
      </button>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") collapse();
        }}
        onBlur={() => {
          if (!value.trim()) setOpen(false);
        }}
        placeholder="Search posts"
        tabIndex={open ? 0 : -1}
        className={cn(
          "min-w-0 flex-1 bg-transparent text-sm text-[#2B2F16] outline-none transition-opacity duration-200 placeholder:text-black/40",
          open ? "opacity-100 delay-100" : "pointer-events-none opacity-0",
        )}
      />
      {open && value ? (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={collapse}
          className="mr-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-black/45 hover:bg-black/5"
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
