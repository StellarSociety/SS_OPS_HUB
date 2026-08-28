"use client";

import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { MobileLanHostButton } from "@/components/mobile/mobile-lan-host-button";

export const DEVICE_PREVIEW_SELECT_CLASS =
  "h-10 rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F] outline-none transition focus:border-[var(--venue-primary)]/50 focus:ring-2 focus:ring-[var(--venue-primary)]/20";

export const DEVICE_PREVIEW_PATH_PANEL_CLASS =
  "relative flex h-full min-h-0 min-w-[16rem] flex-1 flex-col p-4";

export type DevicePreviewOption = {
  value: string;
  label: string;
};

export function DevicePreviewChrome({
  title = "Device preview",
  intro,
  formatLabel = "Format",
  formatValue,
  formatOptions,
  onFormatChange,
  formatAriaLabel,
  modelLabel = "Model",
  modelValue,
  modelOptions,
  onModelChange,
  modelAriaLabel,
  spec,
  extra,
  previewPath,
}: {
  title?: string;
  intro?: ReactNode;
  formatLabel?: string;
  formatValue: string;
  formatOptions: DevicePreviewOption[];
  onFormatChange: (value: string) => void;
  formatAriaLabel?: string;
  modelLabel?: string;
  modelValue: string;
  modelOptions: DevicePreviewOption[];
  onModelChange: (value: string) => void;
  modelAriaLabel?: string;
  spec: string;
  extra?: ReactNode;
  previewPath: string;
}) {
  return (
    <div className="shrink-0 space-y-3 pb-4">
      <div>
        <p className="font-serif text-2xl text-[#3D421F]">{title}</p>
        {intro ? (
          <p className="mt-1 text-sm text-black/55">{intro}</p>
        ) : null}
        <hr className="mt-4 w-full border-black/10" />
      </div>

      <Card className="p-3">
        <div className="flex flex-wrap items-start gap-3">
          <label className="flex min-w-[12rem] flex-col gap-1">
            <span className="text-[11px] font-medium text-black/45">
              {formatLabel}
            </span>
            <select
              value={formatValue}
              aria-label={formatAriaLabel ?? formatLabel}
              onChange={(event) => onFormatChange(event.target.value)}
              className={DEVICE_PREVIEW_SELECT_CLASS}
            >
              {formatOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-[11px] font-medium text-black/45">
              {modelLabel}
            </span>
            <div className="flex h-10 min-w-0 items-center gap-3">
              <select
                aria-label={modelAriaLabel ?? modelLabel}
                value={modelValue}
                onChange={(event) => onModelChange(event.target.value)}
                className={`${DEVICE_PREVIEW_SELECT_CLASS} min-w-[12rem]`}
              >
                {modelOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <p className="shrink-0 text-sm tabular-nums text-black/50">
                {spec}
              </p>
            </div>
          </div>
          {extra}
        </div>
      </Card>

      <MobileLanHostButton previewPath={previewPath} />
    </div>
  );
}
