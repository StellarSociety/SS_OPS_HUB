"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Column = {
  key: string;
  label: string;
  className?: string;
};

type BenefitsSettingsEditorProps = {
  columns: Column[];
  rows: Array<{ id: string; cells: React.ReactNode[] }>;
  onAdd?: () => void;
  addLabel?: string;
  onRemove?: (index: number) => void;
  canRemove?: (index: number) => boolean;
  footer?: React.ReactNode;
};

export function BenefitsSettingsEditor({
  columns,
  rows,
  onAdd,
  addLabel = "Add row",
  onRemove,
  canRemove = () => true,
  footer,
}: BenefitsSettingsEditorProps) {
  const showRemove = Boolean(onRemove);
  const gridCols = showRemove
    ? "grid-cols-[minmax(0,1fr)_7rem_2.25rem] sm:grid-cols-[minmax(0,1fr)_7rem_2.25rem]"
    : "grid-cols-[minmax(0,1fr)_7rem] sm:grid-cols-[minmax(0,1fr)_7rem]";

  return (
    <div className="space-y-3">
      <div
        className={cn(
          "hidden gap-2 px-3 text-[11px] font-medium uppercase tracking-wide text-black/45 sm:grid",
          showRemove
            ? "sm:grid-cols-[minmax(0,1fr)_7rem_2.25rem]"
            : "sm:grid-cols-[minmax(0,1fr)_7rem]",
        )}
      >
        {columns.map((col) => (
          <span key={col.key} className={col.className}>
            {col.label}
          </span>
        ))}
        {showRemove ? <span aria-hidden /> : null}
      </div>

      <div className="space-y-2">
        {rows.map((row, index) => (
          <div
            key={row.id}
            className={cn(
              "grid items-center gap-2 rounded-lg border border-black/8 bg-white/90 px-3 py-2 shadow-sm",
              gridCols,
            )}
          >
            {row.cells.map((cell, cellIndex) => (
              <div key={`${row.id}-${cellIndex}`} className="min-w-0">
                {cell}
              </div>
            ))}
            {showRemove ? (
              <button
                type="button"
                disabled={!canRemove(index)}
                onClick={() => onRemove?.(index)}
                className={cn(
                  "inline-flex h-8 w-8 items-center justify-center rounded-md border border-black/10 text-black/45 transition-colors",
                  canRemove(index)
                    ? "hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                    : "cursor-not-allowed opacity-30",
                )}
                aria-label="Remove row"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        ))}
      </div>

      {footer || onAdd ? (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-0.5">
          {footer ? <div className="min-w-0 flex-1">{footer}</div> : <span />}
          {onAdd ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="shrink-0 gap-1.5"
              onClick={onAdd}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              {addLabel}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function BenefitsPercentTotalBadge({
  total,
  target = 100,
}: {
  total: number;
  target?: number;
}) {
  const valid = Math.abs(total - target) < 0.05;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium tabular-nums",
        valid
          ? "bg-[var(--venue-primary,#818a40)]/15 text-[#3D421F]"
          : "bg-amber-100 text-amber-900",
      )}
    >
      Total {total.toFixed(1)}%
      {!valid ? ` · should be ${target}%` : ""}
    </span>
  );
}

export function benefitsListInputClass(className?: string) {
  return cn("h-8 bg-white", className);
}
