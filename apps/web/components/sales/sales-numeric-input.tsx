"use client";

import { useEffect, useState } from "react";
import { salesFormFieldInputClass } from "@/components/sales/sales-form-field-row";
import { cn } from "@/lib/utils";

type SalesNumericInputProps = {
  value: number;
  onChange: (value: string) => void;
  disabled: boolean;
  isInteger?: boolean;
  className?: string;
};

function stripThousandsSeparators(raw: string): string {
  return raw.replace(/,/g, "");
}

function formatDecimalDisplay(value: number): string {
  if (value === 0) return "";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDisplayValue(value: number, isInteger: boolean): string {
  if (value === 0) return "";
  return isInteger ? String(value) : formatDecimalDisplay(value);
}

export function SalesNumericInput({
  value,
  onChange,
  disabled,
  isInteger = false,
  className,
}: SalesNumericInputProps) {
  const [text, setText] = useState(() => formatDisplayValue(value, isInteger));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      setText(formatDisplayValue(value, isInteger));
    }
  }, [focused, isInteger, value]);

  function handleChange(raw: string) {
    const normalized = isInteger ? raw : stripThousandsSeparators(raw);
    const pattern = isInteger ? /^\d*$/ : /^\d*\.?\d*$/;
    if (!pattern.test(normalized)) return;

    setText(normalized);

    if (normalized === "" || normalized === ".") {
      onChange("0");
      return;
    }

    onChange(normalized);
  }

  function handleFocus() {
    setFocused(true);
    if (!isInteger && text.includes(",")) {
      setText(stripThousandsSeparators(text));
    }
  }

  function handleBlur() {
    setFocused(false);

    const raw = isInteger ? text : stripThousandsSeparators(text);

    if (raw === "" || raw === ".") {
      setText("");
      onChange("0");
      return;
    }

    const parsed = isInteger
      ? Number.parseInt(raw, 10)
      : Number.parseFloat(raw);

    if (!Number.isFinite(parsed) || parsed < 0) {
      setText("");
      onChange("0");
      return;
    }

    if (isInteger) {
      const normalized = String(parsed);
      setText(parsed === 0 ? "" : normalized);
      onChange(normalized);
      return;
    }

    const rounded = Math.round(parsed * 100) / 100;
    setText(rounded === 0 ? "" : formatDecimalDisplay(rounded));
    onChange(String(rounded));
  }

  return (
    <input
      type="text"
      inputMode={isInteger ? "numeric" : "decimal"}
      disabled={disabled}
      value={text}
      placeholder={isInteger ? "0" : "0.00"}
      onFocus={handleFocus}
      onChange={(event) => handleChange(event.target.value)}
      onBlur={handleBlur}
      className={cn(
        salesFormFieldInputClass(disabled),
        isInteger ? "text-center" : "text-right",
        className,
      )}
    />
  );
}
