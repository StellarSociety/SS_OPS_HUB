"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  ExternalLink,
  Flag,
  Image,
  ImagePlus,
  Images,
  ListChecks,
  Settings2,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { QrFrame } from "@/components/guests-intel/qr-frame";
import { HiringCopyEditor } from "@/components/hr/hiring-copy-editor";
import { HiringDialog } from "@/components/hr/hiring-dialog";
import { ScopedLink } from "@/components/layout/scoped-link";
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
  DEFAULT_HIRING_INTRO_BACKGROUND,
  DEFAULT_HIRING_INTRO2_BACKGROUND,
  HIRING_COPY_POSITIONS_TOKEN,
  formatHiringPositionNames,
  hiringHexIsDark,
  HIRING_FIELD_TYPE_LABELS,
  HIRING_FIELD_TYPES,
  type HiringFieldType,
  type HiringForm,
  type HiringFormBlock,
  type HiringFormStatus,
} from "@/lib/hr/hiring/types";
import type { Department, Position } from "@/lib/hr/types";
import { normalizeHexColor } from "@/lib/venue/branding-validation";
import { pillSubNavLinkClass, pillSubNavShellClass } from "@/lib/sub-nav-ui";
import { cn } from "@/lib/utils";

type DraftBlock = {
  id: string;
  kind: "title" | "description" | "field";
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
  };
}

const selectClass =
  "h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F]";

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
  const [drafts, setDrafts] = useState<DraftBlock[]>(() => blocks.map(toDraft));

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

  function moveDraft(id: string, direction: -1 | 1) {
    setDrafts((current) => {
      const index = current.findIndex((block) => block.id === id);
      const next = index + direction;
      if (index < 0 || next < 0 || next >= current.length) return current;
      const copy = [...current];
      const [item] = copy.splice(index, 1);
      copy.splice(next, 0, item!);
      return copy;
    });
  }

  function addBlock(kind: DraftBlock["kind"]) {
    setDrafts((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        kind,
        title: kind === "title" ? "Section title" : "",
        description: kind === "description" ? "Describe this section." : "",
        field_label: kind === "field" ? "New field" : "",
        field_type: "short_text",
        required: false,
        ...DEFAULT_HIRING_FIELD_CONFIG,
      },
    ]);
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
        intro2_title: intro2Title,
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
      const formResult = await persistForm({ name });
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
        status,
        accept_from: acceptFrom || null,
        accept_until: acceptUntil || null,
        max_entries: maxEntries ? Number(maxEntries) : null,
        interview_request_subject: requestSubject,
        interview_request_body: requestBody,
        interview_confirm_subject: confirmSubject,
        interview_confirm_body: confirmBody,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.saved("Settings saved.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <ScopedLink
            href="/hr/hiring/forms"
            className="text-sm text-black/50 hover:text-[#3D421F]"
          >
            All forms
          </ScopedLink>
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
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-serif text-2xl text-[#3D421F]">Company Intro</h2>
            <p className="text-sm text-black/50">
              Centered first screen applicants see before the questionnaire.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={liveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-2 rounded-md bg-[var(--venue-secondary,#F0F3DD)] px-3 text-sm font-medium text-[#3D421F] hover:opacity-90"
            >
              <ExternalLink className="h-4 w-4" />
              Preview form
            </a>
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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-serif text-2xl text-[#3D421F]">Department Intro</h2>
            <p className="text-sm text-black/50">
              Optional department screen after the company intro. Leave it empty
              to skip it. The form name here is what applicants see — not the
              internal name above.
            </p>
          </div>
          {canEdit ? (
            <Button type="button" disabled={pending} onClick={saveIntro2}>
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
        <div className="space-y-1.5">
          <Label htmlFor="intro2-title">Form name</Label>
          <Input
            id="intro2-title"
            value={intro2Title}
            onChange={(event) => setIntro2Title(event.target.value)}
            disabled={!canEdit || pending}
            placeholder="Shown to applicants"
          />
        </div>
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
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={() => addBlock("title")}>
                Add title
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => addBlock("description")}
              >
                Add description
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => addBlock("field")}
              >
                Add field
              </Button>
              <Button type="button" disabled={pending} onClick={saveBody}>
                {pending ? "Saving…" : "Save"}
              </Button>
            </div>
          ) : null}
        </div>
        <div className="space-y-3">
          {drafts.map((block, index) => (
            <div
              key={block.id}
              className="rounded-xl border border-black/10 bg-white/70 p-4"
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-black/40">
                  {block.kind === "field" ? "Field" : block.kind}
                </p>
                {canEdit ? (
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className="rounded-md p-1 text-black/40 hover:bg-black/5"
                      onClick={() => moveDraft(block.id, -1)}
                      disabled={index === 0}
                      aria-label="Move up"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="rounded-md p-1 text-black/40 hover:bg-black/5"
                      onClick={() => moveDraft(block.id, 1)}
                      disabled={index === drafts.length - 1}
                      aria-label="Move down"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="rounded-md p-1 text-black/40 hover:bg-red-50 hover:text-red-700"
                      onClick={() =>
                        setDrafts((current) =>
                          current.filter((item) => item.id !== block.id),
                        )
                      }
                      aria-label="Remove"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ) : null}
              </div>
              {block.kind === "title" ? (
                <Input
                  value={block.title}
                  onChange={(event) =>
                    updateDraft(block.id, { title: event.target.value })
                  }
                  disabled={!canEdit || pending}
                />
              ) : null}
              {block.kind === "description" ? (
                <HiringCopyEditor
                  value={block.description}
                  onChange={(next) =>
                    updateDraft(block.id, { description: next })
                  }
                  disabled={!canEdit || pending}
                  rows={3}
                  aria-label="Section description"
                />
              ) : null}
              {block.kind === "field" ? (
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
                    <select
                      className={selectClass}
                      value={block.field_type}
                      disabled={!canEdit || pending}
                      onChange={(event) =>
                        updateDraft(block.id, {
                          field_type: event.target.value as HiringFieldType,
                        })
                      }
                    >
                      {HIRING_FIELD_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {HIRING_FIELD_TYPE_LABELS[type]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-[#3D421F] sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={block.required}
                      disabled={!canEdit || pending}
                      onChange={(event) =>
                        updateDraft(block.id, { required: event.target.checked })
                      }
                    />
                    Required
                  </label>
                  {block.field_type === "short_text" ||
                  block.field_type === "long_text" ? (
                    <div className="flex flex-wrap gap-4 text-sm text-[#3D421F] sm:col-span-2">
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
                    </div>
                  ) : null}
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
                          max={15}
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
          ))}
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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-serif text-2xl text-[#3D421F]">End page</h2>
            <p className="text-sm text-black/50">
              Shown after a successful submission.
            </p>
          </div>
          {canEdit ? (
            <Button type="button" disabled={pending} onClick={saveEnd}>
              {pending ? "Saving…" : "Save"}
            </Button>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="end-message">Confirmation message</Label>
          <HiringCopyEditor
            id="end-message"
            value={endMessage}
            onChange={setEndMessage}
            disabled={!canEdit || pending}
            rows={3}
            aria-label="Confirmation message"
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
        description="Share the public link, set whether the form is accepting replies, and edit interview emails."
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
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <Label>Interview request email</Label>
            <Input
              value={requestSubject}
              onChange={(event) => setRequestSubject(event.target.value)}
              disabled={!canEdit || pending}
              placeholder="Subject"
            />
            <Textarea
              value={requestBody}
              onChange={(event) => setRequestBody(event.target.value)}
              disabled={!canEdit || pending}
              rows={6}
            />
          </div>
          <div className="space-y-2">
            <Label>Interview confirmation email</Label>
            <Input
              value={confirmSubject}
              onChange={(event) => setConfirmSubject(event.target.value)}
              disabled={!canEdit || pending}
              placeholder="Subject"
            />
            <Textarea
              value={confirmBody}
              onChange={(event) => setConfirmBody(event.target.value)}
              disabled={!canEdit || pending}
              rows={6}
            />
          </div>
        </div>
        <p className="text-xs text-black/40">
          Placeholders: {"{name}"} {"{venue}"} {"{datetime}"} {"{details}"}
        </p>
      </HiringDialog>
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
