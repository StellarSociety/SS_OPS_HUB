"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

const SIZES = [
  { key: "s", label: "S", px: 180 },
  { key: "m", label: "M", px: 260 },
  { key: "l", label: "L", px: 340 },
  { key: "xl", label: "XL", px: 440 },
] as const;

type QrFrameProps = {
  svg: string;
  label?: string;
  className?: string;
  defaultSize?: (typeof SIZES)[number]["key"];
  showSizeControls?: boolean;
};

export function QrFrame({
  svg,
  label = "QR code",
  className,
  defaultSize = "l",
  showSizeControls = true,
}: QrFrameProps) {
  const [sizeKey, setSizeKey] = useState<(typeof SIZES)[number]["key"]>(defaultSize);
  const size = useMemo(
    () => SIZES.find((entry) => entry.key === sizeKey)?.px ?? 340,
    [sizeKey],
  );

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      <div
        className="rounded-2xl border border-black/10 bg-white p-3 shadow-sm"
        style={{ width: size, height: size }}
        role="img"
        aria-label={label}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      {showSizeControls ? (
        <div className="flex items-center gap-1 rounded-full border border-black/10 bg-white/70 p-1">
          {SIZES.map((entry) => (
            <button
              key={entry.key}
              type="button"
              onClick={() => setSizeKey(entry.key)}
              className={cn(
                "h-8 min-w-8 rounded-full px-2.5 text-xs font-semibold",
                sizeKey === entry.key
                  ? "bg-[var(--venue-primary,#818a40)] text-white"
                  : "text-[#3D421F] hover:bg-black/5",
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>
      ) : null}
      {showSizeControls ? (
        <p className="text-xs text-black/45">
          Size the QR for a screenshot, then keep it on your phone.
        </p>
      ) : null}
    </div>
  );
}
