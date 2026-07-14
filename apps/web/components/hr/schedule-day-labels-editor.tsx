"use client";

import { Reorder, useDragControls } from "framer-motion";
import { Check, GripVertical, Pencil, Pipette, Plus, Trash2, X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  deleteScheduleDayLabel,
  reorderScheduleDayLabels,
  upsertScheduleDayLabel,
} from "@/lib/actions/hr";
import {
  deriveScheduleLabelColors,
  scheduleDayLabelStyle,
  type ScheduleDayLabel,
} from "@/lib/hr/schedules";
import { cn } from "@/lib/utils";

const LIGHT_INPUT =
  "border-black/15 bg-white text-black placeholder:text-black/40 focus-visible:ring-offset-white";

type DraftLabel = ScheduleDayLabel & { isNew?: boolean };

type ScheduleDayLabelsEditorProps = {
  labels: ScheduleDayLabel[];
  /** True when showing built-in fallbacks (not yet persisted). */
  usingDefaults?: boolean;
};

export function ScheduleDayLabelsEditor({
  labels,
  usingDefaults = false,
}: ScheduleDayLabelsEditorProps) {
  const [order, setOrder] = useState<DraftLabel[]>(labels);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setOrder(labels);
    setEditingId((current) =>
      current?.startsWith("new:") ? current : null,
    );
  }, [labels]);

  function handleReorder(next: DraftLabel[]) {
    setOrder(next);
    if (usingDefaults) return;
    const persisted = next.filter((item) => !item.isNew).map((item) => item.id);
    if (persisted.length === 0) return;
    startTransition(() => {
      void reorderScheduleDayLabels(persisted);
    });
  }

  function addLabel() {
    if (usingDefaults) return;
    const draftId = `new:${crypto.randomUUID()}`;
    const colors = deriveScheduleLabelColors("#e0f2fe");
    setOrder((current) => [
      ...current,
      {
        id: draftId,
        isNew: true,
        code: "",
        abbreviation: "",
        name: "",
        bgColor: colors.bgColor,
        textColor: colors.textColor,
        borderColor: colors.borderColor,
        sortOrder: current.length + 1,
      },
    ]);
    setEditingId(draftId);
  }

  return (
    <div className="space-y-3">
      {usingDefaults ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Showing built-in defaults. Apply the{" "}
          <code className="rounded bg-white/70 px-1">schedule_day_labels</code>{" "}
          migration, then refresh — after that, edits will save here.
        </p>
      ) : null}

      <div className="overflow-x-auto">
        <Reorder.Group
          axis="y"
          values={order}
          onReorder={handleReorder}
          className="min-w-[820px] space-y-1.5"
        >
          {order.map((item) => (
            <LabelRow
              key={item.id}
              item={item}
              locked={usingDefaults}
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

      {!usingDefaults ? (
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="gap-1.5"
            onClick={addLabel}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add label
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function LabelRow({
  item,
  locked,
  editing,
  onEdit,
  onCancelEdit,
  onSaved,
}: {
  item: DraftLabel;
  locked: boolean;
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
  const isPersisted = !item.isNew && !item.id.startsWith("default:");

  useEffect(() => {
    setBgColor(item.bgColor);
    setAbbreviation(item.abbreviation);
  }, [item.bgColor, item.abbreviation, item.id]);

  const previewColors = deriveScheduleLabelColors(bgColor);
  const previewStyle = scheduleDayLabelStyle({
    bgColor: previewColors.bgColor,
    textColor: previewColors.textColor,
    borderColor: previewColors.borderColor,
  });

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
        disabled={locked || item.isNew}
        className="flex h-8 w-5 shrink-0 cursor-grab touch-none items-center justify-center text-black/25 transition-colors hover:text-black/60 active:cursor-grabbing disabled:cursor-default disabled:opacity-30"
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" aria-hidden />
      </button>

      <form
        className="flex min-w-0 flex-1 items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (locked || !editing) return;
          const formData = new FormData(event.currentTarget);
          startSave(async () => {
            await upsertScheduleDayLabel(formData);
            onSaved();
          });
        }}
      >
        {!item.isNew ? (
          <input type="hidden" name="id" value={item.id} />
        ) : null}
        <input type="hidden" name="sort_order" value={item.sortOrder} />
        <input type="hidden" name="bg_color" value={bgColor} />

        <Input
          name="code"
          defaultValue={item.code}
          readOnly={!editing || isPersisted || locked}
          placeholder="CODE"
          title="Stable code used on saved roster days"
          className={cn(
            "h-8 w-[4.5rem] shrink-0 font-mono text-xs uppercase",
            LIGHT_INPUT,
          )}
          required
        />
        <Input
          name="abbreviation"
          value={abbreviation}
          onChange={(event) => setAbbreviation(event.target.value)}
          readOnly={!editing || locked}
          placeholder="Abbr"
          className={cn("h-8 w-20 shrink-0", LIGHT_INPUT)}
          required
        />
        <Input
          name="name"
          defaultValue={item.name}
          readOnly={!editing || locked}
          placeholder="Label name"
          className={cn("h-8 min-w-0 flex-1", LIGHT_INPUT)}
          required
        />

        <label
          className={cn(
            "relative flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-black/15 bg-white text-black/55 transition-colors hover:border-black/25 hover:text-[#3D421F]",
            (!editing || locked) && "cursor-default opacity-50",
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
            value={/^#[0-9a-fA-F]{6}$/.test(bgColor) ? bgColor : "#e5e5e5"}
            disabled={!editing || locked}
            onChange={(event) => setBgColor(event.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-default"
            aria-label="Tag background colour"
          />
        </label>

        <span
          className="inline-flex h-8 min-w-[3.25rem] shrink-0 items-center justify-center rounded-md border px-2 text-[10px] font-semibold uppercase tracking-wide"
          style={previewStyle}
        >
          {abbreviation.trim() || "···"}
        </span>

        <div className="ml-auto flex shrink-0 items-center gap-1">
          {editing ? (
            <>
              <Button
                type="submit"
                size="icon"
                variant="secondary"
                disabled={locked || saving}
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
              disabled={locked}
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
            disabled={locked || deleting || item.isNew}
            className="h-8 w-8 text-black/35 hover:text-red-600"
            onClick={() => {
              if (
                !window.confirm(
                  `Delete "${item.abbreviation || item.code} — ${item.name}"?`,
                )
              ) {
                return;
              }
              startDelete(() => {
                void deleteScheduleDayLabel(item.id);
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
