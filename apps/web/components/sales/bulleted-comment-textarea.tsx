"use client";

import type { KeyboardEvent } from "react";

const BULLET = "• ";

type BulletedCommentTextareaProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  rows?: number;
  className?: string;
};

function normalizeBulletLines(raw: string): string {
  if (!raw.trim()) return "";

  return raw
    .split("\n")
    .map((line) => {
      const text = line.replace(/^\u2022\s?/, "").trimEnd();
      if (!text.trim()) return "";
      return `${BULLET}${text.trim()}`;
    })
    .join("\n");
}

export function BulletedCommentTextarea({
  value,
  onChange,
  disabled = false,
  placeholder,
  rows = 4,
  className,
}: BulletedCommentTextareaProps) {
  function handleChange(raw: string) {
    onChange(normalizeBulletLines(raw));
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter" || e.shiftKey || disabled) return;

    e.preventDefault();
    const target = e.currentTarget;
    const { selectionStart, selectionEnd } = target;
    const next =
      value.slice(0, selectionStart) +
      `\n${BULLET}` +
      value.slice(selectionEnd);
    onChange(normalizeBulletLines(next));

    const cursor = selectionStart + 1 + BULLET.length;
    window.requestAnimationFrame(() => {
      target.selectionStart = cursor;
      target.selectionEnd = cursor;
    });
  }

  return (
    <textarea
      rows={rows}
      disabled={disabled}
      value={value}
      placeholder={placeholder}
      onChange={(e) => handleChange(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={(e) => handleChange(e.currentTarget.value)}
      onFocus={(e) => {
        if (!disabled && !e.currentTarget.value.trim()) {
          onChange(BULLET);
        }
      }}
      className={className}
    />
  );
}
