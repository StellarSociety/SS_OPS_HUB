"use client";

import { useMemo } from "react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { flagEmojiFromIso } from "@/lib/hr/nationality-flag";
import { WORLD_COUNTRIES } from "@/lib/hr/phone";
import { cn } from "@/lib/utils";

type NationalitySelectProps = {
  id: string;
  name: string;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  triggerClassName?: string;
  className?: string;
};

export function NationalitySelect({
  id,
  name,
  value,
  onChange,
  disabled,
  required = false,
  placeholder = "Search country…",
  triggerClassName,
  className,
}: NationalitySelectProps) {
  const options = useMemo(
    () =>
      WORLD_COUNTRIES.map((country) => ({
        value: country.name,
        label: `${flagEmojiFromIso(country.iso)} ${country.name}`.trim(),
        searchText: country.iso,
      })),
    [],
  );

  return (
    <div className={cn("relative", className)}>
      <input type="hidden" name={name} value={value} />
      <input
        tabIndex={-1}
        required={required}
        value={value}
        onChange={() => undefined}
        className="pointer-events-none absolute h-px w-px opacity-0"
        aria-hidden
      />
      <SearchableSelect
        id={id}
        aria-label="Nationality"
        value={value}
        onChange={onChange}
        options={options}
        placeholder={placeholder}
        searchPlaceholder="Search country…"
        disabled={disabled}
        clearable={!required}
        triggerClassName={triggerClassName}
      />
    </div>
  );
}
