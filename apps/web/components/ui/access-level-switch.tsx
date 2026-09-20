"use client";

import {
  ACCESS_MATRIX_LEVELS,
  type AccessMatrixLevel,
} from "@/lib/access/matrix";
import { cn } from "@/lib/utils";

export const ACCESS_LEVEL_SWITCH_CLASS: Record<AccessMatrixLevel, string> = {
  hidden: "bg-black/70 text-white",
  none: "bg-rose-600 text-white",
  viewer: "bg-sky-700 text-white",
  editor: "bg-[var(--venue-primary,#818a40)] text-white",
};

type AccessLevelSwitchProps = {
  value: AccessMatrixLevel;
  onChange: (level: AccessMatrixLevel) => void;
  disabled?: boolean;
  name: string;
};

export function AccessLevelSwitch({
  value,
  onChange,
  disabled,
  name,
}: AccessLevelSwitchProps) {
  return (
    <div
      role="radiogroup"
      aria-label={name}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border border-black/10 bg-white p-0.5",
        disabled && "opacity-40",
      )}
    >
      {ACCESS_MATRIX_LEVELS.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.label}
            title={option.label}
            disabled={disabled}
            onClick={() => {
              if (!disabled && option.value !== value) onChange(option.value);
            }}
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold leading-none transition-colors",
              selected
                ? ACCESS_LEVEL_SWITCH_CLASS[option.value]
                : "bg-transparent text-black/45 hover:bg-black/[0.06] hover:text-[#3D421F]",
            )}
          >
            {option.short}
          </button>
        );
      })}
    </div>
  );
}
