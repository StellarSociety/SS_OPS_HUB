"use client";

import { Fragment, useEffect, useState, useTransition } from "react";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

type SalesSortableTableProps<T extends { id: string }> = {
  items: T[];
  canEdit: boolean;
  onReorder: (
    orderedIds: string[],
  ) => Promise<{ error?: string; success?: string }>;
  renderRow: (item: T, dragHandle: React.ReactNode) => React.ReactNode;
  emptyMessage: string;
  colSpan: number;
  /** When false, the item cannot be dragged or used as a drop target. */
  isDraggable?: (item: T) => boolean;
  /** Optional row(s) rendered immediately after each item (e.g. a divider). */
  renderAfterRow?: (item: T, index: number) => React.ReactNode;
};

export function SalesSortableTable<T extends { id: string }>({
  items,
  canEdit,
  onReorder,
  renderRow,
  emptyMessage,
  colSpan,
  isDraggable,
  renderAfterRow,
}: SalesSortableTableProps<T>) {
  const [ordered, setOrdered] = useState(items);
  const [dragId, setDragId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setOrdered(items);
  }, [items]);

  function canDrag(item: T): boolean {
    return !isDraggable || isDraggable(item);
  }

  function reorder(draggedId: string, targetId: string) {
    if (draggedId === targetId) return;
    const from = ordered.findIndex((item) => item.id === draggedId);
    const to = ordered.findIndex((item) => item.id === targetId);
    if (from < 0 || to < 0) return;

    const dragged = ordered[from];
    const target = ordered[to];
    if (!canDrag(dragged) || !canDrag(target)) return;

    const next = [...ordered];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setOrdered(next);

    startTransition(async () => {
      const result = await onReorder(next.map((item) => item.id));
      if (result.error) {
        window.alert(result.error);
        setOrdered(items);
      }
    });
  }

  if (ordered.length === 0) {
    return (
      <tr>
        <td colSpan={colSpan} className="px-4 py-8 text-center text-black/50">
          {emptyMessage}
        </td>
      </tr>
    );
  }

  return (
    <>
      {ordered.map((item, index) => {
        const itemDraggable = canEdit && canDrag(item);
        const dragHandle = canEdit ? (
          itemDraggable ? (
            <button
              type="button"
              draggable={!isPending}
              onDragStart={() => setDragId(item.id)}
              onDragEnd={() => setDragId(null)}
              className={cn(
                "cursor-grab rounded p-1 text-black/40 hover:bg-black/5 hover:text-black/60 active:cursor-grabbing",
                isPending && "cursor-not-allowed opacity-50",
              )}
              title="Drag to reorder"
            >
              <GripVertical className="h-4 w-4" />
            </button>
          ) : (
            <span
              className="inline-flex p-1 text-black/20"
              title="Fixed at the bottom"
              aria-hidden
            >
              <GripVertical className="h-4 w-4" />
            </span>
          )
        ) : null;

        return (
          <Fragment key={item.id}>
            <tr
              onDragOver={(e) => {
                if (!canEdit || !dragId || !canDrag(item)) return;
                e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (!dragId || !canDrag(item)) return;
                reorder(dragId, item.id);
                setDragId(null);
              }}
              className={cn(
                "border-b border-black/5 hover:bg-[var(--venue-secondary)]/15",
                dragId === item.id && "bg-[var(--venue-secondary)]/25",
                !canDrag(item) && "bg-black/[0.015]",
              )}
            >
              {renderRow(item, dragHandle)}
            </tr>
            {renderAfterRow?.(item, index)}
          </Fragment>
        );
      })}
    </>
  );
}
