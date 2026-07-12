"use client";

import { Reorder, useDragControls } from "framer-motion";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type LookupFieldConfig = {
  key: string;
  label: string;
  type: "text" | "number" | "select";
  options?: { value: string; label: string }[];
  placeholder?: string;
  required?: boolean;
  className?: string;
};

export type LookupItem = {
  id: string;
  name: string;
  sort_order?: number;
  [key: string]: unknown;
};

type LookupEditorProps = {
  items: LookupItem[];
  fields?: LookupFieldConfig[];
  namePlaceholder?: string;
  addLabel?: string;
  emptyLabel?: string;
  upsertAction: (formData: FormData) => Promise<void>;
  deleteAction: (id: string) => Promise<void>;
  reorderAction: (orderedIds: string[]) => Promise<void>;
};

export function LookupEditor({
  items,
  fields = [],
  namePlaceholder = "Name",
  addLabel = "Add",
  emptyLabel = "Nothing here yet — add the first entry below.",
  upsertAction,
  deleteAction,
  reorderAction,
}: LookupEditorProps) {
  const [order, setOrder] = useState(items);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setOrder(items);
  }, [items]);

  function handleReorder(next: LookupItem[]) {
    setOrder(next);
    startTransition(() => {
      void reorderAction(next.map((item) => item.id));
    });
  }

  return (
    <div className="space-y-4">
      {order.length === 0 ? (
        <p className="text-sm text-black/45">{emptyLabel}</p>
      ) : (
        <Reorder.Group
          axis="y"
          values={order}
          onReorder={handleReorder}
          className="space-y-1.5"
        >
          {order.map((item) => (
            <LookupRow
              key={item.id}
              item={item}
              fields={fields}
              namePlaceholder={namePlaceholder}
              upsertAction={upsertAction}
              deleteAction={deleteAction}
            />
          ))}
        </Reorder.Group>
      )}

      <AddRow
        fields={fields}
        namePlaceholder={namePlaceholder}
        addLabel={addLabel}
        nextSortOrder={order.length + 1}
        upsertAction={upsertAction}
      />
    </div>
  );
}

function LookupRow({
  item,
  fields,
  namePlaceholder,
  upsertAction,
  deleteAction,
}: {
  item: LookupItem;
  fields: LookupFieldConfig[];
  namePlaceholder: string;
  upsertAction: (formData: FormData) => Promise<void>;
  deleteAction: (id: string) => Promise<void>;
}) {
  const controls = useDragControls();
  const [deleting, startDelete] = useTransition();

  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragControls={controls}
      className="flex items-center gap-2 rounded-lg border border-black/10 bg-white px-2.5 py-2 shadow-sm"
    >
      <button
        type="button"
        onPointerDown={(event) => controls.start(event)}
        className="flex h-9 w-5 shrink-0 cursor-grab touch-none items-center justify-center text-black/25 transition-colors hover:text-black/60 active:cursor-grabbing"
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" aria-hidden />
      </button>

      <form
        action={upsertAction}
        className="flex flex-1 flex-wrap items-center gap-2"
      >
        <input type="hidden" name="id" value={item.id} />
        <input type="hidden" name="sort_order" value={item.sort_order ?? 0} />
        <Input
          name="name"
          defaultValue={item.name}
          placeholder={namePlaceholder}
          required
          className="h-9 min-w-[8rem] flex-1"
        />
        {fields.map((field) => (
          <FieldInput key={field.key} field={field} value={item[field.key]} />
        ))}
        <Button type="submit" size="sm" variant="secondary">
          Save
        </Button>
      </form>

      <Button
        type="button"
        size="sm"
        variant="ghost"
        aria-label="Delete"
        disabled={deleting}
        className="shrink-0 text-black/35 hover:text-red-600"
        onClick={() => {
          if (!window.confirm(`Delete "${item.name}"?`)) return;
          startDelete(() => {
            void deleteAction(item.id);
          });
        }}
      >
        <Trash2 className="h-4 w-4" aria-hidden />
      </Button>
    </Reorder.Item>
  );
}

function AddRow({
  fields,
  namePlaceholder,
  addLabel,
  nextSortOrder,
  upsertAction,
}: {
  fields: LookupFieldConfig[];
  namePlaceholder: string;
  addLabel: string;
  nextSortOrder: number;
  upsertAction: (formData: FormData) => Promise<void>;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await upsertAction(formData);
        formRef.current?.reset();
      }}
      className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-black/20 bg-black/[0.02] px-2.5 py-2"
    >
      <input type="hidden" name="sort_order" value={nextSortOrder} />
      <Input
        name="name"
        placeholder={namePlaceholder}
        required
        className="h-9 min-w-[8rem] flex-1"
      />
      {fields.map((field) => (
        <FieldInput key={field.key} field={field} value="" />
      ))}
      <Button type="submit" size="sm">
        <Plus className="h-4 w-4" aria-hidden />
        {addLabel}
      </Button>
    </form>
  );
}

function FieldInput({
  field,
  value,
}: {
  field: LookupFieldConfig;
  value: unknown;
}) {
  const stringValue =
    value === null || value === undefined ? "" : String(value);

  if (field.type === "select") {
    return (
      <select
        name={field.key}
        defaultValue={stringValue}
        required={field.required}
        className={
          field.className ??
          "h-9 rounded-md border border-black/10 bg-white px-2 text-sm"
        }
        aria-label={field.label}
      >
        <option value="">{field.placeholder ?? field.label}</option>
        {field.options?.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <Input
      name={field.key}
      type={field.type}
      defaultValue={stringValue}
      placeholder={field.placeholder ?? field.label}
      required={field.required}
      className={field.className ?? "h-9 w-32"}
      aria-label={field.label}
    />
  );
}
