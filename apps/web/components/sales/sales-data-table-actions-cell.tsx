"use client";

import {
  SALES_TABLE_ACTION_COLUMN_WIDTH,
  SALES_TABLE_ACTION_STICKY_CLASS,
  SALES_TABLE_HEADER_COLUMN_BG,
  SALES_TABLE_ACTION_HEADER_STICKY_CLASS,
  SALES_TABLE_HEADER_SECTION_BG,
} from "@/lib/sales/sales-data-table-ui";
import { cn } from "@/lib/utils";

export { SALES_TABLE_ACTION_COLUMN_WIDTH };

type SalesDataTableActionsCellProps = {
  canEdit: boolean;
  isEditing: boolean;
  isPending: boolean;
  onEdit: () => void;
  onSave: () => void;
  onDelete: () => void;
};

export function SalesDataTableActionsCell({
  canEdit,
  isEditing,
  isPending,
  onEdit,
  onSave,
  onDelete,
}: SalesDataTableActionsCellProps) {
  if (!canEdit) {
    return (
      <td
        className={cn(
          SALES_TABLE_ACTION_STICKY_CLASS,
          "px-2 py-1.5 text-right align-middle",
        )}
        style={{
          minWidth: SALES_TABLE_ACTION_COLUMN_WIDTH,
          width: SALES_TABLE_ACTION_COLUMN_WIDTH,
        }}
      >
        <span className="text-xs text-black/40">—</span>
      </td>
    );
  }

  return (
    <td
      className={cn(
        SALES_TABLE_ACTION_STICKY_CLASS,
        "px-1.5 py-1 text-right align-middle",
      )}
      style={{
        minWidth: SALES_TABLE_ACTION_COLUMN_WIDTH,
        width: SALES_TABLE_ACTION_COLUMN_WIDTH,
      }}
    >
      <div className="flex flex-row items-center justify-end gap-1">
        <button
          type="button"
          disabled={isPending}
          onClick={isEditing ? onSave : onEdit}
          className="h-6 rounded border border-[var(--venue-primary)]/30 bg-[var(--venue-primary)]/10 px-1.5 text-[10px] font-bold leading-none text-[#3D421F] transition-colors hover:bg-[var(--venue-primary)]/15 disabled:opacity-50"
        >
          {isPending ? "…" : isEditing ? "Save" : "Edit"}
        </button>
        <button
          type="button"
          disabled={isPending || isEditing}
          onClick={onDelete}
          className="h-6 rounded border border-red-200 bg-red-50 px-1.5 text-[10px] font-bold leading-none text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50"
        >
          Delete
        </button>
      </div>
    </td>
  );
}

export function SalesDataTableActionSectionHeader() {
  return (
    <th
      className={cn(
        SALES_TABLE_ACTION_HEADER_STICKY_CLASS,
        SALES_TABLE_HEADER_SECTION_BG,
        "px-3 py-2.5 text-right",
      )}
      style={{
        minWidth: SALES_TABLE_ACTION_COLUMN_WIDTH,
        width: SALES_TABLE_ACTION_COLUMN_WIDTH,
      }}
    />
  );
}

export function SalesDataTableActionColumnHeader() {
  return (
    <th
      className={cn(
        SALES_TABLE_ACTION_HEADER_STICKY_CLASS,
        SALES_TABLE_HEADER_COLUMN_BG,
        "whitespace-nowrap px-2 py-2 text-center text-xs font-bold uppercase tracking-wide text-black",
      )}
      style={{
        minWidth: SALES_TABLE_ACTION_COLUMN_WIDTH,
        width: SALES_TABLE_ACTION_COLUMN_WIDTH,
      }}
    >
      Actions
    </th>
  );
}
