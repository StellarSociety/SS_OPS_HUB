"use client";

import { useEffect, useState, useTransition } from "react";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

type SalesSortableTableProps<T extends { id: string }> = {
  items: T[];
  canEdit: boolean;
  onReorder: (orderedIds: string[]) => Promise<{ error?: string; success?: string }>;
  renderRow: (
    item: T,
    dragHandle: React.ReactNode,
  ) => React.ReactNode;
  emptyMessage: string;
  colSpan: number;
};

export function SalesSortableTable<T extends { id: string }>({
  items,
  canEdit,
  onReorder,
  renderRow,
  emptyMessage,
  colSpan,
}: SalesSortableTableProps<T>) {
  const [ordered, setOrdered] = useState(items);
  const [dragId, setDragId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setOrdered(items);
  }, [items]);

  function reorder(draggedId: string, targetId: string) {
    if (draggedId === targetId) return;
    const from = ordered.findIndex((item) => item.id === draggedId);
    const to = ordered.findIndex((item) => item.id === targetId);
    if (from < 0 || to < 0) return;

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
      {ordered.map((item) => {
        const dragHandle = canEdit ? (
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
        ) : null;

        return (
          <tr
            key={item.id}
            onDragOver={(e) => {
              if (!canEdit || !dragId) return;
              e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (!dragId) return;
              reorder(dragId, item.id);
              setDragId(null);
            }}
            className={cn(
              "border-b border-black/5 hover:bg-[var(--venue-secondary)]/15",
              dragId === item.id && "bg-[var(--venue-secondary)]/25",
            )}
          >
            {renderRow(item, dragHandle)}
          </tr>
        );
      })}
    </>
  );
}
