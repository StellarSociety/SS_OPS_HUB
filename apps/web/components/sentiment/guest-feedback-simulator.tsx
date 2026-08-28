"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { DevicePreviewChrome } from "@/components/simulators/device-preview-chrome";
import { DevicePreviewStage } from "@/components/simulators/device-preview-stage";
import { GuestFeedbackPublicPage } from "@/components/sentiment/guest-feedback-public-page";
import type { GuestFeedbackPublicView } from "@/components/sentiment/guest-feedback-public-page";
import {
  GuestFeedbackPathPanel,
  type GuestFeedbackSimPageId,
} from "@/components/sentiment/guest-feedback-path-panel";
import {
  DEFAULT_DEVICE_ID,
  DEVICE_BRANDS,
  deviceRatioLabel,
  devicesForBrand,
  getDevicePreset,
  type DeviceBrand,
} from "@/lib/mobile/device-presets";
import { guestFeedbackPath } from "@/lib/sentiment/guest-feedback/types";

const BEZEL = 14;
const HOME_BUTTON_EXTRA = 52;

export function GuestFeedbackSimulator({
  view,
  themeStyle,
}: {
  view: GuestFeedbackPublicView;
  themeStyle: CSSProperties;
}) {
  const [deviceId, setDeviceId] = useState(DEFAULT_DEVICE_ID);
  const device = getDevicePreset(deviceId);
  const brand = device.brand;
  const brandDevices = useMemo(() => devicesForBrand(brand), [brand]);
  const extraBottom = device.island === "home-button" ? HOME_BUTTON_EXTRA : 0;
  const frameWidth = device.width + BEZEL * 2;
  const frameHeight = device.height + BEZEL * 2 + extraBottom;
  const screenRadius = device.island === "home-button" ? 4 : device.cornerRadius;
  const bodyRadius = device.island === "home-button" ? 36 : screenRadius + BEZEL;
  const ratio = deviceRatioLabel(device.width, device.height);
  const [pageId, setPageId] = useState<GuestFeedbackSimPageId>("promotions");
  const previewPath = `${guestFeedbackPath(view.code)}${
    pageId === "form" ? "#form" : pageId === "thank-you" ? "#thanks" : ""
  }`;

  function selectBrand(next: DeviceBrand) {
    if (next === brand) return;
    const first = devicesForBrand(next)[0];
    if (first) setDeviceId(first.id);
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <DevicePreviewChrome
        intro="Preview each guest screen on a phone: promotions, the feedback form, and thank you. Use Send feedback on the form to jump to thank you. Submitting here is a preview only — it does not save a review."
        formatValue={brand}
        formatOptions={DEVICE_BRANDS.map((item) => ({
          value: item.key,
          label: item.label,
        }))}
        onFormatChange={(value) => selectBrand(value as DeviceBrand)}
        modelValue={deviceId}
        modelOptions={brandDevices.map((item) => ({
          value: item.id,
          label: item.label,
        }))}
        onModelChange={setDeviceId}
        spec={`${device.label} · ${device.width} × ${device.height} · ${ratio} · ${device.dpr}×`}
        previewPath={previewPath}
      />
      <DevicePreviewStage
        frameWidth={frameWidth}
        frameHeight={frameHeight}
        panel={
          <GuestFeedbackPathPanel
            code={view.code}
            selectedId={pageId}
            onSelect={setPageId}
          />
        }
      >
        <div
          className="relative h-full w-full"
          style={{
            padding: BEZEL,
            paddingBottom: BEZEL + extraBottom,
            borderRadius: bodyRadius,
            background:
              brand === "iphone"
                ? "linear-gradient(160deg, #3a3a3c 0%, #1c1c1e 42%, #111113 100%)"
                : "linear-gradient(160deg, #2b2b2b 0%, #141414 48%, #0c0c0c 100%)",
            boxShadow:
              "0 1px 0 rgba(255,255,255,0.18) inset, 0 24px 48px -20px rgba(0,0,0,0.45), 0 8px 16px -8px rgba(0,0,0,0.3)",
          }}
          aria-label={`${device.label} simulation, ${deviceRatioLabel(device.width, device.height)}`}
        >
          {brand === "iphone" ? <IphoneButtons /> : <SamsungButtons />}
          <div
            className="relative h-full w-full overflow-hidden"
            style={{
              borderRadius: screenRadius,
              ...themeStyle,
              backgroundColor:
                "color-mix(in srgb, var(--venue-secondary, #F0F3DD) 35%, white)",
            }}
          >
            {device.island === "dynamic-island" ? (
              <div
                aria-hidden
                className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full bg-black"
                style={{ width: 126, height: 37 }}
              />
            ) : null}
            {device.island === "punch-hole" ? (
              <div
                aria-hidden
                className="pointer-events-none absolute left-1/2 top-3 z-10 h-3 w-3 -translate-x-1/2 rounded-full bg-black"
              />
            ) : null}
            <div className="h-full overflow-y-auto pt-10">
              <GuestFeedbackPublicPage
                key={pageId}
                view={view}
                preview
                previewScreen={pageId}
                onPreviewNavigate={setPageId}
              />
            </div>
            {device.island !== "home-button" ? (
              <div
                aria-hidden
                className="pointer-events-none absolute bottom-2 left-1/2 z-10 h-[5px] w-[134px] -translate-x-1/2 rounded-full bg-black/35"
              />
            ) : null}
          </div>
          {device.island === "home-button" ? (
            <div
              aria-hidden
              className="absolute bottom-[11px] left-1/2 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border-2 border-white/15"
            >
              <span className="h-7 w-7 rounded-full border border-white/20" />
            </div>
          ) : null}
        </div>
      </DevicePreviewStage>
    </div>
  );
}

function IphoneButtons() {
  return (
    <>
      <span
        aria-hidden
        className="absolute -left-[3px] top-[118px] h-7 w-[3px] rounded-l-sm bg-[#2c2c2e]"
      />
      <span
        aria-hidden
        className="absolute -left-[3px] top-[168px] h-14 w-[3px] rounded-l-sm bg-[#2c2c2e]"
      />
      <span
        aria-hidden
        className="absolute -left-[3px] top-[232px] h-14 w-[3px] rounded-l-sm bg-[#2c2c2e]"
      />
      <span
        aria-hidden
        className="absolute -right-[3px] top-[180px] h-[72px] w-[3px] rounded-r-sm bg-[#2c2c2e]"
      />
    </>
  );
}

function SamsungButtons() {
  return (
    <>
      <span
        aria-hidden
        className="absolute -left-[3px] top-[160px] h-12 w-[3px] rounded-l-sm bg-[#2a2a2a]"
      />
      <span
        aria-hidden
        className="absolute -right-[3px] top-[150px] h-16 w-[3px] rounded-r-sm bg-[#2a2a2a]"
      />
      <span
        aria-hidden
        className="absolute -right-[3px] top-[230px] h-10 w-[3px] rounded-r-sm bg-[#2a2a2a]"
      />
    </>
  );
}
