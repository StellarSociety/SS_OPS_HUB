"use client";

import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Baseline,
  Bold,
  Highlighter,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link2,
  Link2Off,
  List,
  ListOrdered,
  Minus,
  Quote,
  RemoveFormatting,
  Strikethrough,
  Subscript,
  Superscript,
  Underline,
} from "lucide-react";
import {
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  hiringCopyIsEmpty,
  sanitizeHiringCopyHtml,
} from "@/lib/hr/hiring/copy-format";
import { cn } from "@/lib/utils";

const FONT_FACES = [
  { value: "", label: "Venue" },
  { value: 'Georgia, "Times New Roman", serif', label: "Serif" },
  { value: "Arial, Helvetica, sans-serif", label: "Sans" },
] as const;

const FONT_SIZES = ["12px", "14px", "16px", "18px", "20px", "24px"] as const;

const HIGHLIGHTS = [
  { value: "transparent", label: "None" },
  { value: "#F0F3DD", label: "Sage" },
  { value: "#FDE68A", label: "Amber" },
  { value: "#FECACA", label: "Rose" },
] as const;

type FormatCommand =
  | "bold"
  | "italic"
  | "underline"
  | "strikeThrough"
  | "justifyLeft"
  | "justifyCenter"
  | "justifyRight"
  | "justifyFull"
  | "insertOrderedList"
  | "insertUnorderedList"
  | "indent"
  | "outdent"
  | "superscript"
  | "subscript"
  | "insertHorizontalRule"
  | "createLink"
  | "unlink"
  | "removeFormat";

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
      onMouseDown={(event) => {
        event.preventDefault();
        onMouseDown();
      }}
      className={cn(
        "inline-flex size-7 items-center justify-center rounded text-[#3D421F]/80 transition-colors",
        "hover:bg-black/5 disabled:opacity-40",
        active && "bg-[var(--venue-primary,#818a40)]/15 text-[#3D421F]",
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-0.5 h-5 w-px shrink-0 bg-black/10" aria-hidden />;
}

function wrapSelection(style: string) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
  const range = selection.getRangeAt(0);
  const span = document.createElement("span");
  span.setAttribute("style", style);
  try {
    range.surroundContents(span);
  } catch {
    span.appendChild(range.extractContents());
    range.insertNode(span);
  }
  selection.removeAllRanges();
  const next = document.createRange();
  next.selectNodeContents(span);
  selection.addRange(next);
}

function applyCase(mode: "upper" | "lower") {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
  const text = selection.toString();
  const next = mode === "upper" ? text.toUpperCase() : text.toLowerCase();
  document.execCommand("insertText", false, next);
}

export function HiringCopyHtml({
  html,
  className,
  empty,
}: {
  html: string;
  className?: string;
  empty?: string;
}) {
  const safe = sanitizeHiringCopyHtml(html);
  if (hiringCopyIsEmpty(safe)) {
    return empty ? <p className={className}>{empty}</p> : null;
  }
  return (
    <div
      className={cn(
        "text-sm leading-6 text-[#3D421F]/80",
        "[&_a]:underline [&_a]:underline-offset-2",
        "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:text-left",
        "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:text-left",
        "[&_p]:m-0 [&_p+p]:mt-2",
        "[&_blockquote]:border-l-2 [&_blockquote]:border-black/15 [&_blockquote]:pl-3 [&_blockquote]:italic",
        "[&_h3]:mb-1 [&_h3]:font-serif [&_h3]:text-lg [&_h3]:text-[#3D421F]",
        "[&_hr]:my-3 [&_hr]:border-black/10",
        "[&_sup]:text-[0.7em] [&_sub]:text-[0.7em]",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}

export function HiringCopyEditor({
  id,
  value,
  onChange,
  disabled = false,
  rows = 4,
  className,
  tokens,
  "aria-label": ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  rows?: number;
  className?: string;
  tokens?: { insert: string; label: string }[];
  "aria-label"?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef(value);
  const isFocused = useRef(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState("https://");
  const [active, setActive] = useState<Partial<Record<FormatCommand, boolean>>>(
    {},
  );

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (isFocused.current) return;
    if (value === lastEmitted.current && el.childNodes.length > 0) return;
    el.innerHTML = sanitizeHiringCopyHtml(value);
    lastEmitted.current = value;
  }, [value]);

  function emitFromDom() {
    const el = ref.current;
    if (!el) return;
    const next = sanitizeHiringCopyHtml(el.innerHTML);
    if (next === lastEmitted.current) return;
    lastEmitted.current = next;
    onChange(next);
  }

  function refreshActive() {
    try {
      setActive({
        bold: document.queryCommandState("bold"),
        italic: document.queryCommandState("italic"),
        underline: document.queryCommandState("underline"),
        strikeThrough: document.queryCommandState("strikeThrough"),
        justifyLeft: document.queryCommandState("justifyLeft"),
        justifyCenter: document.queryCommandState("justifyCenter"),
        justifyRight: document.queryCommandState("justifyRight"),
        justifyFull: document.queryCommandState("justifyFull"),
        insertOrderedList: document.queryCommandState("insertOrderedList"),
        insertUnorderedList: document.queryCommandState("insertUnorderedList"),
        superscript: document.queryCommandState("superscript"),
        subscript: document.queryCommandState("subscript"),
      });
    } catch {
      // queryCommandState is not available in every browser/context.
    }
  }

  function run(command: FormatCommand, argument?: string) {
    if (disabled) return;
    ref.current?.focus();
    try {
      document.execCommand("defaultParagraphSeparator", false, "p");
    } catch {
      // Unsupported in some browsers.
    }
    document.execCommand(command, false, argument);
    emitFromDom();
    refreshActive();
  }

  function applyStyle(style: string) {
    if (disabled) return;
    ref.current?.focus();
    wrapSelection(style);
    emitFromDom();
  }

  function applyLink() {
    const href = linkValue.trim();
    if (!href) return;
    run("createLink", href);
    setLinkOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (disabled) return;
    const mod = event.metaKey || event.ctrlKey;
    if (!mod || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === "b") {
      event.preventDefault();
      run("bold");
    } else if (key === "i") {
      event.preventDefault();
      run("italic");
    } else if (key === "u") {
      event.preventDefault();
      run("underline");
    }
  }

  const minHeight = `${Math.max(rows, 3) * 1.5}rem`;
  const selectClass =
    "h-7 max-w-[7.5rem] rounded border-0 bg-transparent px-1 text-xs text-[#3D421F] outline-none";

  return (
    <div
      className={cn(
        "overflow-hidden rounded-md border border-black/10 bg-white",
        className,
      )}
    >
      <div className="flex flex-nowrap items-center gap-0.5 overflow-x-auto border-b border-black/10 px-1.5 py-1">
        <ToolbarButton
          label="Bold"
          disabled={disabled}
          active={active.bold}
          onMouseDown={() => run("bold")}
        >
          <Bold className="size-3.5" strokeWidth={2.5} />
        </ToolbarButton>
        <ToolbarButton
          label="Italic"
          disabled={disabled}
          active={active.italic}
          onMouseDown={() => run("italic")}
        >
          <Italic className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Underline"
          disabled={disabled}
          active={active.underline}
          onMouseDown={() => run("underline")}
        >
          <Underline className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Strikethrough"
          disabled={disabled}
          active={active.strikeThrough}
          onMouseDown={() => run("strikeThrough")}
        >
          <Strikethrough className="size-3.5" />
        </ToolbarButton>
        <Divider />
        <select
          aria-label="Font"
          disabled={disabled}
          className={selectClass}
          defaultValue=""
          onMouseDown={() => ref.current?.focus()}
          onChange={(event) => {
            const face = event.target.value;
            if (!face) {
              run("removeFormat");
              return;
            }
            applyStyle(`font-family: ${face}`);
          }}
        >
          {FONT_FACES.map((face) => (
            <option key={face.label} value={face.value}>
              {face.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Size"
          disabled={disabled}
          className={cn(selectClass, "max-w-[4.5rem]")}
          defaultValue="16px"
          onMouseDown={() => ref.current?.focus()}
          onChange={(event) => applyStyle(`font-size: ${event.target.value}`)}
        >
          {FONT_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
        <Divider />
        <label className="relative inline-flex size-7 cursor-pointer items-center justify-center rounded hover:bg-black/5">
          <Baseline className="size-3.5 text-[#3D421F]/80" />
          <input
            type="color"
            aria-label="Text color"
            disabled={disabled}
            defaultValue="#3D421F"
            className="absolute inset-0 cursor-pointer opacity-0"
            onChange={(event) => applyStyle(`color: ${event.target.value}`)}
          />
        </label>
        <div className="relative">
          <ToolbarButton
            label="Highlight"
            disabled={disabled}
            onMouseDown={() => undefined}
          >
            <Highlighter className="size-3.5" />
          </ToolbarButton>
          <select
            aria-label="Highlight"
            disabled={disabled}
            className="absolute inset-0 cursor-pointer opacity-0"
            defaultValue="transparent"
            onMouseDown={() => ref.current?.focus()}
            onChange={(event) =>
              applyStyle(`background-color: ${event.target.value}`)
            }
          >
            {HIGHLIGHTS.map((swatch) => (
              <option key={swatch.value} value={swatch.value}>
                {swatch.label}
              </option>
            ))}
          </select>
        </div>
        <Divider />
        <ToolbarButton
          label="Align left"
          disabled={disabled}
          active={active.justifyLeft}
          onMouseDown={() => run("justifyLeft")}
        >
          <AlignLeft className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Align center"
          disabled={disabled}
          active={active.justifyCenter}
          onMouseDown={() => run("justifyCenter")}
        >
          <AlignCenter className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Align right"
          disabled={disabled}
          active={active.justifyRight}
          onMouseDown={() => run("justifyRight")}
        >
          <AlignRight className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Justify"
          disabled={disabled}
          active={active.justifyFull}
          onMouseDown={() => run("justifyFull")}
        >
          <AlignJustify className="size-3.5" />
        </ToolbarButton>
        <Divider />
        <ToolbarButton
          label="Numbered list"
          disabled={disabled}
          active={active.insertOrderedList}
          onMouseDown={() => run("insertOrderedList")}
        >
          <ListOrdered className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Bullet list"
          disabled={disabled}
          active={active.insertUnorderedList}
          onMouseDown={() => run("insertUnorderedList")}
        >
          <List className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Decrease indent"
          disabled={disabled}
          onMouseDown={() => run("outdent")}
        >
          <IndentDecrease className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Increase indent"
          disabled={disabled}
          onMouseDown={() => run("indent")}
        >
          <IndentIncrease className="size-3.5" />
        </ToolbarButton>
        <Divider />
        <ToolbarButton
          label="Superscript"
          disabled={disabled}
          active={active.superscript}
          onMouseDown={() => run("superscript")}
        >
          <Superscript className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Subscript"
          disabled={disabled}
          active={active.subscript}
          onMouseDown={() => run("subscript")}
        >
          <Subscript className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Quote"
          disabled={disabled}
          onMouseDown={() => {
            ref.current?.focus();
            document.execCommand("formatBlock", false, "blockquote");
            emitFromDom();
          }}
        >
          <Quote className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Insert link"
          disabled={disabled}
          onMouseDown={() => {
            setLinkOpen((open) => !open);
            setLinkValue("https://");
          }}
        >
          <Link2 className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Remove link"
          disabled={disabled}
          onMouseDown={() => run("unlink")}
        >
          <Link2Off className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Horizontal line"
          disabled={disabled}
          onMouseDown={() => run("insertHorizontalRule")}
        >
          <Minus className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Clear formatting"
          disabled={disabled}
          onMouseDown={() => run("removeFormat")}
        >
          <RemoveFormatting className="size-3.5" />
        </ToolbarButton>
        <select
          aria-label="Change case"
          disabled={disabled}
          className={cn(selectClass, "max-w-[3.25rem]")}
          defaultValue=""
          onMouseDown={() => ref.current?.focus()}
          onChange={(event) => {
            const mode = event.target.value;
            if (mode === "upper" || mode === "lower") applyCase(mode);
            event.currentTarget.value = "";
            emitFromDom();
          }}
        >
          <option value="">Aa</option>
          <option value="upper">AB</option>
          <option value="lower">ab</option>
        </select>
        {tokens?.map((token) => (
          <button
            key={token.insert}
            type="button"
            disabled={disabled}
            title={`Insert ${token.insert}`}
            className="ml-1 shrink-0 rounded border border-black/10 px-1.5 py-0.5 font-mono text-[11px] text-[#3D421F] hover:bg-black/5 disabled:opacity-50"
            onMouseDown={(event) => {
              event.preventDefault();
              ref.current?.focus();
              document.execCommand("insertText", false, token.insert);
              emitFromDom();
            }}
          >
            {token.label}
          </button>
        ))}
      </div>
      {linkOpen ? (
        <div className="flex items-center gap-2 border-b border-black/10 px-2 py-1.5">
          <input
            value={linkValue}
            onChange={(event) => setLinkValue(event.target.value)}
            placeholder="https://"
            disabled={disabled}
            className="h-8 flex-1 rounded border border-black/10 px-2 text-xs text-[#3D421F] outline-none focus:ring-2 focus:ring-[var(--venue-primary,#818a40)]/30"
          />
          <button
            type="button"
            className="h-8 rounded-md bg-[var(--venue-primary,#818a40)] px-2.5 text-xs font-medium text-white"
            onMouseDown={(event) => {
              event.preventDefault();
              applyLink();
            }}
          >
            Add
          </button>
        </div>
      ) : null}
      <div
        id={id}
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
          const el = ref.current;
          if (el) el.innerHTML = sanitizeHiringCopyHtml(lastEmitted.current);
        }}
        onInput={emitFromDom}
        onKeyUp={refreshActive}
        onMouseUp={refreshActive}
        onKeyDown={handleKeyDown}
        onPaste={(event) => {
          event.preventDefault();
          const html = event.clipboardData.getData("text/html");
          const text = event.clipboardData.getData("text/plain");
          if (html) {
            document.execCommand(
              "insertHTML",
              false,
              sanitizeHiringCopyHtml(html),
            );
          } else {
            document.execCommand("insertText", false, text);
          }
          emitFromDom();
        }}
        className={cn(
          "min-h-[96px] w-full overflow-y-auto px-3 py-2 text-[16px] text-[#3D421F] outline-none md:text-sm",
          "[&_p]:m-0 [&_p+p]:mt-2 [&_div]:m-0",
          "[&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5",
          "[&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5",
          disabled && "cursor-not-allowed opacity-50",
        )}
        style={{ minHeight }}
      />
    </div>
  );
}
