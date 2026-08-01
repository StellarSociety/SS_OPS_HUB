"use client";

import { Bold, Italic, Underline } from "lucide-react";
import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  editorHtmlToStoredMessage,
  storedMessageToEditorHtml,
} from "@/lib/hr/email-message-format";
import { cn } from "@/lib/utils";

type EmailMessageEditorProps = {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  /** Approximate height in text rows (line-height ~1.5rem). */
  rows?: number;
  className?: string;
  "aria-label"?: string;
};

function ToolbarButton({
  label,
  active,
  disabled,
  onMouseDown,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onMouseDown: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => {
        e.preventDefault();
        onMouseDown();
      }}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-md border text-[#3D421F] transition-colors",
        "border-black/10 bg-white hover:bg-black/5 disabled:opacity-50",
        active && "border-[var(--venue-primary)]/40 bg-[var(--venue-primary)]/15",
      )}
    >
      {children}
    </button>
  );
}

export function EmailMessageEditor({
  id,
  value,
  onChange,
  disabled = false,
  rows = 12,
  className,
  "aria-label": ariaLabel,
}: EmailMessageEditorProps) {
  const autoId = useId();
  const editorId = id ?? autoId;
  const ref = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef(value);
  const isFocused = useRef(false);
  const [shortcutHint, setShortcutHint] = useState(
    "⌘/Ctrl+B bold · I italic · U underline",
  );

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (value === lastEmitted.current && el.childNodes.length > 0) return;
    if (isFocused.current && value === lastEmitted.current) return;
    el.innerHTML = storedMessageToEditorHtml(value);
    lastEmitted.current = value;
  }, [value]);

  useLayoutEffect(() => {
    const isMac = /Mac|iPhone|iPad|iPod/i.test(
      navigator.platform || navigator.userAgent,
    );
    setShortcutHint(
      isMac
        ? "⌘B bold · ⌘I italic · ⌘U underline"
        : "Ctrl+B bold · Ctrl+I italic · Ctrl+U underline",
    );
  }, []);

  function emitFromDom() {
    const el = ref.current;
    if (!el) return;
    const next = editorHtmlToStoredMessage(el);
    lastEmitted.current = next;
    onChange(next);
  }

  function runFormat(command: "bold" | "italic" | "underline") {
    if (disabled) return;
    ref.current?.focus();
    document.execCommand(command);
    emitFromDom();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (disabled) return;
    const mod = e.metaKey || e.ctrlKey;
    if (!mod || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === "b") {
      e.preventDefault();
      runFormat("bold");
    } else if (key === "i") {
      e.preventDefault();
      runFormat("italic");
    } else if (key === "u") {
      e.preventDefault();
      runFormat("underline");
    }
  }

  const minHeight = `${Math.max(rows, 4) * 1.5}rem`;

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex flex-wrap items-center gap-1.5">
        <ToolbarButton
          label="Bold"
          disabled={disabled}
          onMouseDown={() => runFormat("bold")}
        >
          <Bold className="size-3.5" strokeWidth={2.5} />
        </ToolbarButton>
        <ToolbarButton
          label="Italic"
          disabled={disabled}
          onMouseDown={() => runFormat("italic")}
        >
          <Italic className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Underline"
          disabled={disabled}
          onMouseDown={() => runFormat("underline")}
        >
          <Underline className="size-3.5" />
        </ToolbarButton>
        <span className="ml-1 text-[11px] text-black/45">{shortcutHint}</span>
      </div>

      <div
        id={editorId}
        ref={ref}
        role="textbox"
        aria-multiline="true"
        aria-label={ariaLabel}
        aria-disabled={disabled}
        contentEditable={!disabled}
        suppressContentEditableWarning
        onFocus={() => {
          isFocused.current = true;
        }}
        onBlur={() => {
          isFocused.current = false;
          emitFromDom();
        }}
        onInput={emitFromDom}
        onKeyDown={handleKeyDown}
        className={cn(
          "w-full overflow-y-auto rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-[#3D421F] outline-none",
          "focus:border-[var(--venue-primary)]/50 focus:ring-2 focus:ring-[var(--venue-primary)]/20",
          "whitespace-pre-wrap break-words",
          disabled && "cursor-not-allowed opacity-50",
        )}
        style={{ minHeight }}
      />
    </div>
  );
}
