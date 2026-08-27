"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { sanitizeGuestChoice } from "@/lib/guests-intel/types";
import { cn } from "@/lib/utils";

type GuestChoiceSetProps = {
  name: string;
  options: readonly string[];
  disabled?: boolean;
  addPlaceholder?: string;
  addInputId?: string;
};

export function GuestChoiceSet({
  name,
  options,
  disabled,
  addPlaceholder = "Add other…",
  addInputId,
}: GuestChoiceSetProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [custom, setCustom] = useState("");

  const chips = useMemo(() => {
    const extras = selected.filter(
      (value) =>
        !options.some((option) => option.toLowerCase() === value.toLowerCase()),
    );
    return [...options, ...extras];
  }, [options, selected]);

  function toggle(option: string) {
    setSelected((current) => {
      const exists = current.some(
        (value) => value.toLowerCase() === option.toLowerCase(),
      );
      if (exists) {
        return current.filter(
          (value) => value.toLowerCase() !== option.toLowerCase(),
        );
      }
      return [...current, option];
    });
  }

  function addCustom() {
    const value = sanitizeGuestChoice(custom);
    if (!value) return;
    setSelected((current) => {
      if (current.some((item) => item.toLowerCase() === value.toLowerCase())) {
        return current;
      }
      const canonical =
        options.find((option) => option.toLowerCase() === value.toLowerCase()) ??
        value;
      return [...current, canonical];
    });
    setCustom("");
  }

  return (
    <div className="space-y-2">
      {selected.map((value) => (
        <input key={value} type="hidden" name={name} value={value} />
      ))}
      <div className="flex flex-wrap justify-center gap-2">
        {chips.map((option) => {
          const on = selected.some(
            (value) => value.toLowerCase() === option.toLowerCase(),
          );
          return (
            <button
              key={option}
              type="button"
              disabled={disabled}
              onClick={() => toggle(option)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm transition-colors disabled:opacity-50",
                on
                  ? "border-[var(--venue-primary,#818a40)] bg-[var(--venue-primary,#818a40)] text-white"
                  : "border-black/10 bg-white text-[#3D421F] hover:border-[var(--venue-primary,#818a40)]/50",
              )}
            >
              {option}
            </button>
          );
        })}
      </div>
      <div className="flex gap-2">
        <Input
          id={addInputId}
          value={custom}
          onChange={(event) => setCustom(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addCustom();
            }
          }}
          placeholder={addPlaceholder}
          disabled={disabled}
          maxLength={60}
        />
        <button
          type="button"
          onClick={addCustom}
          disabled={disabled || !custom.trim()}
          className="h-10 shrink-0 rounded-md border border-black/10 bg-white px-3 text-sm font-medium text-[#3D421F] disabled:opacity-50"
        >
          Add
        </button>
      </div>
    </div>
  );
}
