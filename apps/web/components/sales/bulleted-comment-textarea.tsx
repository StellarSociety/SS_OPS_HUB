"use client";

import type { KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

const BULLET = "• ";

type BulletedCommentTextareaProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  rows?: number;
  className?: string;
};

function withLeadingBullet(value: string): string {
  if (!value) return "";
  if (value.startsWith(BULLET)) return value;
  return `${BULLET}${value}`;
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
    onChange(withLeadingBullet(raw.replace(/^\u2022\s?/, "")));
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
    onChange(next);

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
      onFocus={(e) => {
        if (!disabled && !e.currentTarget.value.trim()) {
          onChange(BULLET);
        }
      }}
      className={className}
    />
  );
}
