"use client";

import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Baseline,
  Bold,
  ChevronDown,
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
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  hiringCopyIsEmpty,
  sanitizeHiringCopyHtml,
} from "@/lib/hr/hiring/copy-format";
import { cn } from "@/lib/utils";

const FONT_FACES = [
  { value: "", label: "Venue" },
  { value: "Playfair Display, Georgia, serif", label: "Playfair" },
  { value: "DM Sans, system-ui, sans-serif", label: "DM Sans" },
  { value: "Inter, system-ui, sans-serif", label: "Inter" },
  { value: "Google Sans, Arial, sans-serif", label: "Google Sans" },
  { value: "Georgia, serif", label: "Georgia" },
  { value: "Times New Roman, Times, serif", label: "Times New Roman" },
  { value: "Palatino Linotype, Palatino, serif", label: "Palatino" },
  { value: "Arial, Helvetica, sans-serif", label: "Arial" },
  { value: "Helvetica, Arial, sans-serif", label: "Helvetica" },
  { value: "Verdana, Geneva, sans-serif", label: "Verdana" },
  { value: "Trebuchet MS, sans-serif", label: "Trebuchet" },
  { value: "Courier New, Courier, monospace", label: "Courier" },
] as const;

const FONT_SIZES = [
  "12px",
  "14px",
  "16px",
  "18px",
  "20px",
  "24px",
  "28px",
  "32px",
] as const;

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

type ToolbarMenuId = "font" | "size" | "highlight" | "case" | null;

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

function selectionIsIn(editor: HTMLElement | null): Range | null {
  if (!editor) return null;
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  const node = range.commonAncestorContainer;
  if (node === editor || editor.contains(node)) return range.cloneRange();
  return null;
}

function restoreRange(editor: HTMLElement | null, range: Range | null) {
  if (!editor || !range) return false;
  editor.focus();
  const selection = window.getSelection();
  if (!selection) return false;
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

function styleWithCss(on: boolean) {
  try {
    document.execCommand("styleWithCSS", false, on ? "true" : "false");
  } catch {
    // Unsupported in some browsers.
  }
}

function applyCssToSelection(css: Record<string, string>) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
  const range = selection.getRangeAt(0);
  const span = document.createElement("span");
  for (const [property, value] of Object.entries(css)) {
    span.style.setProperty(property, value);
  }
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

function applyFontSize(editor: HTMLElement, size: string) {
  styleWithCss(false);
  document.execCommand("fontSize", false, "7");
  const marked = [
    ...editor.querySelectorAll('font[size="7"]'),
    ...editor.querySelectorAll('span[style*="xxx-large"]'),
  ];
  for (const node of marked) {
    const span = document.createElement("span");
    span.style.fontSize = size;
    while (node.firstChild) span.appendChild(node.firstChild);
    node.replaceWith(span);
  }
  if (marked.length === 0) applyCssToSelection({ "font-size": size });
}

function applyFontFamily(family: string) {
  styleWithCss(true);
  if (!family) {
    document.execCommand("fontName", false, "Inter, system-ui, sans-serif");
    return;
  }
  document.execCommand("fontName", false, family);
}

function applyCase(mode: "upper" | "lower") {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
  const text = selection.toString();
  const next = mode === "upper" ? text.toUpperCase() : text.toLowerCase();
  document.execCommand("insertText", false, next);
}

function matchingFontValue(computedFamily: string): string {
  const normalized = computedFamily.toLowerCase().replace(/['"]/g, "");
  const match = FONT_FACES.find((face) => {
    if (!face.value) return false;
    const name = face.value.split(",")[0]!.trim().toLowerCase();
    return normalized.includes(name);
  });
  return match?.value ?? "";
}

function matchingSizeValue(computedSize: string): string {
  const px = `${Math.round(Number.parseFloat(computedSize))}px`;
  return px;
}

function ToolbarPicker({
  id,
  openId,
  setOpenId,
  label,
  disabled,
  display,
  displayStyle,
  icon,
  align = "left",
  children,
}: {
  id: Exclude<ToolbarMenuId, null>;
  openId: ToolbarMenuId;
  setOpenId: (next: ToolbarMenuId) => void;
  label: string;
  disabled?: boolean;
  display: string;
  displayStyle?: CSSProperties;
  icon?: ReactNode;
  align?: "left" | "right";
  children: ReactNode;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0, minWidth: 0 });
  const open = openId === id;

  useEffect(() => {
    if (!open) return;
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const minWidth = Math.max(rect.width, 168);
    let left = rect.left;
    if (align === "right" || left + minWidth > window.innerWidth - 8) {
      left = Math.max(8, rect.right - minWidth);
    }
    setCoords({
      top: rect.bottom + 4,
      left,
      minWidth,
    });
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpenId(null);
    }
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") setOpenId(null);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, setOpenId]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={label}
        onMouseDown={(event) => {
          event.preventDefault();
          const rect = buttonRef.current?.getBoundingClientRect();
          if (rect) {
            const minWidth = Math.max(rect.width, 168);
            let left = rect.left;
            if (align === "right" || left + minWidth > window.innerWidth - 8) {
              left = Math.max(8, rect.right - minWidth);
            }
            setCoords({
              top: rect.bottom + 4,
              left,
              minWidth,
            });
          }
          setOpenId(open ? null : id);
        }}
        className={cn(
          "inline-flex h-7 items-center gap-0.5 rounded px-1 text-xs text-[#3D421F]",
          icon ? "size-7 max-w-none justify-center" : "max-w-[9.5rem]",
          "hover:bg-black/5 disabled:opacity-40",
          open && "bg-black/5",
        )}
      >
        {icon ?? (
          <>
            <span className="truncate" style={displayStyle}>
              {display}
            </span>
            <ChevronDown className="size-3 shrink-0 opacity-50" />
          </>
        )}
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              role="listbox"
              aria-label={label}
              className="z-[80] max-h-72 overflow-y-auto rounded-md border border-black/10 bg-white py-1 shadow-lg"
              style={{
                position: "fixed",
                top: coords.top,
                left: coords.left,
                minWidth: coords.minWidth,
              }}
            >
              {children}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function MenuOption({
  label,
  active,
  style,
  onSelect,
}: {
  label: string;
  active?: boolean;
  style?: CSSProperties;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onMouseDown={(event) => {
        event.preventDefault();
        onSelect();
      }}
      className={cn(
        "flex w-full px-3 py-1.5 text-left text-sm text-[#3D421F] hover:bg-black/5",
        active && "bg-[var(--venue-primary,#818a40)]/12",
      )}
      style={style}
    >
      {label}
    </button>
  );
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
        "text-[16px] leading-6 text-[#3D421F]/80",
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
  const savedRange = useRef<Range | null>(null);
  const lastEmitted = useRef(value);
  const isFocused = useRef(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState("https://");
  const [menu, setMenu] = useState<ToolbarMenuId>(null);
  const [fontValue, setFontValue] = useState("");
  const [sizeValue, setSizeValue] = useState("16px");
  const [active, setActive] = useState<Partial<Record<FormatCommand, boolean>>>(
    {},
  );

  function rememberSelection() {
    const range = selectionIsIn(ref.current);
    if (range) savedRange.current = range;
  }

  function withSelection(action: () => void) {
    if (disabled) return;
    restoreRange(ref.current, savedRange.current);
    action();
    rememberSelection();
    emitFromDom();
    refreshActive();
  }

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (isFocused.current) return;
    if (value === lastEmitted.current && el.childNodes.length > 0) return;
    el.innerHTML = sanitizeHiringCopyHtml(value);
    lastEmitted.current = value;
  }, [value]);

  useEffect(() => {
    function onSelectionChange() {
      const range = selectionIsIn(ref.current);
      if (!range) return;
      savedRange.current = range;
      refreshActive();
    }
    document.addEventListener("selectionchange", onSelectionChange);
    return () =>
      document.removeEventListener("selectionchange", onSelectionChange);
  }, []);

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
    const node = window.getSelection()?.anchorNode;
    const el =
      node instanceof HTMLElement
        ? node
        : node?.parentElement ?? ref.current;
    if (!el) return;
    const styles = window.getComputedStyle(el);
    setFontValue(matchingFontValue(styles.fontFamily));
    setSizeValue(matchingSizeValue(styles.fontSize));
  }

  function run(command: FormatCommand, argument?: string) {
    withSelection(() => {
      try {
        document.execCommand("defaultParagraphSeparator", false, "p");
      } catch {
        // Unsupported in some browsers.
      }
      styleWithCss(true);
      document.execCommand(command, false, argument);
    });
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
  const fontLabel =
    FONT_FACES.find((face) => face.value === fontValue)?.label ?? "Venue";
  const fontPreview =
    FONT_FACES.find((face) => face.value === fontValue)?.value ||
    "Inter, system-ui, sans-serif";

  return (
    <div
      className={cn(
        "overflow-hidden rounded-md border border-black/10 bg-white",
        className,
      )}
    >
      <div
        className="flex flex-nowrap items-center gap-0.5 overflow-x-auto border-b border-black/10 px-1.5 py-1"
        onMouseDown={rememberSelection}
      >
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
        <ToolbarPicker
          id="font"
          openId={menu}
          setOpenId={setMenu}
          label="Font"
          disabled={disabled}
          display={fontLabel}
          displayStyle={{ fontFamily: fontPreview }}
        >
          {FONT_FACES.map((face) => (
            <MenuOption
              key={face.label}
              label={face.label}
              active={face.value === fontValue}
              style={{
                fontFamily: face.value || "Inter, system-ui, sans-serif",
              }}
              onSelect={() => {
                withSelection(() => applyFontFamily(face.value));
                setFontValue(face.value);
                setMenu(null);
              }}
            />
          ))}
        </ToolbarPicker>
        <ToolbarPicker
          id="size"
          openId={menu}
          setOpenId={setMenu}
          label="Size"
          disabled={disabled}
          display={sizeValue}
        >
          {FONT_SIZES.map((size) => (
            <MenuOption
              key={size}
              label={size}
              active={size === sizeValue}
              style={{ fontSize: size, lineHeight: 1.2 }}
              onSelect={() => {
                const editor = ref.current;
                if (!editor) return;
                withSelection(() => applyFontSize(editor, size));
                setSizeValue(size);
                setMenu(null);
              }}
            />
          ))}
        </ToolbarPicker>
        <Divider />
        <label className="relative inline-flex size-7 cursor-pointer items-center justify-center rounded hover:bg-black/5">
          <Baseline className="size-3.5 text-[#3D421F]/80" />
          <input
            type="color"
            aria-label="Text color"
            disabled={disabled}
            defaultValue="#3D421F"
            className="absolute inset-0 cursor-pointer opacity-0"
            onMouseDown={rememberSelection}
            onChange={(event) => {
              const color = event.target.value;
              withSelection(() => {
                styleWithCss(true);
                document.execCommand("foreColor", false, color);
              });
            }}
          />
        </label>
        <ToolbarPicker
          id="highlight"
          openId={menu}
          setOpenId={setMenu}
          label="Highlight"
          disabled={disabled}
          display="Highlight"
          icon={<Highlighter className="size-3.5" />}
        >
          {HIGHLIGHTS.map((swatch) => (
            <MenuOption
              key={swatch.value}
              label={swatch.label}
              style={{
                backgroundColor:
                  swatch.value === "transparent" ? undefined : swatch.value,
              }}
              onSelect={() => {
                withSelection(() => {
                  styleWithCss(true);
                  document.execCommand("hiliteColor", false, swatch.value);
                  document.execCommand("backColor", false, swatch.value);
                });
                setMenu(null);
              }}
            />
          ))}
        </ToolbarPicker>
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
          onMouseDown={() =>
            withSelection(() => {
              document.execCommand("formatBlock", false, "blockquote");
            })
          }
        >
          <Quote className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Insert link"
          disabled={disabled}
          onMouseDown={() => {
            rememberSelection();
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
        <ToolbarPicker
          id="case"
          openId={menu}
          setOpenId={setMenu}
          label="Change case"
          disabled={disabled}
          display="Aa"
        >
          <MenuOption
            label="UPPERCASE"
            onSelect={() => {
              withSelection(() => applyCase("upper"));
              setMenu(null);
            }}
          />
          <MenuOption
            label="lowercase"
            onSelect={() => {
              withSelection(() => applyCase("lower"));
              setMenu(null);
            }}
          />
        </ToolbarPicker>
        {tokens?.map((token) => (
          <button
            key={token.insert}
            type="button"
            disabled={disabled}
            title={`Insert ${token.insert}`}
            className="ml-1 shrink-0 rounded border border-black/10 px-1.5 py-0.5 font-mono text-[11px] text-[#3D421F] hover:bg-black/5 disabled:opacity-50"
            onMouseDown={(event) => {
              event.preventDefault();
              withSelection(() => {
                document.execCommand("insertText", false, token.insert);
              });
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
          "min-h-[96px] w-full overflow-y-auto px-3 py-2 text-[16px] text-[#3D421F] outline-none",
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
