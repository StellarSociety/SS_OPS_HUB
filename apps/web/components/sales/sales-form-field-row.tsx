import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const SALES_FORM_FIELD_INPUT_WIDTH = "8.5rem";
export const SALES_FORM_COLUMN_MAX_WIDTH = "20rem";
export const SALES_FORM_THREE_COLUMN_GROUP_MAX_WIDTH =
  "calc(3 * 20rem + 2 * 1.5rem)";

export const SALES_FORM_FIELD_GRID_COLUMNS = `minmax(0, 1fr) ${SALES_FORM_FIELD_INPUT_WIDTH}`;

export function salesFormFieldInputClass(disabled: boolean) {
  return cn(
    "h-9 w-full rounded-md border border-black/10 bg-white px-3 text-sm tabular-nums text-[#3D421F] placeholder:text-black/35",
    disabled && "cursor-not-allowed opacity-60",
  );
}

export function salesFormColumnShellClass(className?: string) {
  return cn(
    "flex w-full flex-col gap-3 rounded-xl border border-black/10 bg-white/80 p-4",
    className,
  );
}

const salesFormColumnSizeClass =
  "min-w-[min(100%,14rem)] max-w-[20rem] flex-[1_1_18rem]";

/** Width/sizing shared by Lunch, Dinner, totals columns and aligned banners. */
export function salesFormColumnWidthClass() {
  return salesFormColumnSizeClass;
}

/** Shared sizing for Lunch / Dinner / totals columns — flexes with viewport, capped at 20rem. */
export function salesFormColumnClassName(className?: string) {
  return cn(
    salesFormColumnShellClass(),
    salesFormColumnSizeClass,
    "self-stretch",
    className,
  );
}

export function SalesFormColumnsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex w-full flex-wrap items-stretch justify-center gap-6">
      {children}
    </div>
  );
}

/** Wraps a 3-column form row + footer (e.g. comments) to the same combined width. */
export function SalesFormThreeColumnGroup({ children }: { children: ReactNode }) {
  return (
    <div
      className="mx-auto flex w-full flex-col gap-6"
      style={{ maxWidth: SALES_FORM_THREE_COLUMN_GROUP_MAX_WIDTH }}
    >
      {children}
    </div>
  );
}

type SalesFormFieldRowProps = {
  label: ReactNode;
  className?: string;
  children: ReactNode;
};

export function SalesFormFieldRow({
  label,
  className,
  children,
}: SalesFormFieldRowProps) {
  return (
    <label
      className={cn("grid items-center gap-x-4 text-sm", className)}
      style={{
        gridTemplateColumns: SALES_FORM_FIELD_GRID_COLUMNS,
      }}
    >
      <span className="flex min-h-9 items-center justify-end text-right text-black/60">
        {label}
      </span>
      <div
        className="justify-self-end"
        style={{ width: SALES_FORM_FIELD_INPUT_WIDTH }}
      >
        {children}
      </div>
    </label>
  );
}

type SalesFormInputMode = "gross" | "net";

type SalesFormInputModeToggleProps = {
  mode: SalesFormInputMode;
  onChange: (mode: SalesFormInputMode) => void;
  disabled?: boolean;
  className?: string;
};

export function SalesFormInputModeToggle({
  mode,
  onChange,
  disabled = false,
  className,
}: SalesFormInputModeToggleProps) {
  return (
    <div
      className={cn(
        "flex rounded-md border border-black/10 bg-white p-0.5",
        className,
      )}
      style={{ width: SALES_FORM_FIELD_INPUT_WIDTH }}
    >
      {(["gross", "net"] as const).map((value) => (
        <button
          key={value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(value)}
          className={cn(
            "flex-1 rounded px-1 py-1 text-center text-[10px] font-medium uppercase tracking-wide transition-colors",
            mode === value
              ? "bg-[var(--venue-primary)] text-white"
              : "text-black/60 hover:text-[#3D421F]",
            disabled && "cursor-not-allowed opacity-60",
          )}
        >
          {value}
        </button>
      ))}
    </div>
  );
}

export function SalesFormSectionHeader({
  title,
  action,
}: {
  title: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      className="grid items-center gap-x-4"
      style={{ gridTemplateColumns: SALES_FORM_FIELD_GRID_COLUMNS }}
    >
      <h3 className="font-serif text-lg font-bold text-[#3D421F]">{title}</h3>
      {action ? (
        <div
          className="justify-self-end"
          style={{ width: SALES_FORM_FIELD_INPUT_WIDTH }}
        >
          {action}
        </div>
      ) : null}
    </div>
  );
}
