"use client";

import {
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type Ref,
  type TextareaHTMLAttributes,
} from "react";
import { ConnectAvatar } from "@/components/connect/connect-avatar";
import { useMentionPeople } from "@/components/connect/mention-people";
import type { ConnectPerson } from "@/lib/connect/types";
import { cn } from "@/lib/utils";

const MAX_SUGGESTIONS = 6;
// "@" at the start or after whitespace, then up to two words being typed.
const TRIGGER_RE = /(?:^|\s)@([\p{L}\p{N}._'-]*(?: [\p{L}\p{N}._'-]*)?)$/u;

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> & {
  value: string;
  onValueChange: (value: string) => void;
  /** People to suggest; defaults to everyone at the venue. */
  people?: ConnectPerson[];
  /** Classes for the wrapper that replaces the textarea in the layout. */
  wrapperClassName?: string;
  ref?: Ref<HTMLTextAreaElement>;
};

/**
 * Textarea with @mention suggestions: typing "@" opens a small picker of
 * people (filtered as you type); picking one inserts "@Full Name ".
 */
export function MentionTextarea({
  value,
  onValueChange,
  people: peopleProp,
  wrapperClassName,
  className,
  onKeyDown,
  onBlur,
  ref,
  ...rest
}: Props) {
  const venuePeople = useMentionPeople();
  const people = peopleProp ?? venuePeople;
  const inner = useRef<HTMLTextAreaElement | null>(null);
  const [query, setQuery] = useState<{ text: string; start: number } | null>(null);
  const [index, setIndex] = useState(0);

  const suggestions = useMemo(() => {
    if (!query) return [];
    const q = query.text.trim().toLowerCase();
    return people
      .filter((p) => {
        if (!q) return true;
        const name = p.name.toLowerCase();
        return name.startsWith(q) || name.split(/\s+/).some((part) => part.startsWith(q)) || name.includes(q);
      })
      .slice(0, MAX_SUGGESTIONS);
  }, [people, query]);

  const open = query !== null && suggestions.length > 0;

  function detect(el: HTMLTextAreaElement) {
    const caret = el.selectionStart ?? el.value.length;
    const before = el.value.slice(0, caret);
    const match = TRIGGER_RE.exec(before);
    if (!match) {
      setQuery(null);
      return;
    }
    const text = match[1] ?? "";
    setQuery({ text, start: caret - text.length - 1 });
    setIndex(0);
  }

  function pick(person: ConnectPerson) {
    const el = inner.current;
    if (!el || !query) return;
    const caret = el.selectionStart ?? value.length;
    const insert = `@${person.name} `;
    const next = value.slice(0, query.start) + insert + value.slice(caret);
    onValueChange(next);
    setQuery(null);
    const pos = query.start + insert.length;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const step = e.key === "ArrowDown" ? 1 : -1;
        setIndex((i) => (i + step + suggestions.length) % suggestions.length);
        return;
      }
      if ((e.key === "Enter" || e.key === "Tab") && !e.nativeEvent.isComposing) {
        e.preventDefault();
        e.stopPropagation();
        const person = suggestions[index];
        if (person) pick(person);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setQuery(null);
        return;
      }
    }
    onKeyDown?.(e);
  }

  return (
    <div className={cn("relative min-w-0", wrapperClassName ?? "flex-1")}>
      {open ? (
        <ul
          role="listbox"
          aria-label="Mention someone"
          className="absolute bottom-full left-0 z-50 mb-2 max-h-64 w-64 overflow-y-auto rounded-xl border border-black/10 bg-white py-1 shadow-xl"
        >
          {suggestions.map((person, i) => (
            <li key={person.userId} role="option" aria-selected={i === index}>
              <button
                type="button"
                // Keep focus in the textarea so the caret position survives.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(person);
                }}
                onMouseEnter={() => setIndex(i)}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 py-1.5 text-left",
                  i === index ? "bg-[var(--venue-primary,#818a40)]/12" : "hover:bg-black/[0.04]",
                )}
              >
                <ConnectAvatar name={person.name} photoUrl={person.photoUrl} size="xs" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-[#2B2F16]">{person.name}</span>
                  {person.positionName ? (
                    <span className="block truncate text-[11px] text-black/50">{person.positionName}</span>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <textarea
        {...rest}
        ref={(el) => {
          inner.current = el;
          if (typeof ref === "function") ref(el);
          else if (ref) (ref as { current: HTMLTextAreaElement | null }).current = el;
        }}
        value={value}
        onChange={(e) => {
          onValueChange(e.target.value);
          detect(e.target);
        }}
        onKeyDown={handleKeyDown}
        onKeyUp={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Home" || e.key === "End") {
            detect(e.currentTarget);
          }
        }}
        onClick={(e) => detect(e.currentTarget)}
        onBlur={(e) => {
          setQuery(null);
          onBlur?.(e);
        }}
        aria-autocomplete="list"
        className={cn("w-full", className)}
      />
    </div>
  );
}
