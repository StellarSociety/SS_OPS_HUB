"use client";

import { Reorder, useDragControls } from "framer-motion";
import { Check, GripVertical, Pencil, Pipette, Plus, Trash2, X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  deleteShiftTemplate,
  reorderShiftTemplates,
  upsertShiftTemplate,
} from "@/lib/actions/hr";
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

type DraftTemplate = ShiftTemplate & { isNew?: boolean };

type ShiftTemplatesEditorProps = {
  templates: ShiftTemplate[];
};

export function ShiftTemplatesEditor({ templates }: ShiftTemplatesEditorProps) {
  const [order, setOrder] = useState<DraftTemplate[]>(templates);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setOrder(templates);
    setEditingId((current) =>
      current?.startsWith("new:") ? current : null,
    );
  }, [templates]);

  function handleReorder(next: DraftTemplate[]) {
    setOrder(next);
    const persisted = next.filter((item) => !item.isNew).map((item) => item.id);
    if (persisted.length === 0) return;
    startTransition(() => {
      void reorderShiftTemplates(persisted);
    });
  }

  function addTemplate() {
    const draftId = `new:${crypto.randomUUID()}`;
    const colors = deriveScheduleLabelColors("#d1fae5");
    setOrder((current) => [
      ...current,
      {
        id: draftId,
        isNew: true,
        name: "",
        abbreviation: "",
        startTime: "11:00",
        endTime: "22:00",
        spansMidnight: false,
        bgColor: colors.bgColor,
        textColor: colors.textColor,
        borderColor: colors.borderColor,
        sortOrder: current.length + 1,
        isActive: true,
      },
    ]);
    setEditingId(draftId);
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <Reorder.Group
          axis="y"
          values={order}
          onReorder={handleReorder}
          className="min-w-[900px] space-y-1.5"
        >
          {order.map((item) => (
            <TemplateRow
              key={item.id}
              item={item}
              editing={editingId === item.id}
              onEdit={() => setEditingId(item.id)}
              onCancelEdit={() => {
                if (item.isNew) {
                  setOrder((current) =>
                    current.filter((row) => row.id !== item.id),
                  );
                }
                setEditingId(null);
              }}
              onSaved={() => setEditingId(null)}
            />
          ))}
        </Reorder.Group>
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="gap-1.5"
          onClick={addTemplate}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Add shift
        </Button>
      </div>
    </div>
  );
}

function TemplateRow({
  item,
  editing,
  onEdit,
  onCancelEdit,
  onSaved,
}: {
  item: DraftTemplate;
  editing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSaved: () => void;
}) {
  const controls = useDragControls();
  const [deleting, startDelete] = useTransition();
  const [saving, startSave] = useTransition();
  const [bgColor, setBgColor] = useState(item.bgColor);
  const [abbreviation, setAbbreviation] = useState(item.abbreviation);
  const [startTime, setStartTime] = useState(normalizeShiftTime(item.startTime));
  const [endTime, setEndTime] = useState(normalizeShiftTime(item.endTime));

  useEffect(() => {
    setBgColor(item.bgColor);
    setAbbreviation(item.abbreviation);
    setStartTime(normalizeShiftTime(item.startTime));
    setEndTime(normalizeShiftTime(item.endTime));
  }, [
    item.bgColor,
    item.abbreviation,
    item.startTime,
    item.endTime,
    item.id,
  ]);

  const previewColors = deriveScheduleLabelColors(bgColor);
  const previewStyle = scheduleDayLabelStyle({
    bgColor: previewColors.bgColor,
    textColor: previewColors.textColor,
    borderColor: previewColors.borderColor,
  });
  const overnight = shiftSpansMidnight(startTime, endTime);
  const rangeLabel = formatShiftRangeLabel(startTime, endTime);

  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragControls={controls}
      className="flex h-11 items-center gap-2 rounded-lg border border-black/10 bg-white px-2.5 shadow-sm"
    >
      <button
        type="button"
        onPointerDown={(event) => controls.start(event)}
        disabled={item.isNew}
        className="flex h-8 w-5 shrink-0 cursor-grab touch-none items-center justify-center text-black/25 transition-colors hover:text-black/60 active:cursor-grabbing disabled:cursor-default disabled:opacity-30"
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" aria-hidden />
      </button>

      <form
        className="flex min-w-0 flex-1 items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!editing) return;
          const formData = new FormData(event.currentTarget);
          startSave(async () => {
            await upsertShiftTemplate(formData);
            onSaved();
          });
        }}
      >
        {!item.isNew ? (
          <input type="hidden" name="id" value={item.id} />
        ) : null}
        <input type="hidden" name="sort_order" value={item.sortOrder} />
        <input type="hidden" name="bg_color" value={bgColor} />
        {overnight ? (
          <input type="hidden" name="spans_midnight" value="true" />
        ) : null}

        <Input
          name="abbreviation"
          value={abbreviation}
          onChange={(event) => setAbbreviation(event.target.value)}
          readOnly={!editing}
          placeholder="11–10"
          className={cn("h-8 w-[4.75rem] shrink-0", LIGHT_INPUT)}
          required
        />
        <Input
          name="name"
          defaultValue={item.name}
          readOnly={!editing}
          placeholder="Shift name"
          className={cn("h-8 min-w-0 flex-1", LIGHT_INPUT)}
          required
        />
        <Input
          type="time"
          name="start_time"
          value={startTime}
          onChange={(event) => setStartTime(event.target.value)}
          readOnly={!editing}
          className={cn("h-8 w-[7.25rem] shrink-0 tabular-nums", LIGHT_INPUT)}
          required
        />
        <span className="shrink-0 text-xs text-black/35" aria-hidden>
          →
        </span>
        <Input
          type="time"
          name="end_time"
          value={endTime}
          onChange={(event) => setEndTime(event.target.value)}
          readOnly={!editing}
          className={cn("h-8 w-[7.25rem] shrink-0 tabular-nums", LIGHT_INPUT)}
          required
        />

        <label
          className={cn(
            "relative flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-black/15 bg-white text-black/55 transition-colors hover:border-black/25 hover:text-[#3D421F]",
            !editing && "cursor-default opacity-50",
          )}
          title="Tag colour"
        >
          <Pipette className="h-3.5 w-3.5 pointer-events-none" aria-hidden />
          <span
            className="pointer-events-none absolute bottom-1 right-1 h-2 w-2 rounded-sm border border-black/15"
            style={{ backgroundColor: previewColors.bgColor }}
            aria-hidden
          />
          <input
            type="color"
            value={/^#[0-9a-fA-F]{6}$/.test(bgColor) ? bgColor : "#d1fae5"}
            disabled={!editing}
            onChange={(event) => setBgColor(event.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-default"
            aria-label="Tag background colour"
          />
        </label>

        <span
          className="inline-flex h-8 min-w-[3.5rem] shrink-0 items-center justify-center rounded-md border px-2 text-[10px] font-semibold uppercase tracking-wide"
          style={previewStyle}
          title={rangeLabel}
        >
          {abbreviation.trim() || "···"}
        </span>
        {overnight ? (
          <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-black/40">
            Overnight
          </span>
        ) : (
          <span className="w-[4.5rem] shrink-0" aria-hidden />
        )}

        <div className="ml-auto flex shrink-0 items-center gap-1">
          {editing ? (
            <>
              <Button
                type="submit"
                size="icon"
                variant="secondary"
                disabled={saving}
                className="h-8 w-8"
                aria-label="Save"
                title="Save"
              >
                <Check className="h-4 w-4" aria-hidden />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                disabled={saving}
                className="h-8 w-8 text-black/45"
                aria-label="Cancel"
                title="Cancel"
                onClick={onCancelEdit}
              >
                <X className="h-4 w-4" aria-hidden />
              </Button>
            </>
          ) : (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-black/45 hover:text-[#3D421F]"
              aria-label="Edit"
              title="Edit"
              onClick={onEdit}
            >
              <Pencil className="h-4 w-4" aria-hidden />
            </Button>
          )}
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Delete"
            title="Delete"
            disabled={deleting || item.isNew}
            className="h-8 w-8 text-black/35 hover:text-red-600"
            onClick={() => {
              if (
                !window.confirm(
                  `Delete "${item.abbreviation || item.name}"? Assigned schedule days keep SHIFT but lose this time.`,
                )
              ) {
                return;
              }
              startDelete(() => {
                void deleteShiftTemplate(item.id);
              });
            }}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </form>
    </Reorder.Item>
  );
}
