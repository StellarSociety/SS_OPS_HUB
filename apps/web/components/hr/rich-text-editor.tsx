"use client";

import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Heading2,
  Heading3,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
  Redo2,
  Strikethrough,
  Underline,
  Undo2,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import { tidyPastedTextToHtml } from "@/lib/hr/policy-tidy";
import { cn } from "@/lib/utils";

/**
 * Document styles shared by the editor and read-only views, so a policy looks
 * the same while writing it as when reading it.
 */
export const RICH_DOCUMENT_CLASS = cn(
  "text-sm leading-relaxed text-[#3D421F]",
  "[&_p]:my-0 [&_p+p]:mt-2.5",
  "[&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:font-serif [&_h2]:text-lg [&_h2]:font-semibold [&_h2:first-child]:mt-0",
  "[&_h3]:mb-1.5 [&_h3]:mt-4 [&_h3]:text-[15px] [&_h3]:font-semibold [&_h3:first-child]:mt-0",
  "[&_h4]:mb-1 [&_h4]:mt-3 [&_h4]:font-semibold",
  "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6",
  "[&_ul_ul]:my-1 [&_ul_ul]:list-[circle] [&_li]:my-0.5 [&_li>p]:my-0",
  "[&_blockquote]:my-2 [&_blockquote]:border-l-[3px] [&_blockquote]:border-[var(--venue-primary,#818a40)]/40 [&_blockquote]:pl-3 [&_blockquote]:text-black/65",
  "[&_a]:text-[var(--venue-primary,#818a40)] [&_a]:underline",
  "[&_hr]:my-4 [&_hr]:border-black/10",
);

export function RichTextEditor({
  id,
  value,
  onChange,
  placeholder = "Write the policy…",
  minHeight = "22rem",
}: {
  id?: string;
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: string;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        code: false,
        codeBlock: false,
        link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
      }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({ placeholder }),
    ],
    content: value,
    editorProps: {
      attributes: {
        ...(id ? { id } : {}),
        class: cn(
          RICH_DOCUMENT_CLASS,
          "min-h-full px-4 py-3 outline-none",
          "[&_.is-editor-empty:first-child]:before:pointer-events-none [&_.is-editor-empty:first-child]:before:float-left [&_.is-editor-empty:first-child]:before:h-0 [&_.is-editor-empty:first-child]:before:text-black/35 [&_.is-editor-empty:first-child]:before:content-[attr(data-placeholder)]",
        ),
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  return (
    <div className="overflow-hidden rounded-md border border-black/10 bg-white focus-within:border-[var(--venue-primary,#818a40)]/50 focus-within:ring-2 focus-within:ring-[var(--venue-primary,#818a40)]/20">
      {editor ? <Toolbar editor={editor} /> : <div className="h-10 border-b border-black/10 bg-[#faf9f6]" />}
      <div className="overflow-y-auto" style={{ minHeight, maxHeight: "60vh" }}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      paragraph: e.isActive("paragraph"),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      link: e.isActive("link"),
      left: e.isActive({ textAlign: "left" }),
      center: e.isActive({ textAlign: "center" }),
      right: e.isActive({ textAlign: "right" }),
      canSink: e.can().sinkListItem("listItem"),
      canLift: e.can().liftListItem("listItem"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });

  const chain = () => editor.chain().focus();

  function setLink() {
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link address (leave empty to remove)", previous ?? "https://");
    if (url === null) return;
    if (!url.trim()) {
      chain().extendMarkRange("link").unsetLink().run();
      return;
    }
    chain().extendMarkRange("link").setLink({ href: url.trim() }).run();
  }

  function tidy() {
    const text = editor.getText({ blockSeparator: "\n" });
    if (!text.trim()) return;
    editor.chain().focus().setContent(tidyPastedTextToHtml(text), { emitUpdate: true }).run();
  }

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="flex flex-wrap items-center gap-0.5 border-b border-black/10 bg-[#faf9f6] px-1.5 py-1"
    >
      <Tool icon={Pilcrow} label="Paragraph" active={state.paragraph} onClick={() => chain().setParagraph().run()} />
      <Tool icon={Heading2} label="Heading" active={state.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()} />
      <Tool icon={Heading3} label="Sub-heading" active={state.h3} onClick={() => chain().toggleHeading({ level: 3 }).run()} />
      <Divider />
      <Tool icon={Bold} label="Bold (⌘B)" active={state.bold} onClick={() => chain().toggleBold().run()} />
      <Tool icon={Italic} label="Italic (⌘I)" active={state.italic} onClick={() => chain().toggleItalic().run()} />
      <Tool icon={Underline} label="Underline (⌘U)" active={state.underline} onClick={() => chain().toggleUnderline().run()} />
      <Tool icon={Strikethrough} label="Strikethrough" active={state.strike} onClick={() => chain().toggleStrike().run()} />
      <Divider />
      <Tool icon={List} label="Bullet list" active={state.bullet} onClick={() => chain().toggleBulletList().run()} />
      <Tool icon={ListOrdered} label="Numbered list" active={state.ordered} onClick={() => chain().toggleOrderedList().run()} />
      <Tool icon={IndentIncrease} label="Indent (Tab)" disabled={!state.canSink} onClick={() => chain().sinkListItem("listItem").run()} />
      <Tool icon={IndentDecrease} label="Outdent (Shift+Tab)" disabled={!state.canLift} onClick={() => chain().liftListItem("listItem").run()} />
      <Divider />
      <Tool icon={AlignLeft} label="Align left" active={state.left} onClick={() => chain().setTextAlign("left").run()} />
      <Tool icon={AlignCenter} label="Align center" active={state.center} onClick={() => chain().setTextAlign("center").run()} />
      <Tool icon={AlignRight} label="Align right" active={state.right} onClick={() => chain().setTextAlign("right").run()} />
      <Divider />
      <Tool icon={Quote} label="Quote" active={state.quote} onClick={() => chain().toggleBlockquote().run()} />
      <Tool icon={Minus} label="Divider line" onClick={() => chain().setHorizontalRule().run()} />
      <Tool icon={Link2} label="Link" active={state.link} onClick={setLink} />
      <Divider />
      <Tool icon={Undo2} label="Undo (⌘Z)" disabled={!state.canUndo} onClick={() => chain().undo().run()} />
      <Tool icon={Redo2} label="Redo (⇧⌘Z)" disabled={!state.canRedo} onClick={() => chain().redo().run()} />
      <button
        type="button"
        onClick={tidy}
        title="Turn pasted text into headings and bullet lists (• and o lines). Undo with ⌘Z."
        className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-[#3D421F] hover:bg-black/5"
      >
        <Wand2 className="size-3.5" />
        Tidy pasted text
      </button>
    </div>
  );
}

function Tool({
  icon: Icon,
  label,
  active,
  disabled,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-md transition disabled:opacity-30",
        active
          ? "bg-[var(--venue-primary,#818a40)]/15 text-[#3D421F]"
          : "text-black/55 hover:bg-black/5 hover:text-[#3D421F]",
      )}
    >
      <Icon className="size-4" />
    </button>
  );
}

function Divider() {
  return <span className="mx-1 h-5 w-px bg-black/10" aria-hidden />;
}

/** Read-only rendering of sanitized rich HTML (sanitized on the server). */
export function RichDocument({ html, className }: { html: string; className?: string }) {
  return (
    <div
      className={cn(RICH_DOCUMENT_CLASS, className)}
      // Server-sanitized policy HTML (see lib/hr/policy-html.ts).
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
