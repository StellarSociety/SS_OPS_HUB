"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  AlignLeft,
  ArrowDown,
  ArrowUp,
  Calendar,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronsUpDown,
  CircleDot,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Flag,
  Globe,
  GripVertical,
  Hash,
  Heading,
  Image,
  ImagePlus,
  Images,
  ListChecks,
  ListCollapse,
  ListTodo,
  ListTree,
  Mail,
  Paperclip,
  Phone,
  Plus,
  Settings2,
  Split,
  Table2,
  ToggleLeft,
  Trash2,
  Type,
  type LucideIcon,
} from "lucide-react";
import { QrFrame } from "@/components/guests-intel/qr-frame";
import { HiringCopyEditor } from "@/components/hr/hiring-copy-editor";
import { HiringDialog } from "@/components/hr/hiring-dialog";
import {
  RightClickMenu,
  rightClickMenuItemClass,
} from "@/components/layout/right-click-menu";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import {
  rotateHiringFormLink,
  saveHiringForm,
  saveHiringFormBlocks,
  uploadHiringIntroImage,
} from "@/lib/actions/hr-hiring";
import {
  DEFAULT_HIRING_FIELD_CONFIG,
  DEFAULT_HIRING_BODY_BACKGROUND,
  DEFAULT_HIRING_INTRO_BACKGROUND,
  DEFAULT_HIRING_INTRO2_BACKGROUND,
  HIRING_COPY_FIRST_NAME_TOKEN,
  HIRING_COPY_NAME_TOKEN,
  HIRING_COPY_POSITIONS_TOKEN,
  formatHiringPositionNames,
  hiringHexIsDark,
  HIRING_FIELD_PLACEHOLDERS,
  HIRING_FIELD_TYPE_LABELS,
  HIRING_FIELD_TYPES,
  DEFAULT_HIRING_OPTIONS,
  hiringFieldHasOptions,
  hiringFieldPlaceholder,
  hiringFieldShowsPlaceholder,
  type HiringFieldType,
  type HiringForm,
  type HiringFormBlock,
  type HiringFormStatus,
  hiringBodyPageLabel,
  hiringBodyPageNumberAt,
} from "@/lib/hr/hiring/types";
import {
  clusterHiringRadioFields,
  flattenHiringRadioClusters,
  hiringMatrixCopy,
  hiringMatrixFieldLabel,
  hiringRadioClusterIds,
} from "@/lib/hr/hiring/matrix";
import type { Department, Position } from "@/lib/hr/types";
import { normalizeHexColor } from "@/lib/venue/branding-validation";
import { pillSubNavLinkClass, pillSubNavShellClass } from "@/lib/sub-nav-ui";
import { cn } from "@/lib/utils";

type DraftBlock = {
  id: string;
  kind: "title" | "description" | "field" | "page";
  title: string;
  description: string;
  field_label: string;
  field_type: HiringFieldType;
  required: boolean;
  allowNumbers: boolean;
  allowSymbols: boolean;
  allowPunctuation: boolean;
  maxFileMb: number;
  maxFiles: number;
  computeAge: boolean;
  placeholder: string;
  instructions: string;
  options: string[];
};

function toDraft(block: HiringFormBlock): DraftBlock {
  return {
    id: block.id,
    kind: block.kind,
    title: block.title ?? "",
    description: block.description ?? "",
    field_label: block.field_label ?? "",
    field_type: block.field_type ?? "short_text",
    required: block.required,
    allowNumbers: block.config.allowNumbers,
    allowSymbols: block.config.allowSymbols,
    allowPunctuation: block.config.allowPunctuation,
    maxFileMb: block.config.maxFileMb,
    maxFiles: block.config.maxFiles,
    computeAge: block.config.computeAge,
    placeholder: hiringFieldPlaceholder(
      block.field_type ?? "short_text",
      block.config.placeholder,
    ),
    instructions: block.config.instructions,
    options: [...block.config.options],
  };
}

function createDraftBlock(kind: DraftBlock["kind"]): DraftBlock {
  return {
    id: crypto.randomUUID(),
    kind,
    title: kind === "title" ? "Section title" : "",
    description: kind === "description" ? "Describe this section." : "",
    field_label: kind === "field" ? "New field" : "",
    field_type: "short_text",
    required: kind === "field",
    ...DEFAULT_HIRING_FIELD_CONFIG,
    placeholder: HIRING_FIELD_PLACEHOLDERS.short_text,
    options: [...DEFAULT_HIRING_OPTIONS],
  };
}

function allowHiringBlockContextMenu(
  event: { target: EventTarget },
  canEdit: boolean,
  pending: boolean,
) {
  if (!canEdit || pending) return false;
  const target = event.target;
  if (!(target instanceof Element)) return true;
  return !target.closest("input, textarea, select, [contenteditable='true']");
}

function blockPreview(block: DraftBlock): string {
  if (block.kind === "page") return "Page division";
  if (block.kind === "title") return block.title.trim() || "Untitled";
  if (block.kind === "description") {
    const text = block.description
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) return "Description";
    return text.length > 80 ? `${text.slice(0, 77)}…` : text;
  }
  const type = HIRING_FIELD_TYPE_LABELS[block.field_type];
  const name = block.field_label.trim() || "Field";
  return `${name}${block.required ? " *" : ""} · ${type}`;
}

function matrixPreview(items: DraftBlock[]): string {
  const copy = hiringMatrixCopy(items);
  const title = copy.title.trim() || "Radio grid";
  const required = items.some((item) => item.required);
  const rows = copy.rows.filter(Boolean).join(", ");
  return `${title}${required ? " *" : ""} · Radio grid${rows ? ` · ${rows}` : ""}`;
}

const HIRING_BLOCK_KIND_THEME: Record<
  DraftBlock["kind"],
  {
    card: string;
    button: string;
    grip: string;
    muted: string;
    preview: string;
    action: string;
  }
> = {
  title: {
    card: "bg-[var(--venue-primary,#818a40)] border-[#6d7534]",
    button:
      "bg-[var(--venue-primary,#818a40)]/15 text-[#3D421F] hover:bg-[var(--venue-primary,#818a40)]/25 border border-[var(--venue-primary,#818a40)]/35",
    grip: "text-white/60 hover:bg-white/10 hover:text-white",
    muted: "text-white/80",
    preview: "text-white",
    action: "text-white/70 hover:bg-white/10 hover:text-white",
  },
  description: {
    card: "bg-[#D8DEB4] border-[#c3cb96]",
    button:
      "bg-[#D8DEB4]/45 text-[#3D421F] hover:bg-[#D8DEB4]/80 border border-[#c3cb96]/70",
    grip: "text-[#3D421F]/40 hover:bg-black/5 hover:text-[#3D421F]",
    muted: "text-[#3D421F]/55",
    preview: "text-[#3D421F]",
    action: "text-[#3D421F]/50 hover:bg-black/5 hover:text-[#3D421F]",
  },
  field: {
    card: "bg-white border-black/10",
    button:
      "bg-white/70 text-[#3D421F]/80 hover:bg-white hover:text-[#3D421F] border border-black/10",
    grip: "text-black/35 hover:bg-black/5 hover:text-[#3D421F]",
    muted: "text-black/40",
    preview: "text-[#3D421F]",
    action: "text-black/40 hover:bg-black/5 hover:text-[#3D421F]",
  },
  page: {
    card: "bg-[#B0B0B0] border-[#9a9a9a]",
    button:
      "bg-[#B0B0B0]/35 text-[#3D421F]/80 hover:bg-[#B0B0B0]/55 hover:text-[#3D421F] border border-[#9a9a9a]/55",
    grip: "text-[#3D421F]/45 hover:bg-black/5 hover:text-[#3D421F]",
    muted: "text-[#3D421F]/70",
    preview: "text-[#3D421F]",
    action: "text-[#3D421F]/55 hover:bg-black/5 hover:text-[#3D421F]",
  },
};

const addBlockButtonClass = "h-7 px-2.5 text-xs font-normal shadow-none";

const selectClass =
  "h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F]";

const HIRING_FIELD_TYPE_ICONS: Record<HiringFieldType, LucideIcon> = {
  short_text: Type,
  long_text: AlignLeft,
  date: Calendar,
  number: Hash,
  email: Mail,
  phone: Phone,
  nationality: Globe,
  yes_no: ToggleLeft,
  dropdown: ChevronsUpDown,
  radio: CircleDot,
  checkbox: CheckSquare,
  multiple_choice: ListTodo,
  picture: Image,
  file: Paperclip,
};

function HiringFieldTypeSelect({
  value,
  onChange,
  disabled,
}: {
  value: HiringFieldType;
  onChange: (next: HiringFieldType) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLUListElement>(null);
  const [panelPos, setPanelPos] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const SelectedIcon = HIRING_FIELD_TYPE_ICONS[value];

  function updatePanelPos() {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.max(rect.width, 224);
    const left = Math.min(
      Math.max(8, rect.left),
      window.innerWidth - width - 8,
    );
    const gap = 4;
    const padding = 8;
    const spaceBelow = window.innerHeight - rect.bottom - gap - padding;
    const spaceAbove = rect.top - gap - padding;
    const estimatedHeight = HIRING_FIELD_TYPES.length * 36 + 8;
    const openUp =
      spaceBelow < Math.min(estimatedHeight, 280) && spaceAbove > spaceBelow;
    const available = Math.max(160, Math.floor(openUp ? spaceAbove : spaceBelow));
    const height = Math.min(estimatedHeight, available);
    const top = openUp
      ? Math.max(padding, rect.top - gap - height)
      : rect.bottom + gap;
    setPanelPos({ top, left, width, maxHeight: available });
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
    function onDoc(event: MouseEvent) {
      const target = event.target as Node;
      if (
        rootRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onReposition() {
      updatePanelPos();
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Expected input"
        onClick={() => setOpen((current) => !current)}
        className={cn(
          selectClass,
          "flex items-center gap-2 bg-neutral-100 text-left",
        )}
      >
        <SelectedIcon className="h-4 w-4 shrink-0 text-[#3D421F]/70" />
        <span className="min-w-0 flex-1 truncate">
          {HIRING_FIELD_TYPE_LABELS[value]}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-black/35" />
      </button>
      {open && panelPos && typeof document !== "undefined"
        ? createPortal(
            <ul
              ref={panelRef}
              role="listbox"
              style={{
                top: panelPos.top,
                left: panelPos.left,
                width: panelPos.width,
                maxHeight: panelPos.maxHeight,
              }}
              className="fixed z-[90] overflow-y-auto rounded-xl border border-black/10 bg-white py-1 shadow-lg"
            >
              {HIRING_FIELD_TYPES.map((type) => {
                const Icon = HIRING_FIELD_TYPE_ICONS[type];
                const selected = type === value;
                return (
                  <li key={type} role="option" aria-selected={selected}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-2 text-sm text-[#3D421F] hover:bg-[var(--venue-secondary,#F0F3DD)]",
                        selected && "bg-[var(--venue-secondary,#F0F3DD)]",
                      )}
                      onClick={() => {
                        onChange(type);
                        setOpen(false);
                      }}
                    >
                      <Icon className="h-4 w-4 shrink-0 text-[#3D421F]/70" />
                      <span className="min-w-0 flex-1 text-left">
                        {HIRING_FIELD_TYPE_LABELS[type]}
                      </span>
                      {selected ? (
                        <Check className="h-4 w-4 shrink-0 text-[var(--venue-primary,#818a40)]" />
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>,
            document.body,
          )
        : null}
    </div>
  );
}

type EditorTab = "intro" | "intro2" | "body" | "end";

const EDITOR_TABS: {
  id: EditorTab;
  label: string;
  shortLabel?: string;
  icon: LucideIcon;
}[] = [
  { id: "intro", label: "Company Intro", shortLabel: "Company", icon: Image },
  {
    id: "intro2",
    label: "Department Intro",
    shortLabel: "Department",
    icon: Images,
  },
  { id: "body", label: "Body", icon: ListChecks },
  { id: "end", label: "End page", icon: Flag },
];

export function HiringFormEditor({
  form,
  blocks,
  departments,
  positions,
  formUrl,
  formQrSvg,
  canEdit,
}: {
  form: HiringForm;
  blocks: HiringFormBlock[];
  departments: Department[];
  positions: Position[];
  formUrl: string;
  formQrSvg: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [section, setSection] = useState<EditorTab>("intro");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [emailSettingsOpen, setEmailSettingsOpen] = useState(false);
  const [name, setName] = useState(form.name);
  const [introDescription, setIntroDescription] = useState(form.intro_description);
  const [introButton, setIntroButton] = useState(form.intro_button_label);
  const [introImage, setIntroImage] = useState(form.intro_image_url);
  const [introBackground, setIntroBackground] = useState(
    form.intro_background_color || DEFAULT_HIRING_INTRO_BACKGROUND,
  );
  const [intro2Image, setIntro2Image] = useState(form.intro2_image_url);
  const [intro2Background, setIntro2Background] = useState(
    form.intro2_background_color || DEFAULT_HIRING_INTRO2_BACKGROUND,
  );
  const [intro2Title, setIntro2Title] = useState(form.intro2_title);
  const [intro2Description, setIntro2Description] = useState(
    form.intro2_description,
  );
  const [intro2Button, setIntro2Button] = useState(form.intro2_button_label);
  const [intro2DepartmentId, setIntro2DepartmentId] = useState(
    form.intro2_department_id ?? "",
  );
  const [intro2PositionIds, setIntro2PositionIds] = useState<string[]>(
    form.intro2_position_ids,
  );
  const [bodyBackground, setBodyBackground] = useState(
    form.body_background_color || DEFAULT_HIRING_BODY_BACKGROUND,
  );
  const [endMessage, setEndMessage] = useState(form.end_message);
  const [showSocials, setShowSocials] = useState(form.show_socials);
  const [status, setStatus] = useState<HiringFormStatus>(form.status);
  const [acceptFrom, setAcceptFrom] = useState(form.accept_from ?? "");
  const [acceptUntil, setAcceptUntil] = useState(form.accept_until ?? "");
  const [maxEntries, setMaxEntries] = useState(
    form.max_entries != null ? String(form.max_entries) : "",
  );
  const [requestSubject, setRequestSubject] = useState(
    form.interview_request_subject,
  );
  const [requestBody, setRequestBody] = useState(form.interview_request_body);
  const [confirmSubject, setConfirmSubject] = useState(
    form.interview_confirm_subject,
  );
  const [confirmBody, setConfirmBody] = useState(form.interview_confirm_body);
  const [confirmVideoSubject, setConfirmVideoSubject] = useState(
    form.interview_confirm_video_subject,
  );
  const [confirmVideoBody, setConfirmVideoBody] = useState(
    form.interview_confirm_video_body,
  );
  const [requestEmailOpen, setRequestEmailOpen] = useState(false);
  const [confirmEmailOpen, setConfirmEmailOpen] = useState(false);
  const [confirmVideoEmailOpen, setConfirmVideoEmailOpen] = useState(false);
  const [drafts, setDrafts] = useState<DraftBlock[]>(() => blocks.map(toDraft));
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropId, setDropId] = useState<string | null>(null);
  const [dropWhere, setDropWhere] = useState<"before" | "after" | null>(null);
  const [showFieldDetails, setShowFieldDetails] = useState(true);
  const [fieldDetailOpen, setFieldDetailOpen] = useState<Record<string, boolean>>(
    {},
  );
  const bodyClusters = useMemo(
    () => clusterHiringRadioFields(drafts),
    [drafts],
  );

  useEffect(() => {
    setName(form.name);
    setIntroDescription(form.intro_description);
    setIntroButton(form.intro_button_label);
    setIntroImage(form.intro_image_url);
    setIntroBackground(
      form.intro_background_color || DEFAULT_HIRING_INTRO_BACKGROUND,
    );
    setIntro2Image(form.intro2_image_url);
    setIntro2Background(
      form.intro2_background_color || DEFAULT_HIRING_INTRO2_BACKGROUND,
    );
    setIntro2Title(form.intro2_title);
    setIntro2Description(form.intro2_description);
    setIntro2Button(form.intro2_button_label);
    setIntro2DepartmentId(form.intro2_department_id ?? "");
    setIntro2PositionIds(form.intro2_position_ids);
    setBodyBackground(
      form.body_background_color || DEFAULT_HIRING_BODY_BACKGROUND,
    );
    setEndMessage(form.end_message);
    setShowSocials(form.show_socials);
    setStatus(form.status);
    setAcceptFrom(form.accept_from ?? "");
    setAcceptUntil(form.accept_until ?? "");
    setMaxEntries(form.max_entries != null ? String(form.max_entries) : "");
    setRequestSubject(form.interview_request_subject);
    setRequestBody(form.interview_request_body);
    setConfirmSubject(form.interview_confirm_subject);
    setConfirmBody(form.interview_confirm_body);
    setConfirmVideoSubject(form.interview_confirm_video_subject);
    setConfirmVideoBody(form.interview_confirm_video_body);
    setDrafts(blocks.map(toDraft));
  }, [form, blocks]);

  const liveUrl = useMemo(() => {
    if (typeof window === "undefined") return formUrl;
    try {
      const path = new URL(formUrl, window.location.origin).pathname;
      return `${window.location.origin}${path}`;
    } catch {
      return formUrl;
    }
  }, [formUrl]);

  const departmentPositions = useMemo(
    () =>
      intro2DepartmentId
        ? positions.filter(
            (position) => position.department_id === intro2DepartmentId,
          )
        : [],
    [intro2DepartmentId, positions],
  );
  const selectedPositionNames = useMemo(
    () =>
      intro2PositionIds
        .map(
          (id) =>
            departmentPositions.find((position) => position.id === id)?.name ??
            positions.find((position) => position.id === id)?.name ??
            "",
        )
        .filter(Boolean),
    [departmentPositions, intro2PositionIds, positions],
  );
  const positionsTokenPreview = formatHiringPositionNames(
    selectedPositionNames,
  );

  function updateDraft(id: string, patch: Partial<DraftBlock>) {
    setDrafts((current) =>
      current.map((block) => (block.id === id ? { ...block, ...patch } : block)),
    );
  }

  function updateDrafts(ids: string[], patch: Partial<DraftBlock>) {
    setDrafts((current) =>
      current.map((block) =>
        ids.includes(block.id) ? { ...block, ...patch } : block,
      ),
    );
  }

  function moveDraft(id: string, direction: -1 | 1) {
    setDrafts((current) => {
      const clusters = clusterHiringRadioFields(current);
      const index = clusters.findIndex((cluster) =>
        hiringRadioClusterIds(cluster).includes(id),
      );
      const next = index + direction;
      if (index < 0 || next < 0 || next >= clusters.length) return current;
      const copy = [...clusters];
      const [item] = copy.splice(index, 1);
      copy.splice(next, 0, item!);
      return flattenHiringRadioClusters(copy);
    });
  }

  function reorderDraft(
    draggedId: string,
    targetId: string,
    where: "before" | "after" = "before",
  ) {
    setDrafts((current) => {
      const clusters = clusterHiringRadioFields(current);
      const from = clusters.findIndex((cluster) =>
        hiringRadioClusterIds(cluster).includes(draggedId),
      );
      if (from < 0) return current;
      const copy = [...clusters];
      const [item] = copy.splice(from, 1);
      let insertAt = copy.findIndex((cluster) =>
        hiringRadioClusterIds(cluster).includes(targetId),
      );
      if (insertAt < 0 || !item) return current;
      if (where === "after") insertAt += 1;
      copy.splice(insertAt, 0, item);
      return flattenHiringRadioClusters(copy);
    });
  }

  function isBlockDetailsOpen(block: DraftBlock) {
    if (block.kind === "page") return false;
    return fieldDetailOpen[block.id] ?? showFieldDetails;
  }

  function toggleBlockDetails(blockId: string) {
    setFieldDetailOpen((current) => ({
      ...current,
      [blockId]: !(current[blockId] ?? showFieldDetails),
    }));
  }

  function clearDropTarget() {
    setDropId(null);
    setDropWhere(null);
  }

  function addBlock(kind: DraftBlock["kind"]) {
    setDrafts((current) => [...current, createDraftBlock(kind)]);
  }

  function addBlockAt(
    anchorId: string,
    where: "before" | "after",
    kind: DraftBlock["kind"],
  ) {
    setDrafts((current) => {
      const index = current.findIndex((block) => block.id === anchorId);
      const next = createDraftBlock(kind);
      if (index < 0) return [...current, next];
      const copy = [...current];
      copy.splice(where === "before" ? index : index + 1, 0, next);
      return copy;
    });
    setShowFieldDetails(true);
  }

  function relabelMatrix(items: DraftBlock[], title: string, rows: string[]) {
    const ids = items.map((item) => item.id);
    setDrafts((current) =>
      current.map((block) => {
        const index = ids.indexOf(block.id);
        if (index < 0) return block;
        return {
          ...block,
          field_label: hiringMatrixFieldLabel(title, rows[index] ?? ""),
        };
      }),
    );
  }

  function mutateMatrixGroup(
    ids: string[],
    mutate: (group: DraftBlock[]) => DraftBlock[],
  ) {
    setDrafts((current) => {
      const start = current.findIndex((block) => block.id === ids[0]);
      if (start < 0) return current;
      const group = current.slice(start, start + ids.length);
      if (group.length !== ids.length) return current;
      const next = mutate(group);
      const copy = [...current];
      copy.splice(start, ids.length, ...next);
      return copy;
    });
  }

  function persistForm(patch: Parameters<typeof saveHiringForm>[1]) {
    return saveHiringForm(form.id, patch);
  }

  function persistBlocks() {
    return saveHiringFormBlocks(
      form.id,
      drafts.map((block) => ({
        id: block.id,
        kind: block.kind,
        title: block.title,
        description: block.description,
        field_label: block.field_label,
        field_type: block.field_type,
        required: block.required,
        config: {
          allowNumbers: block.allowNumbers,
          allowSymbols: block.allowSymbols,
          allowPunctuation: block.allowPunctuation,
          maxFileMb: block.maxFileMb,
          maxFiles: block.maxFiles,
          computeAge: block.computeAge,
          placeholder: block.placeholder,
          instructions: block.instructions,
          options: block.options,
        },
      })),
    );
  }

  function saveIntro() {
    if (!canEdit) return;
    startTransition(async () => {
      const result = await persistForm({
        name,
        intro_description: introDescription,
        intro_button_label: introButton,
        intro_background_color: introBackground,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.saved("Company intro saved.");
      router.refresh();
    });
  }

  function saveIntro2() {
    if (!canEdit) return;
    startTransition(async () => {
      const result = await persistForm({
        name,
        intro2_description: intro2Description,
        intro2_button_label: intro2Button,
        intro2_background_color: intro2Background,
        intro2_department_id: intro2DepartmentId || null,
        intro2_position_ids: intro2PositionIds,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.saved("Department intro saved.");
      router.refresh();
    });
  }

  function saveBody() {
    if (!canEdit) return;
    startTransition(async () => {
      const formResult = await persistForm({
        name,
        body_background_color: bodyBackground,
      });
      if (!formResult.ok) {
        toast.error(formResult.error);
        return;
      }
      const blocksResult = await persistBlocks();
      if (!blocksResult.ok) {
        toast.error(blocksResult.error);
        return;
      }
      toast.saved("Body saved.");
      router.refresh();
    });
  }

  function saveEnd() {
    if (!canEdit) return;
    startTransition(async () => {
      const result = await persistForm({
        name,
        end_message: endMessage,
        show_socials: showSocials,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.saved("End page saved.");
      router.refresh();
    });
  }

  function saveSettings() {
    if (!canEdit) return;
    startTransition(async () => {
      const result = await persistForm({
        name,
        intro2_title: intro2Title,
        status,
        accept_from: acceptFrom || null,
        accept_until: acceptUntil || null,
        max_entries: maxEntries ? Number(maxEntries) : null,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.saved("Settings saved.");
      router.refresh();
    });
  }

  function saveEmailSettings() {
    if (!canEdit) return;
    startTransition(async () => {
      const result = await persistForm({
        interview_request_subject: requestSubject,
        interview_request_body: requestBody,
        interview_confirm_subject: confirmSubject,
        interview_confirm_body: confirmBody,
        interview_confirm_video_subject: confirmVideoSubject,
        interview_confirm_video_body: confirmVideoBody,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.saved("Email settings saved.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={!canEdit || pending}
            aria-label="Internal form name"
            className="max-w-md font-serif text-lg"
          />
          <p className="text-xs text-black/45">
            Internal name — applicants never see this.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={liveUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-md bg-[var(--venue-secondary,#F0F3DD)] px-4 text-sm font-medium text-[#3D421F] hover:opacity-90"
          >
            <ExternalLink className="h-4 w-4" />
            Preview form
          </a>
          <Button
            type="button"
            variant="secondary"
            aria-label="Email settings"
            onClick={() => setEmailSettingsOpen(true)}
          >
            <Mail className="h-4 w-4" />
            Settings
          </Button>
          <Button
            type="button"
            variant="secondary"
            aria-label="Form settings"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 className="h-4 w-4" />
            Settings
          </Button>
        </div>
      </div>

      <hr className="border-black/10" />

      <nav
        aria-label="Form sections"
        className={cn(
          pillSubNavShellClass,
          "flex-nowrap overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        )}
      >
        {EDITOR_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = section === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`hiring-editor-${tab.id}`}
              className={cn(pillSubNavLinkClass(active), "min-h-11 shrink-0 sm:min-h-0")}
              onClick={() => setSection(tab.id)}
            >
              <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
              {tab.shortLabel ? (
                <>
                  <span className="sm:hidden">{tab.shortLabel}</span>
                  <span className="hidden sm:inline">{tab.label}</span>
                </>
              ) : (
                tab.label
              )}
            </button>
          );
        })}
      </nav>

      {section === "intro" ? (
      <Card id="hiring-editor-intro" className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-serif text-2xl text-[#3D421F]">Company Intro</h2>
            <p className="text-sm text-black/50">
              Centered first screen applicants see before the questionnaire.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {canEdit ? (
              <Button type="button" disabled={pending} onClick={saveIntro}>
                {pending ? "Saving…" : "Save"}
              </Button>
            ) : null}
          </div>
        </div>
        <HiringIntroImageField
          imageUrl={introImage}
          previewBackground={introBackground}
          canEdit={canEdit}
          pending={pending}
          onUpload={(file) => {
            startTransition(async () => {
              const result = await uploadHiringIntroSlot(form.id, "intro", file);
              if (!result.ok) {
                toast.error(result.error);
                return;
              }
              setIntroImage(result.url);
              toast.saved("Company intro image uploaded.");
            });
          }}
        />
        <HiringIntroColorField
          id="intro-background"
          value={introBackground}
          onChange={setIntroBackground}
          fallback={DEFAULT_HIRING_INTRO_BACKGROUND}
          hint={`Fills the company intro screen. Default matches the current image (${DEFAULT_HIRING_INTRO_BACKGROUND}).`}
          disabled={!canEdit || pending}
        />
        <div className="space-y-1.5">
          <Label htmlFor="intro-copy">Description</Label>
          <HiringCopyEditor
            id="intro-copy"
            value={introDescription}
            onChange={setIntroDescription}
            disabled={!canEdit || pending}
            rows={6}
            aria-label="Intro description"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="intro-button">Button</Label>
          <Input
            id="intro-button"
            value={introButton}
            onChange={(event) => setIntroButton(event.target.value)}
            disabled={!canEdit || pending}
          />
        </div>
      </Card>
      ) : null}

      {section === "intro2" ? (
      <Card id="hiring-editor-intro2" className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-serif text-2xl text-[#3D421F]">Department Intro</h2>
            <p className="text-sm text-black/50">
              Optional department screen after the company intro. Leave it empty
              to skip it.
            </p>
          </div>
          {canEdit ? (
            <Button
              type="button"
              className="shrink-0"
              disabled={pending}
              onClick={saveIntro2}
            >
              {pending ? "Saving…" : "Save"}
            </Button>
          ) : null}
        </div>
        <HiringIntroImageField
          imageUrl={intro2Image}
          previewBackground={intro2Background}
          layout="wide"
          canEdit={canEdit}
          pending={pending}
          onUpload={(file) => {
            startTransition(async () => {
              const result = await uploadHiringIntroSlot(form.id, "intro2", file);
              if (!result.ok) {
                toast.error(result.error);
                return;
              }
              setIntro2Image(result.url);
              toast.saved("Department intro image uploaded.");
            });
          }}
        />
        <HiringIntroColorField
          id="intro2-background"
          value={intro2Background}
          onChange={setIntro2Background}
          fallback={DEFAULT_HIRING_INTRO2_BACKGROUND}
          hint={`Fills the department intro screen. Default is light gray (${DEFAULT_HIRING_INTRO2_BACKGROUND}).`}
          disabled={!canEdit || pending}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="intro2-department">Department</Label>
            <SearchableSelect
              id="intro2-department"
              value={intro2DepartmentId}
              onChange={(next) => {
                setIntro2DepartmentId(next);
                setIntro2PositionIds((current) =>
                  current.filter((id) =>
                    positions.some(
                      (position) =>
                        position.id === id && position.department_id === next,
                    ),
                  ),
                );
              }}
              options={departments.map((department) => ({
                value: department.id,
                label: department.name,
              }))}
              placeholder="Select department"
              searchPlaceholder="Search department…"
              disabled={!canEdit || pending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="intro2-positions">Positions</Label>
            <SearchableMultiSelect
              id="intro2-positions"
              values={intro2PositionIds}
              onChange={setIntro2PositionIds}
              options={departmentPositions.map((position) => ({
                value: position.id,
                label: position.name,
              }))}
              placeholder={
                intro2DepartmentId
                  ? "Select positions"
                  : "Choose a department first"
              }
              searchPlaceholder="Search position…"
              disabled={!canEdit || pending || !intro2DepartmentId}
              aria-label="Open positions"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="intro2-copy">Description</Label>
          <p className="text-xs text-black/45">
            Insert {HIRING_COPY_POSITIONS_TOKEN} to list the selected positions,
            separated by commas
            {positionsTokenPreview
              ? ` — currently “${positionsTokenPreview}”.`
              : "."}
          </p>
          <HiringCopyEditor
            id="intro2-copy"
            value={intro2Description}
            onChange={setIntro2Description}
            disabled={!canEdit || pending}
            rows={6}
            aria-label="Department intro description"
            tokens={[
              {
                insert: HIRING_COPY_POSITIONS_TOKEN,
                label: HIRING_COPY_POSITIONS_TOKEN,
              },
            ]}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="intro2-button">Button</Label>
          <Input
            id="intro2-button"
            value={intro2Button}
            onChange={(event) => setIntro2Button(event.target.value)}
            disabled={!canEdit || pending}
            placeholder="Continue"
          />
        </div>
      </Card>
      ) : null}

      {section === "body" ? (
      <Card id="hiring-editor-body" className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-serif text-2xl text-[#3D421F]">Body</h2>
            <p className="text-sm text-black/50">Questionnaire applicants complete.</p>
          </div>
          {canEdit ? (
            <div className="flex flex-wrap items-start gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className={cn(
                  addBlockButtonClass,
                  HIRING_BLOCK_KIND_THEME.title.button,
                )}
                onClick={() => addBlock("title")}
              >
                Add title
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className={cn(
                  addBlockButtonClass,
                  HIRING_BLOCK_KIND_THEME.description.button,
                )}
                onClick={() => addBlock("description")}
              >
                Add description
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className={cn(
                  addBlockButtonClass,
                  HIRING_BLOCK_KIND_THEME.field.button,
                )}
                onClick={() => addBlock("field")}
              >
                Add field
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className={cn(
                  addBlockButtonClass,
                  HIRING_BLOCK_KIND_THEME.page.button,
                )}
                onClick={() => addBlock("page")}
              >
                Add page
              </Button>
              <div className="flex flex-col items-end gap-2">
                <Button type="button" disabled={pending} onClick={saveBody}>
                  {pending ? "Saving…" : "Save"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  onClick={() => {
                    setShowFieldDetails((open) => !open);
                    setFieldDetailOpen({});
                  }}
                  aria-label={showFieldDetails ? "Hide details" : "Show details"}
                  title={showFieldDetails ? "Hide details" : "Show details"}
                >
                  {showFieldDetails ? (
                    <ListCollapse className="h-4 w-4" aria-hidden />
                  ) : (
                    <ListTree className="h-4 w-4" aria-hidden />
                  )}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
        <HiringIntroColorField
          id="body-background"
          value={bodyBackground}
          onChange={setBodyBackground}
          fallback={DEFAULT_HIRING_BODY_BACKGROUND}
          hint="Fills the questionnaire screen. Default matches the rest of the app (#FAF9F6)."
          disabled={!canEdit || pending}
        />
        <div className="space-y-3">
          {drafts.some((block) => block.kind === "page") ? (
            <BodyPageBanner pageNumber={1} />
          ) : null}
          {bodyClusters.map((cluster, clusterIndex) => {
            if (cluster.type === "matrix") {
              const items = cluster.items;
              const first = items[0]!;
              const last = items[items.length - 1]!;
              const ids = items.map((item) => item.id);
              const copy = hiringMatrixCopy(items);
              return (
                <HiringEditorRadioMatrixCard
                  key={first.id}
                  items={items}
                  copy={copy}
                  clusterIndex={clusterIndex}
                  clusterCount={bodyClusters.length}
                  canEdit={canEdit}
                  pending={pending}
                  detailsOpen={isBlockDetailsOpen(first)}
                  dragId={dragId}
                  dropId={dropId}
                  dropWhere={dropWhere}
                  onInsert={(where, kind) =>
                    addBlockAt(
                      where === "before" ? first.id : last.id,
                      where,
                      kind,
                    )
                  }
                  onToggleDetails={() => toggleBlockDetails(first.id)}
                  onMove={(direction) => moveDraft(first.id, direction)}
                  onRemove={() =>
                    setDrafts((current) =>
                      current.filter((item) => !ids.includes(item.id)),
                    )
                  }
                  onDragStart={(id) => {
                    setDragId(id);
                    clearDropTarget();
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    clearDropTarget();
                  }}
                  onDragOver={(id, where) => {
                    if (dropId !== id) setDropId(id);
                    if (dropWhere !== where) setDropWhere(where);
                  }}
                  onDragLeave={(id, related, currentTarget) => {
                    if (currentTarget.contains(related)) return;
                    setDropId((current) => (current === id ? null : current));
                    setDropWhere((current) =>
                      dropId === id ? null : current,
                    );
                  }}
                  onDrop={(targetId, where, dragged) => {
                    if (dragged) reorderDraft(dragged, targetId, where);
                    setDragId(null);
                    clearDropTarget();
                  }}
                  onTitleChange={(title) =>
                    relabelMatrix(items, title, copy.rows)
                  }
                  onRowChange={(index, row) => {
                    const rows = [...copy.rows];
                    rows[index] = row;
                    relabelMatrix(items, copy.title, rows);
                  }}
                  onInstructionsChange={(instructions) =>
                    updateDrafts(ids, { instructions })
                  }
                  onOptionsChange={(options) => updateDrafts(ids, { options })}
                  onRequiredChange={(required) =>
                    updateDrafts(ids, { required })
                  }
                  onTypeChange={(field_type) => {
                    const previousDefault =
                      HIRING_FIELD_PLACEHOLDERS[first.field_type];
                    const custom = first.placeholder.trim();
                    const keepOptions = hiringFieldHasOptions(first.field_type);
                    updateDrafts(ids, {
                      field_type,
                      placeholder:
                        !custom || custom === previousDefault
                          ? HIRING_FIELD_PLACEHOLDERS[field_type]
                          : first.placeholder,
                      options:
                        hiringFieldHasOptions(field_type) && !keepOptions
                          ? [...DEFAULT_HIRING_OPTIONS]
                          : first.options,
                    });
                  }}
                  onAddRow={() =>
                    mutateMatrixGroup(ids, (group) => {
                      const lastRow = group[group.length - 1]!;
                      const meta = hiringMatrixCopy(group);
                      return [
                        ...group,
                        {
                          ...lastRow,
                          id: crypto.randomUUID(),
                          field_label: hiringMatrixFieldLabel(
                            meta.title,
                            `Row ${group.length + 1}`,
                          ),
                        },
                      ];
                    })
                  }
                  onRemoveRow={(index) =>
                    mutateMatrixGroup(ids, (group) =>
                      group.filter((_, rowIndex) => rowIndex !== index),
                    )
                  }
                  onMoveRow={(index, direction) =>
                    mutateMatrixGroup(ids, (group) => {
                      const next = index + direction;
                      if (next < 0 || next >= group.length) return group;
                      const copyGroup = [...group];
                      const [row] = copyGroup.splice(index, 1);
                      copyGroup.splice(next, 0, row!);
                      return copyGroup;
                    })
                  }
                />
              );
            }
            const block = cluster.item;
            const index = drafts.findIndex((item) => item.id === block.id);
            const detailsOpen = isBlockDetailsOpen(block);
            const kindTheme = HIRING_BLOCK_KIND_THEME[block.kind];
            return (
            <RightClickMenu
              key={block.id}
              ariaLabel="Insert questionnaire block"
              menuClassName="w-52"
              shouldHandle={(event) =>
                allowHiringBlockContextMenu(event, canEdit, pending)
              }
              renderMenu={(close) => (
                <HiringInsertMenu
                  close={close}
                  onInsert={(where, kind) => addBlockAt(block.id, where, kind)}
                />
              )}
            >
            <div
              onDragOver={(event) => {
                if (!canEdit || pending || !dragId || dragId === block.id) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                const rect = event.currentTarget.getBoundingClientRect();
                const where =
                  event.clientY < rect.top + rect.height / 2 ? "before" : "after";
                if (dropId !== block.id) setDropId(block.id);
                if (dropWhere !== where) setDropWhere(where);
              }}
              onDragLeave={(event) => {
                if (event.currentTarget.contains(event.relatedTarget as Node)) {
                  return;
                }
                setDropId((current) => (current === block.id ? null : current));
                setDropWhere((current) =>
                  dropId === block.id ? null : current,
                );
              }}
              onDrop={(event) => {
                event.preventDefault();
                const dragged =
                  event.dataTransfer.getData("text/plain") || dragId;
                const rect = event.currentTarget.getBoundingClientRect();
                const where =
                  event.clientY < rect.top + rect.height / 2 ? "before" : "after";
                if (dragged) reorderDraft(dragged, block.id, where);
                setDragId(null);
                clearDropTarget();
              }}
              className={cn(
                "relative rounded-xl border p-4 transition-colors",
                kindTheme.card,
                dragId === block.id &&
                  "border-[var(--venue-primary,#818a40)]/40 opacity-60",
              )}
            >
              {dragId && dropId === block.id && dropWhere && dragId !== block.id ? (
                <div
                  className={cn(
                    "pointer-events-none absolute -left-1 -right-1 z-20 flex items-center",
                    dropWhere === "before" ? "-top-2.5" : "-bottom-2.5",
                  )}
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--venue-primary,#818a40)] shadow-[0_0_0_3px_rgba(129,138,64,0.28)]" />
                  <span className="h-1.5 min-w-0 flex-1 rounded-full bg-[var(--venue-primary,#818a40)] shadow-[0_0_12px_var(--venue-primary,#818a40)]" />
                </div>
              ) : null}
              <div
                className={cn(
                  "flex items-center justify-between gap-2",
                  detailsOpen && "mb-3",
                )}
              >
                <div className="flex min-w-0 items-center gap-2">
                  {canEdit ? (
                    <button
                      type="button"
                      draggable={!pending}
                      disabled={pending}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", block.id);
                        setDragId(block.id);
                        clearDropTarget();
                      }}
                      onDragEnd={() => {
                        setDragId(null);
                        clearDropTarget();
                      }}
                      className={cn(
                        "cursor-grab rounded p-1 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40",
                        kindTheme.grip,
                      )}
                      title="Drag to reorder"
                      aria-label={`Drag to reorder ${blockPreview(block)}`}
                    >
                      <GripVertical className="h-4 w-4" />
                    </button>
                  ) : null}
                  {block.kind === "page" ? (
                    <p
                      className={cn(
                        "min-w-0 flex-1 text-center text-xs font-semibold uppercase tracking-[0.22em]",
                        kindTheme.preview,
                      )}
                    >
                      {hiringBodyPageLabel(
                        hiringBodyPageNumberAt(drafts, index),
                      )}
                    </p>
                  ) : (
                    <>
                      <p
                        className={cn(
                          "shrink-0 text-xs font-semibold uppercase tracking-wide",
                          kindTheme.muted,
                        )}
                      >
                        {block.kind === "field" ? "Field" : block.kind}
                      </p>
                      {!detailsOpen ? (
                        <p
                          className={cn(
                            "min-w-0 truncate text-sm",
                            kindTheme.preview,
                          )}
                        >
                          {blockPreview(block)}
                        </p>
                      ) : null}
                    </>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  {block.kind !== "page" ? (
                    <button
                      type="button"
                      className={cn("rounded-md p-1", kindTheme.action)}
                      onClick={() => toggleBlockDetails(block.id)}
                      aria-expanded={detailsOpen}
                      aria-label={
                        detailsOpen ? "Hide field details" : "Show field details"
                      }
                      title={detailsOpen ? "Hide details" : "Show details"}
                    >
                      {detailsOpen ? (
                        <ChevronDown className="h-4 w-4" aria-hidden />
                      ) : (
                        <ChevronRight className="h-4 w-4" aria-hidden />
                      )}
                    </button>
                  ) : null}
                {canEdit ? (
                  <>
                    <button
                      type="button"
                      className={cn("rounded-md p-1", kindTheme.action)}
                      onClick={() => moveDraft(block.id, -1)}
                      disabled={clusterIndex === 0}
                      aria-label="Move up"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className={cn("rounded-md p-1", kindTheme.action)}
                      onClick={() => moveDraft(block.id, 1)}
                      disabled={clusterIndex === bodyClusters.length - 1}
                      aria-label="Move down"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className={cn(
                        "rounded-md p-1",
                        kindTheme.action,
                        "hover:bg-red-50 hover:text-red-700",
                      )}
                      onClick={() =>
                        setDrafts((current) =>
                          current.filter((item) => item.id !== block.id),
                        )
                      }
                      aria-label="Remove"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </>
                ) : null}
                </div>
              </div>
              {detailsOpen && block.kind === "title" ? (
                <Input
                  value={block.title}
                  onChange={(event) =>
                    updateDraft(block.id, { title: event.target.value })
                  }
                  disabled={!canEdit || pending}
                  className="font-bold"
                />
              ) : null}
              {detailsOpen && block.kind === "description" ? (
                <div className="space-y-1.5">
                  <p className="text-xs text-black/45">
                    Insert {HIRING_COPY_NAME_TOKEN} for the applicant’s full
                    name as they type it, or {HIRING_COPY_FIRST_NAME_TOKEN} for
                    the first word.
                  </p>
                  <HiringCopyEditor
                    value={block.description}
                    onChange={(next) =>
                      updateDraft(block.id, { description: next })
                    }
                    disabled={!canEdit || pending}
                    rows={3}
                    aria-label="Section description"
                    tokens={[
                      {
                        insert: HIRING_COPY_NAME_TOKEN,
                        label: HIRING_COPY_NAME_TOKEN,
                      },
                      {
                        insert: HIRING_COPY_FIRST_NAME_TOKEN,
                        label: HIRING_COPY_FIRST_NAME_TOKEN,
                      },
                    ]}
                  />
                </div>
              ) : null}
              {detailsOpen && block.kind === "field" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Field name</Label>
                    <Input
                      value={block.field_label}
                      onChange={(event) =>
                        updateDraft(block.id, { field_label: event.target.value })
                      }
                      disabled={!canEdit || pending}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Expected input</Label>
                    <HiringFieldTypeSelect
                      value={block.field_type}
                      disabled={!canEdit || pending}
                      onChange={(field_type) => {
                        const previousDefault =
                          HIRING_FIELD_PLACEHOLDERS[block.field_type];
                        const custom = block.placeholder.trim();
                        const keepOptions = hiringFieldHasOptions(
                          block.field_type,
                        );
                        updateDraft(block.id, {
                          field_type,
                          placeholder:
                            !custom || custom === previousDefault
                              ? HIRING_FIELD_PLACEHOLDERS[field_type]
                              : block.placeholder,
                          options:
                            hiringFieldHasOptions(field_type) && !keepOptions
                              ? [...DEFAULT_HIRING_OPTIONS]
                              : block.options,
                        });
                      }}
                    />
                    {block.field_type === "phone" ? (
                      <p className="text-xs text-black/45">
                        Country code is filled automatically from the
                        applicant&apos;s location. They can still change it.
                      </p>
                    ) : null}
                    {block.field_type === "nationality" ? (
                      <p className="text-xs text-black/45">
                        Applicants search and pick from a list of countries.
                      </p>
                    ) : null}
                    {block.field_type === "yes_no" ? (
                      <p className="text-xs text-black/45">
                        Applicants choose Yes or No.
                      </p>
                    ) : null}
                    {block.field_type === "dropdown" ? (
                      <p className="text-xs text-black/45">
                        Applicants pick one choice from a drop-down list.
                      </p>
                    ) : null}
                    {block.field_type === "radio" ? (
                      <p className="text-xs text-black/45">
                        Applicants pick one choice. Consecutive radios with the
                        same choices appear as one grid on the application.
                      </p>
                    ) : null}
                    {block.field_type === "checkbox" ? (
                      <p className="text-xs text-black/45">
                        A single tick box. The field name is the statement they
                        agree to.
                      </p>
                    ) : null}
                    {block.field_type === "multiple_choice" ? (
                      <p className="text-xs text-black/45">
                        Applicants can tick more than one choice.
                      </p>
                    ) : null}
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Instructions</Label>
                    <Textarea
                      value={block.instructions}
                      onChange={(event) =>
                        updateDraft(block.id, {
                          instructions: event.target.value,
                        })
                      }
                      disabled={!canEdit || pending}
                      rows={1}
                      maxLength={400}
                      placeholder="Shown above the answer for applicants"
                      className="min-h-10 resize-y"
                    />
                  </div>
                  {hiringFieldShowsPlaceholder(block.field_type) ? (
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label>Placeholder text</Label>
                      {block.field_type === "long_text" ? (
                        <Textarea
                          value={block.placeholder}
                          onChange={(event) =>
                            updateDraft(block.id, {
                              placeholder: event.target.value,
                            })
                          }
                          disabled={!canEdit || pending}
                          rows={4}
                          maxLength={800}
                          placeholder={HIRING_FIELD_PLACEHOLDERS[block.field_type]}
                        />
                      ) : (
                        <Input
                          value={block.placeholder}
                          onChange={(event) =>
                            updateDraft(block.id, {
                              placeholder: event.target.value,
                            })
                          }
                          disabled={!canEdit || pending}
                          maxLength={800}
                          placeholder={HIRING_FIELD_PLACEHOLDERS[block.field_type]}
                        />
                      )}
                    </div>
                  ) : null}
                  {hiringFieldHasOptions(block.field_type) ? (
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Choices</Label>
                      <div className="space-y-2">
                        {block.options.map((option, index) => (
                          <div key={`${block.id}-opt-${index}`} className="flex gap-2">
                            <Input
                              value={option}
                              onChange={(event) => {
                                const options = [...block.options];
                                options[index] = event.target.value;
                                updateDraft(block.id, { options });
                              }}
                              disabled={!canEdit || pending}
                              placeholder={`Choice ${index + 1}`}
                            />
                            <Button
                              type="button"
                              variant="secondary"
                              size="icon"
                              disabled={
                                !canEdit || pending || block.options.length < 2
                              }
                              aria-label="Remove choice"
                              onClick={() =>
                                updateDraft(block.id, {
                                  options: block.options.filter(
                                    (_, optionIndex) => optionIndex !== index,
                                  ),
                                })
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-7 px-2.5 text-xs font-normal"
                        disabled={
                          !canEdit || pending || block.options.length >= 30
                        }
                        onClick={() =>
                          updateDraft(block.id, {
                            options: [
                              ...block.options,
                              `Option ${block.options.length + 1}`,
                            ],
                          })
                        }
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add choice
                      </Button>
                    </div>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[#3D421F] sm:col-span-2">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={block.required}
                      aria-label="Required"
                      disabled={!canEdit || pending}
                      onClick={() =>
                        updateDraft(block.id, { required: !block.required })
                      }
                      className={cn(
                        "inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-semibold transition-colors",
                        block.required
                          ? "border-[var(--venue-primary,#818a40)] bg-[var(--venue-primary,#818a40)] text-white"
                          : "border-black/15 bg-white text-[#3D421F]/70 hover:border-black/30",
                      )}
                    >
                      <span aria-hidden className="text-sm leading-none">
                        *
                      </span>
                      Required
                    </button>
                    {block.field_type === "short_text" ||
                    block.field_type === "long_text" ? (
                      <>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={block.allowNumbers}
                            disabled={!canEdit || pending}
                            onChange={(event) =>
                              updateDraft(block.id, {
                                allowNumbers: event.target.checked,
                              })
                            }
                          />
                          Allow numbers
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={block.allowSymbols}
                            disabled={!canEdit || pending}
                            onChange={(event) =>
                              updateDraft(block.id, {
                                allowSymbols: event.target.checked,
                              })
                            }
                          />
                          Allow symbols
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={block.allowPunctuation}
                            disabled={!canEdit || pending}
                            onChange={(event) =>
                              updateDraft(block.id, {
                                allowPunctuation: event.target.checked,
                              })
                            }
                          />
                          Allow punctuation
                        </label>
                      </>
                    ) : null}
                  </div>
                  {block.field_type === "date" ? (
                    <label className="flex items-center gap-2 text-sm text-[#3D421F] sm:col-span-2">
                      <input
                        type="checkbox"
                        checked={block.computeAge}
                        disabled={!canEdit || pending}
                        onChange={(event) =>
                          updateDraft(block.id, { computeAge: event.target.checked })
                        }
                      />
                      Show age from this date (date of birth)
                    </label>
                  ) : null}
                  {block.field_type === "file" || block.field_type === "picture" ? (
                    <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>Max file size (MB)</Label>
                        <Input
                          type="number"
                          min={1}
                          max={20}
                          value={block.maxFileMb}
                          disabled={!canEdit || pending}
                          onChange={(event) =>
                            updateDraft(block.id, {
                              maxFileMb: Number(event.target.value) || 1,
                            })
                          }
                        />
                      </div>
                      {block.field_type === "file" ? (
                        <div className="space-y-1.5">
                          <Label>Max files</Label>
                          <Input
                            type="number"
                            min={1}
                            max={5}
                            value={block.maxFiles}
                            disabled={!canEdit || pending}
                            onChange={(event) =>
                              updateDraft(block.id, {
                                maxFiles: Number(event.target.value) || 1,
                              })
                            }
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
            </RightClickMenu>
            );
          })}
          {drafts.length === 0 ? (
            <p className="text-sm text-black/45">No questions yet. Add a field.</p>
          ) : null}
        </div>
        {canEdit ? (
          <div className="flex justify-end">
            <Button type="button" disabled={pending} onClick={saveBody}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        ) : null}
      </Card>
      ) : null}

      {section === "end" ? (
      <Card id="hiring-editor-end" className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-serif text-2xl text-[#3D421F]">End page</h2>
            <p className="text-sm text-black/50">
              Shown after a successful submission.
            </p>
          </div>
          {canEdit ? (
            <Button
              type="button"
              className="shrink-0"
              disabled={pending}
              onClick={saveEnd}
            >
              {pending ? "Saving…" : "Save"}
            </Button>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="end-message">Confirmation message</Label>
          <p className="text-xs text-black/45">
            Insert {HIRING_COPY_NAME_TOKEN} or {HIRING_COPY_FIRST_NAME_TOKEN} to
            greet the applicant by name.
          </p>
          <HiringCopyEditor
            id="end-message"
            value={endMessage}
            onChange={setEndMessage}
            disabled={!canEdit || pending}
            rows={3}
            aria-label="Confirmation message"
            tokens={[
              {
                insert: HIRING_COPY_NAME_TOKEN,
                label: HIRING_COPY_NAME_TOKEN,
              },
              {
                insert: HIRING_COPY_FIRST_NAME_TOKEN,
                label: HIRING_COPY_FIRST_NAME_TOKEN,
              },
            ]}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-[#3D421F]">
          <input
            type="checkbox"
            checked={showSocials}
            disabled={!canEdit || pending}
            onChange={(event) => setShowSocials(event.target.checked)}
          />
          Show venue socials on the thank-you page
        </label>
      </Card>
      ) : null}

      <HiringDialog
        open={settingsOpen}
        title="Form settings"
        description="Set the public form name, share the link, and choose whether it is accepting replies."
        onClose={() => setSettingsOpen(false)}
        busy={pending}
        wide
        footer={
          canEdit ? (
            <Button type="button" disabled={pending} onClick={saveSettings}>
              {pending ? "Saving…" : "Save settings"}
            </Button>
          ) : null
        }
      >
        <div className="space-y-1.5">
          <Label htmlFor="public-form-name">Form name</Label>
          <Input
            id="public-form-name"
            value={intro2Title}
            onChange={(event) => setIntro2Title(event.target.value)}
            disabled={!canEdit || pending}
            placeholder="Shown to applicants"
          />
          <p className="text-xs text-black/45">
            Shown to applicants. The name at the top of this page is internal
            only.
          </p>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <Label>Status</Label>
            <select
              className={selectClass}
              value={status}
              disabled={!canEdit || pending}
              onChange={(event) =>
                setStatus(event.target.value as HiringFormStatus)
              }
            >
              <option value="live">Live</option>
              <option value="paused">Paused</option>
              <option value="scheduled">Accepting period</option>
            </select>
            {status === "scheduled" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>From</Label>
                  <DateInput
                    value={acceptFrom}
                    onChange={setAcceptFrom}
                    disabled={!canEdit || pending}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Until</Label>
                  <DateInput
                    value={acceptUntil}
                    onChange={setAcceptUntil}
                    disabled={!canEdit || pending}
                  />
                </div>
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="max-entries">Max entries</Label>
              <Input
                id="max-entries"
                type="number"
                min={1}
                value={maxEntries}
                onChange={(event) => setMaxEntries(event.target.value)}
                disabled={!canEdit || pending}
                placeholder="No limit"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Shareable link</Label>
              <div className="flex gap-2">
                <Input readOnly value={liveUrl} />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={async () => {
                    await navigator.clipboard.writeText(liveUrl);
                    toast.saved("Link copied.");
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              {canEdit ? (
                <button
                  type="button"
                  className="text-xs text-black/50 underline"
                  disabled={pending}
                  onClick={() => {
                    startTransition(async () => {
                      const result = await rotateHiringFormLink(form.id);
                      if (!result.ok) {
                        toast.error(result.error);
                        return;
                      }
                      toast.saved("New short link created.");
                      router.refresh();
                    });
                  }}
                >
                  Generate a new short link
                </button>
              ) : null}
            </div>
          </div>
          <div className="flex flex-col items-center">
            {formQrSvg ? (
              <QrFrame svg={formQrSvg} label="Hiring form QR" defaultSize="m" />
            ) : null}
          </div>
        </div>
      </HiringDialog>

      <HiringDialog
        open={emailSettingsOpen}
        title="Email settings"
        description="Set up the interview request and confirmation emails sent to applicants."
        onClose={() => setEmailSettingsOpen(false)}
        busy={pending}
        wide
        footer={
          canEdit ? (
            <Button type="button" disabled={pending} onClick={saveEmailSettings}>
              {pending ? "Saving…" : "Save email settings"}
            </Button>
          ) : null
        }
      >
        <div className="space-y-3">
          <InterviewEmailSetup
            title="Interview request email"
            open={requestEmailOpen}
            onToggle={() => setRequestEmailOpen((open) => !open)}
            subject={requestSubject}
            onSubjectChange={setRequestSubject}
            body={requestBody}
            onBodyChange={setRequestBody}
            disabled={!canEdit || pending}
          />
          <InterviewEmailSetup
            title="Interview confirmation — in person"
            open={confirmEmailOpen}
            onToggle={() => setConfirmEmailOpen((open) => !open)}
            subject={confirmSubject}
            onSubjectChange={setConfirmSubject}
            body={confirmBody}
            onBodyChange={setConfirmBody}
            disabled={!canEdit || pending}
          />
          <InterviewEmailSetup
            title="Interview confirmation — online"
            open={confirmVideoEmailOpen}
            onToggle={() => setConfirmVideoEmailOpen((open) => !open)}
            subject={confirmVideoSubject}
            onSubjectChange={setConfirmVideoSubject}
            body={confirmVideoBody}
            onBodyChange={setConfirmVideoBody}
            disabled={!canEdit || pending}
          />
        </div>
        <InterviewEmailPlaceholderHelp />
      </HiringDialog>
    </div>
  );
}

function InterviewEmailPlaceholderHelp() {
  return (
    <div className="space-y-2 rounded-lg border border-black/10 bg-black/[0.02] px-3 py-3">
      <p className="text-xs font-medium text-[#3D421F]">
        Codes you can type in the subject or message — they are replaced when
        the email is sent:
      </p>
      <ul className="space-y-1 text-xs text-black/60">
        <li>
          <code className="rounded bg-white px-1 py-0.5 font-medium text-[#3D421F]">
            {"{name}"}
          </code>{" "}
          applicant&apos;s name
        </li>
        <li>
          <code className="rounded bg-white px-1 py-0.5 font-medium text-[#3D421F]">
            {"{venue}"}
          </code>{" "}
          this venue&apos;s name (for example Orilla)
        </li>
        <li>
          <code className="rounded bg-white px-1 py-0.5 font-medium text-[#3D421F]">
            {"{datetime}"}
          </code>{" "}
          interview date and time (confirmation email)
        </li>
        <li>
          <code className="rounded bg-white px-1 py-0.5 font-medium text-[#3D421F]">
            {"{details}"}
          </code>{" "}
          video-call link (online confirmation) or in-person location
          (in-person confirmation)
        </li>
      </ul>
    </div>
  );
}

function InterviewEmailSetup({
  title,
  open,
  onToggle,
  subject,
  onSubjectChange,
  body,
  onBodyChange,
  disabled,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  subject: string;
  onSubjectChange: (value: string) => void;
  body: string;
  onBodyChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--venue-primary,#818a40)]/30 bg-[var(--venue-secondary,#F0F3DD)]">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-medium text-[#3D421F] hover:bg-[var(--venue-primary,#818a40)]/10"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span>{title}</span>
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-[#3D421F]/60" aria-hidden />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-[#3D421F]/60" aria-hidden />
        )}
      </button>
      {open ? (
        <div className="space-y-2 border-t border-[var(--venue-primary,#818a40)]/20 px-3 py-3">
          <Input
            value={subject}
            onChange={(event) => onSubjectChange(event.target.value)}
            disabled={disabled}
            placeholder="Subject"
            aria-label={`${title} subject`}
            className="bg-white"
          />
          <Textarea
            value={body}
            onChange={(event) => onBodyChange(event.target.value)}
            disabled={disabled}
            rows={6}
            aria-label={`${title} body`}
            className="bg-white"
          />
        </div>
      ) : null}
    </div>
  );
}

async function uploadHiringIntroSlot(
  formId: string,
  slot: "intro" | "intro2",
  file: File,
) {
  const data = new FormData();
  data.set("image", file);
  data.set("slot", slot);
  return uploadHiringIntroImage(formId, data);
}

function HiringIntroImageField({
  imageUrl,
  previewBackground,
  layout = "compact",
  canEdit,
  pending,
  onUpload,
}: {
  imageUrl: string | null;
  previewBackground?: string;
  layout?: "compact" | "wide";
  canEdit: boolean;
  pending: boolean;
  onUpload: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const disabled = !canEdit || pending;
  const darkPreview = Boolean(
    previewBackground && hiringHexIsDark(previewBackground),
  );

  function takeImageFile(files: FileList | null | undefined) {
    if (!files?.length) return null;
    return (
      Array.from(files).find((file) => file.type.startsWith("image/")) ?? null
    );
  }

  function handleFiles(files: FileList | null | undefined) {
    if (disabled) return;
    const file = takeImageFile(files);
    if (file) onUpload(file);
  }

  return (
    <div className="space-y-3">
      <Label>Image</Label>
      <div
        role={canEdit ? "button" : undefined}
        aria-label={
          imageUrl
            ? "Intro image. Drag and drop or click to replace"
            : "Intro image. Drag and drop or click to upload"
        }
        tabIndex={canEdit && !pending ? 0 : undefined}
        className={cn(
          "relative rounded-xl border border-dashed p-3 transition-colors",
          layout === "wide" && "w-full",
          dragging
            ? "border-[var(--venue-primary,#818a40)]"
            : "border-black/15",
          canEdit &&
            !pending &&
            "cursor-pointer hover:border-[var(--venue-primary,#818a40)]/40",
          pending && "opacity-60",
        )}
        style={
          previewBackground
            ? { backgroundColor: previewBackground }
            : undefined
        }
        onClick={() => {
          if (!disabled) inputRef.current?.click();
        }}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragEnter={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (disabled) return;
          dragDepth.current += 1;
          setDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!disabled) event.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          event.stopPropagation();
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          dragDepth.current = 0;
          setDragging(false);
          handleFiles(event.dataTransfer.files);
        }}
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt=""
            className={cn(
              "pointer-events-none rounded-xl object-contain",
              layout === "wide"
                ? "mx-auto h-auto w-full"
                : "mx-auto max-h-40",
            )}
          />
        ) : (
          <div
            className={cn(
              "flex h-24 flex-col items-center justify-center gap-1 text-sm",
              darkPreview ? "text-white/70" : "text-black/45",
            )}
          >
            <ImagePlus className="h-5 w-5" />
            <span>
              {dragging
                ? "Drop image to upload"
                : "Drag & drop or click to upload"}
            </span>
          </div>
        )}
        {dragging && canEdit ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-[#3D421F]/55 text-sm font-medium text-white">
            {imageUrl ? "Drop to replace" : "Drop image to upload"}
          </div>
        ) : null}
      </div>
      {canEdit ? (
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-[#3D421F]">
          <ImagePlus className="h-4 w-4" />
          {imageUrl ? "Replace image" : "Upload image"}
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
            className="hidden"
            disabled={pending}
            onChange={(event) => {
              handleFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </label>
      ) : null}
    </div>
  );
}

function HiringRadioGridPreview({
  title,
  rows,
  options,
  required,
}: {
  title: string;
  rows: string[];
  options: string[];
  required: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-black/10 bg-[#FAF9F6] p-4">
      {title ? (
        <p className="text-base font-semibold text-[#3D421F]">
          {title}
          {required ? <span className="text-red-600"> *</span> : null}
        </p>
      ) : null}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[28rem] border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="w-[7.5rem] min-w-[6.5rem] pb-2 pr-3" />
              {options.map((option) => (
                <th
                  key={option}
                  className="min-w-[4.5rem] px-1 pb-2 text-center text-[11px] font-semibold leading-snug text-[#3D421F]"
                >
                  <span className="mx-auto block max-w-[5.5rem]">{option}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row}>
                <th
                  scope="row"
                  className="border-t border-black/10 py-1 pr-3 text-left text-sm font-medium text-[#3D421F]"
                >
                  {row || "Row"}
                </th>
                {options.map((option) => (
                  <td key={option} className="border-t border-black/10 p-0.5">
                    <span className="flex h-10 items-center justify-center rounded-xl">
                      <span
                        className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-black/25 bg-white"
                        aria-hidden
                      />
                      <span className="sr-only">
                        {row}: {option}
                      </span>
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HiringEditorRadioMatrixCard({
  items,
  copy,
  clusterIndex,
  clusterCount,
  canEdit,
  pending,
  detailsOpen,
  dragId,
  dropId,
  dropWhere,
  onInsert,
  onToggleDetails,
  onMove,
  onRemove,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  onTitleChange,
  onRowChange,
  onInstructionsChange,
  onOptionsChange,
  onRequiredChange,
  onTypeChange,
  onAddRow,
  onRemoveRow,
  onMoveRow,
}: {
  items: DraftBlock[];
  copy: { title: string; rows: string[]; instructions: string };
  clusterIndex: number;
  clusterCount: number;
  canEdit: boolean;
  pending: boolean;
  detailsOpen: boolean;
  dragId: string | null;
  dropId: string | null;
  dropWhere: "before" | "after" | null;
  onInsert: (where: "before" | "after", kind: DraftBlock["kind"]) => void;
  onToggleDetails: () => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDragOver: (id: string, where: "before" | "after") => void;
  onDragLeave: (
    id: string,
    related: Node | null,
    currentTarget: HTMLElement,
  ) => void;
  onDrop: (
    targetId: string,
    where: "before" | "after",
    dragged: string,
  ) => void;
  onTitleChange: (title: string) => void;
  onRowChange: (index: number, row: string) => void;
  onInstructionsChange: (instructions: string) => void;
  onOptionsChange: (options: string[]) => void;
  onRequiredChange: (required: boolean) => void;
  onTypeChange: (type: HiringFieldType) => void;
  onAddRow: () => void;
  onRemoveRow: (index: number) => void;
  onMoveRow: (index: number, direction: -1 | 1) => void;
}) {
  const first = items[0]!;
  const ids = items.map((item) => item.id);
  const kindTheme = HIRING_BLOCK_KIND_THEME.field;
  const dragging = Boolean(dragId && ids.includes(dragId));
  const options = first.options.length > 0 ? first.options : [...DEFAULT_HIRING_OPTIONS];
  const required = items.some((item) => item.required);

  return (
    <RightClickMenu
      ariaLabel="Insert questionnaire block"
      menuClassName="w-52"
      shouldHandle={(event) =>
        allowHiringBlockContextMenu(event, canEdit, pending)
      }
      renderMenu={(close) => (
        <HiringInsertMenu
          close={close}
          onInsert={(where, kind) => onInsert(where, kind)}
        />
      )}
    >
      <div
        onDragOver={(event) => {
          if (!canEdit || pending || !dragId || ids.includes(dragId)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          const rect = event.currentTarget.getBoundingClientRect();
          const where =
            event.clientY < rect.top + rect.height / 2 ? "before" : "after";
          onDragOver(first.id, where);
        }}
        onDragLeave={(event) => {
          onDragLeave(
            first.id,
            event.relatedTarget as Node | null,
            event.currentTarget,
          );
        }}
        onDrop={(event) => {
          event.preventDefault();
          const dragged = event.dataTransfer.getData("text/plain") || dragId;
          const rect = event.currentTarget.getBoundingClientRect();
          const where =
            event.clientY < rect.top + rect.height / 2 ? "before" : "after";
          if (dragged) onDrop(first.id, where, dragged);
        }}
        className={cn(
          "relative rounded-xl border p-4 transition-colors",
          kindTheme.card,
          dragging && "border-[var(--venue-primary,#818a40)]/40 opacity-60",
        )}
      >
        {dragId && dropId === first.id && dropWhere && !dragging ? (
          <div
            className={cn(
              "pointer-events-none absolute -left-1 -right-1 z-20 flex items-center",
              dropWhere === "before" ? "-top-2.5" : "-bottom-2.5",
            )}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--venue-primary,#818a40)] shadow-[0_0_0_3px_rgba(129,138,64,0.28)]" />
            <span className="h-1.5 min-w-0 flex-1 rounded-full bg-[var(--venue-primary,#818a40)] shadow-[0_0_12px_var(--venue-primary,#818a40)]" />
          </div>
        ) : null}
        <div
          className={cn(
            "flex items-center justify-between gap-2",
            detailsOpen && "mb-3",
          )}
        >
          <div className="flex min-w-0 items-center gap-2">
            {canEdit ? (
              <button
                type="button"
                draggable={!pending}
                disabled={pending}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", first.id);
                  onDragStart(first.id);
                }}
                onDragEnd={onDragEnd}
                className={cn(
                  "cursor-grab rounded p-1 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40",
                  kindTheme.grip,
                )}
                title="Drag to reorder"
                aria-label={`Drag to reorder ${matrixPreview(items)}`}
              >
                <GripVertical className="h-4 w-4" />
              </button>
            ) : null}
            <p
              className={cn(
                "shrink-0 text-xs font-semibold uppercase tracking-wide",
                kindTheme.muted,
              )}
            >
              Field
            </p>
            {!detailsOpen ? (
              <p className={cn("min-w-0 truncate text-sm", kindTheme.preview)}>
                {matrixPreview(items)}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              className={cn("rounded-md p-1", kindTheme.action)}
              onClick={onToggleDetails}
              aria-expanded={detailsOpen}
              aria-label={
                detailsOpen ? "Hide field details" : "Show field details"
              }
              title={detailsOpen ? "Hide details" : "Show details"}
            >
              {detailsOpen ? (
                <ChevronDown className="h-4 w-4" aria-hidden />
              ) : (
                <ChevronRight className="h-4 w-4" aria-hidden />
              )}
            </button>
            {canEdit ? (
              <>
                <button
                  type="button"
                  className={cn("rounded-md p-1", kindTheme.action)}
                  onClick={() => onMove(-1)}
                  disabled={clusterIndex === 0}
                  aria-label="Move up"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className={cn("rounded-md p-1", kindTheme.action)}
                  onClick={() => onMove(1)}
                  disabled={clusterIndex === clusterCount - 1}
                  aria-label="Move down"
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className={cn(
                    "rounded-md p-1",
                    kindTheme.action,
                    "hover:bg-red-50 hover:text-red-700",
                  )}
                  onClick={onRemove}
                  aria-label="Remove"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </>
            ) : null}
          </div>
        </div>
        {detailsOpen ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Field name</Label>
              <Input
                value={copy.title}
                onChange={(event) => onTitleChange(event.target.value)}
                disabled={!canEdit || pending}
                placeholder="English"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Expected input</Label>
              <HiringFieldTypeSelect
                value={first.field_type}
                disabled={!canEdit || pending}
                onChange={onTypeChange}
              />
              <p className="text-xs text-black/45">
                Shown as one radio grid on the application. Changing the
                expected input splits it into separate fields.
              </p>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Instructions</Label>
              <Textarea
                value={copy.instructions}
                onChange={(event) =>
                  onInstructionsChange(event.target.value)
                }
                disabled={!canEdit || pending}
                rows={1}
                maxLength={400}
                placeholder="Shown above the grid for applicants"
                className="min-h-10 resize-y"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Rows</Label>
              <div className="space-y-2">
                {copy.rows.map((row, index) => (
                  <div key={items[index]?.id ?? index} className="flex gap-2">
                    <Input
                      value={row}
                      onChange={(event) =>
                        onRowChange(index, event.target.value)
                      }
                      disabled={!canEdit || pending}
                      placeholder={`Row ${index + 1}`}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      disabled={!canEdit || pending || index === 0}
                      aria-label="Move row up"
                      onClick={() => onMoveRow(index, -1)}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      disabled={
                        !canEdit || pending || index === copy.rows.length - 1
                      }
                      aria-label="Move row down"
                      onClick={() => onMoveRow(index, 1)}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      disabled={!canEdit || pending || items.length < 2}
                      aria-label="Remove row"
                      onClick={() => onRemoveRow(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-7 px-2.5 text-xs font-normal"
                disabled={!canEdit || pending}
                onClick={onAddRow}
              >
                <Plus className="h-3.5 w-3.5" />
                Add row
              </Button>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Choices</Label>
              <div className="space-y-2">
                {options.map((option, index) => (
                  <div key={`${first.id}-opt-${index}`} className="flex gap-2">
                    <Input
                      value={option}
                      onChange={(event) => {
                        const next = [...options];
                        next[index] = event.target.value;
                        onOptionsChange(next);
                      }}
                      disabled={!canEdit || pending}
                      placeholder={`Choice ${index + 1}`}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      disabled={!canEdit || pending || options.length < 2}
                      aria-label="Remove choice"
                      onClick={() =>
                        onOptionsChange(
                          options.filter((_, optionIndex) => optionIndex !== index),
                        )
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-7 px-2.5 text-xs font-normal"
                disabled={!canEdit || pending || options.length >= 30}
                onClick={() =>
                  onOptionsChange([
                    ...options,
                    `Option ${options.length + 1}`,
                  ])
                }
              >
                <Plus className="h-3.5 w-3.5" />
                Add choice
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[#3D421F] sm:col-span-2">
              <button
                type="button"
                role="switch"
                aria-checked={required}
                aria-label="Required"
                disabled={!canEdit || pending}
                onClick={() => onRequiredChange(!required)}
                className={cn(
                  "inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-semibold transition-colors",
                  required
                    ? "border-[var(--venue-primary,#818a40)] bg-[var(--venue-primary,#818a40)] text-white"
                    : "border-black/15 bg-white text-[#3D421F]/70 hover:border-black/30",
                )}
              >
                <span aria-hidden className="text-sm leading-none">
                  *
                </span>
                Required
              </button>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="flex items-center gap-2">
                <Table2 className="h-3.5 w-3.5" />
                Applicant grid
              </Label>
              <HiringRadioGridPreview
                title={copy.title}
                rows={copy.rows}
                options={options.map((option) => option.trim()).filter(Boolean)}
                required={required}
              />
            </div>
          </div>
        ) : null}
      </div>
    </RightClickMenu>
  );
}

function BodyPageBanner({ pageNumber }: { pageNumber: number }) {
  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3 text-center",
        HIRING_BLOCK_KIND_THEME.page.card,
      )}
    >
      <p
        className={cn(
          "text-xs font-semibold uppercase tracking-[0.22em]",
          HIRING_BLOCK_KIND_THEME.page.preview,
        )}
      >
        {hiringBodyPageLabel(pageNumber)}
      </p>
    </div>
  );
}

const INSERT_BLOCK_OPTIONS: {
  kind: DraftBlock["kind"];
  label: string;
  icon: LucideIcon;
}[] = [
  { kind: "title", label: "Add title", icon: Heading },
  { kind: "description", label: "Add description", icon: AlignLeft },
  { kind: "field", label: "Add field", icon: ListChecks },
  { kind: "page", label: "Add page", icon: Split },
];

function HiringInsertMenu({
  close,
  onInsert,
}: {
  close: () => void;
  onInsert: (where: "before" | "after", kind: DraftBlock["kind"]) => void;
}) {
  const [step, setStep] = useState<"where" | "kind">("where");
  const [where, setWhere] = useState<"before" | "after">("before");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const first = rootRef.current?.querySelector<HTMLElement>("[role=menuitem]");
    first?.focus();
  }, [step]);

  useEffect(() => {
    if (step !== "kind") return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setStep("where");
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [step]);

  if (step === "where") {
    return (
      <div ref={rootRef}>
        {(["before", "after"] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="menuitem"
            className={rightClickMenuItemClass}
            onClick={() => {
              setWhere(option);
              setStep("kind");
            }}
          >
            <span className="min-w-0 flex-1">Add {option}</span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-black/30" aria-hidden />
          </button>
        ))}
      </div>
    );
  }

  return (
    <div ref={rootRef}>
      <button
        type="button"
        role="menuitem"
        className={rightClickMenuItemClass}
        onClick={() => setStep("where")}
      >
        <ChevronLeft className="h-3.5 w-3.5 shrink-0 text-black/40" aria-hidden />
        <span className="min-w-0 flex-1 font-medium text-[#3D421F]">
          {where === "before" ? "Add before" : "Add after"}
        </span>
      </button>
      <div className="my-1 border-t border-black/5" />
      {INSERT_BLOCK_OPTIONS.map((option) => (
        <button
          key={option.kind}
          type="button"
          role="menuitem"
          className={rightClickMenuItemClass}
          onClick={() => {
            onInsert(where, option.kind);
            close();
          }}
        >
          <option.icon className="h-3.5 w-3.5 shrink-0 text-black/40" aria-hidden />
          <span className="min-w-0 flex-1">{option.label}</span>
        </button>
      ))}
    </div>
  );
}

function HiringIntroColorField({
  id,
  value,
  onChange,
  fallback,
  hint,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  fallback: string;
  hint: string;
  disabled?: boolean;
}) {
  const pickerValue = normalizeHexColor(value) ?? fallback;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Background color</Label>
      <p className="text-xs text-black/45">{hint}</p>
      <div className="flex items-center gap-3">
        <input
          id={`${id}-picker`}
          type="color"
          value={pickerValue}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          className="h-10 w-12 cursor-pointer rounded-md border border-black/10 bg-white p-1"
          aria-label="Background color picker"
        />
        <Input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          placeholder={fallback}
          className={cn("max-w-[10rem] font-mono uppercase")}
        />
      </div>
    </div>
  );
}
