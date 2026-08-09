"use client";

import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from "react";
import { Pipette, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteShiftTemplate, upsertShiftTemplate } from "@/lib/actions/hr";
import {
  deriveScheduleLabelColors,
  formatShiftRangeLabel,
  normalizeShiftTime,
  scheduleDayLabelStyle,
  shiftSpansMidnight,
  type ShiftTemplate,
} from "@/lib/hr/schedules";
import { cn } from "@/lib/utils";

const LIGHT_INPUT =
  "border-black/15 bg-white text-black placeholder:text-black/40 focus-visible:ring-offset-white";

export function createDraftShiftTemplate(sortOrder: number): ShiftTemplate {
  const colors = deriveScheduleLabelColors("#d1fae5");
  return {
    id: `new:${crypto.randomUUID()}`,
    name: "",
    abbreviation: "",
    startTime: "11:00",
    endTime: "22:00",
    spansMidnight: false,
    bgColor: colors.bgColor,
    textColor: colors.textColor,
    borderColor: colors.borderColor,
    sortOrder,
    isActive: true,
  };
}

type ShiftTemplateEditDialogProps = {
  open: boolean;
  template: ShiftTemplate | null;
  onClose: () => void;
  onSaved: (next: ShiftTemplate) => void;
  onDeleted?: (id: string) => void;
  /** Opens another blank draft after a successful create/save. */
  onAddAnother?: () => void;
};

export function ShiftTemplateEditDialog({
  open,
  template,
  onClose,
  onSaved,
  onDeleted,
  onAddAnother,
}: ShiftTemplateEditDialogProps) {
  const titleId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [saving, startSave] = useTransition();
  const [deleting, startDelete] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [abbreviation, setAbbreviation] = useState("");
  const [startTime, setStartTime] = useState("11:00");
  const [endTime, setEndTime] = useState("21:00");
  const [bgColor, setBgColor] = useState("#d1fae5");
  const [sortOrder, setSortOrder] = useState(1);
  const [isActive, setIsActive] = useState(true);

  const isNew = Boolean(template?.id.startsWith("new:"));

  useEffect(() => {
    if (!open || !template) return;
    setError(null);
    setName(template.name);
    setAbbreviation(template.abbreviation);
    setStartTime(normalizeShiftTime(template.startTime));
    setEndTime(normalizeShiftTime(template.endTime));
    setBgColor(template.bgColor);
    setSortOrder(template.sortOrder);
    setIsActive(template.isActive);
  }, [open, template]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !template) return null;

  const colors = deriveScheduleLabelColors(bgColor);
  const overnight = shiftSpansMidnight(startTime, endTime);
  const rangeLabel = formatShiftRangeLabel(startTime, endTime);
  const previewStyle = scheduleDayLabelStyle({
    bgColor: colors.bgColor,
    textColor: colors.textColor,
    borderColor: colors.borderColor,
  });
  const busy = saving || deleting;

  function buildSavedTemplate(savedId: string): ShiftTemplate {
    return {
      ...template!,
      id: savedId,
      name: name.trim(),
      abbreviation: abbreviation.trim(),
      startTime: normalizeShiftTime(startTime),
      endTime: normalizeShiftTime(endTime),
      spansMidnight: overnight,
      bgColor: colors.bgColor,
      textColor: colors.textColor,
      borderColor: colors.borderColor,
      sortOrder,
      isActive,
    };
  }

  function persist(thenAddAnother: boolean) {
    const form = formRef.current;
    if (!form || !form.reportValidity()) return;
    setError(null);
    const formData = new FormData(form);
    startSave(async () => {
      const result = await upsertShiftTemplate(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved(buildSavedTemplate(result.id));
      if (thenAddAnother && onAddAnother) {
        onAddAnother();
        return;
      }
      onClose();
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    persist(false);
  }

  function handleDelete() {
    if (isNew) {
      onClose();
      return;
    }
    if (
      !window.confirm(
        `Delete "${abbreviation.trim() || name.trim() || "this shift"}"? Assigned schedule days keep SHIFT but lose this time.`,
      )
    ) {
      return;
    }
    setError(null);
    startDelete(async () => {
      const result = await deleteShiftTemplate(template!.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onDeleted?.(template!.id);
      onClose();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-[8vh] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-black/10 bg-[#faf9f6] shadow-xl">
        <div className="flex items-center justify-between border-b border-black/10 px-5 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-black/45">
              Shift times
            </p>
            <h2 id={titleId} className="font-serif text-xl text-[#3D421F]">
              {isNew ? "Add shift" : "Edit shift"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-black/45 transition-colors hover:bg-black/5 hover:text-[#3D421F]"
            aria-label="Close"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className="space-y-4 px-5 py-4"
        >
          {!isNew ? <input type="hidden" name="id" value={template.id} /> : null}
          <input type="hidden" name="bg_color" value={bgColor} />
          <input type="hidden" name="sort_order" value={sortOrder} />
          <input
            type="hidden"
            name="is_active"
            value={isActive ? "true" : "false"}
          />
          {overnight ? (
            <input type="hidden" name="spans_midnight" value="true" />
          ) : null}

          <div className="space-y-1.5">
            <label
              htmlFor="shift-edit-name"
              className="text-xs font-medium text-black/55"
            >
              Name
            </label>
            <Input
              id="shift-edit-name"
              name="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Shift name"
              className={cn("h-10", LIGHT_INPUT)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label
                htmlFor="shift-edit-abbr"
                className="text-xs font-medium text-black/55"
              >
                Abbreviation
              </label>
              <Input
                id="shift-edit-abbr"
                name="abbreviation"
                value={abbreviation}
                onChange={(event) => setAbbreviation(event.target.value)}
                placeholder="11–9"
                className={cn("h-10", LIGHT_INPUT)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-black/55">
                Tag preview
              </span>
              <div
                className="inline-flex h-10 w-full items-center justify-center rounded-md border px-2 text-[10px] font-semibold uppercase tracking-wide"
                style={previewStyle}
                title={rangeLabel}
              >
                {abbreviation.trim() || "···"}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label
                htmlFor="shift-edit-start"
                className="text-xs font-medium text-black/55"
              >
                Start
              </label>
              <Input
                id="shift-edit-start"
                type="time"
                name="start_time"
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
                className={cn("h-10 tabular-nums", LIGHT_INPUT)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="shift-edit-end"
                className="text-xs font-medium text-black/55"
              >
                End
              </label>
              <Input
                id="shift-edit-end"
                type="time"
                name="end_time"
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
                className={cn("h-10 tabular-nums", LIGHT_INPUT)}
                required
              />
            </div>
          </div>

          <div className="rounded-lg border border-black/10 bg-white/70 px-3 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-medium text-black/55">
                  Schedule chip
                </p>
                <p className="text-[11px] text-black/40">
                  How this shift appears on the roster palette
                </p>
              </div>
              <span
                className="inline-flex items-center rounded-md border px-2 py-1 text-[11px] font-semibold tracking-wide"
                style={previewStyle}
              >
                {rangeLabel}
              </span>
            </div>
            {overnight ? (
              <p className="mt-2 text-[10px] font-medium uppercase tracking-wide text-black/40">
                Overnight · ends next calendar day
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="relative inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-black/15 bg-white px-3 text-sm text-[#3D421F] transition-colors hover:border-black/25">
              <Pipette className="h-3.5 w-3.5 text-black/45" aria-hidden />
              Colour
              <span
                className="h-3.5 w-3.5 rounded-sm border border-black/15"
                style={{ backgroundColor: colors.bgColor }}
                aria-hidden
              />
              <input
                type="color"
                value={/^#[0-9a-fA-F]{6}$/.test(bgColor) ? bgColor : "#d1fae5"}
                onChange={(event) => setBgColor(event.target.value)}
                className="absolute inset-0 cursor-pointer opacity-0"
                aria-label="Tag background colour"
              />
            </label>
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-black/10 bg-white/70 px-3 py-2.5">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-black/20 text-[var(--venue-primary,#818a40)] focus:ring-[var(--venue-primary,#818a40)]"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-[#3D421F]">
                Active
              </span>
              <span className="block text-[11px] text-black/45">
                Inactive shifts stay in settings history but are hidden from the
                roster palette.
              </span>
            </span>
          </label>

          {error ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {error}
            </p>
          ) : null}

          <div className="flex flex-col gap-3 border-t border-black/10 pt-4">
            <div className="flex items-center justify-between gap-2">
              {!isNew ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={handleDelete}
                  className="gap-1.5 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  {deleting ? "Deleting…" : "Delete"}
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={onClose}
                  className="bg-black/[0.06] hover:bg-black/10"
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={busy}>
                  {saving ? "Saving…" : isNew ? "Add shift" : "Save"}
                </Button>
              </div>
            </div>
            {onAddAnother ? (
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                className="w-full gap-1.5"
                onClick={() => persist(true)}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Save & add another
              </Button>
            ) : null}
          </div>
        </form>
      </div>
    </div>
  );
}
