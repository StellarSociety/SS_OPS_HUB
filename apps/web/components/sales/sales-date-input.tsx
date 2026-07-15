"use client";

import { DateInput, type DateInputProps } from "@/components/ui/date-input";
import { cn } from "@/lib/utils";

type SalesDateInputProps = Omit<DateInputProps, "inputClassName"> & {
  inputClassName?: string;
};

/**
 * Sales-styled date field. Always displays / accepts `DD/MM/YYYY`; stores ISO.
 */
export function SalesDateInput({
  className,
  inputClassName,
  ...props
}: SalesDateInputProps) {
  return (
    <DateInput
      {...props}
      className={className}
      inputClassName={cn(
        "px-9 text-center",
        inputClassName,
      )}
    />
  );
}
