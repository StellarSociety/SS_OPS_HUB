"use client";

import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
} from "react";
import { DevicePreviewChrome } from "@/components/simulators/device-preview-chrome";
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

/** CSS scale makes browsers scroll to the unscaled field box — keep the preview still. */
function keepPreviewScrollStill(event: FocusEvent<HTMLDivElement>) {
  const ancestors: HTMLElement[] = [];
  let node: HTMLElement | null = event.currentTarget.parentElement;
  while (node) {
    const { overflowX, overflowY } = getComputedStyle(node);
    if (/(auto|scroll)/.test(overflowX) || /(auto|scroll)/.test(overflowY)) {
      ancestors.push(node);
    }
    node = node.parentElement;
  }
  const saved = ancestors.map((el) => ({
    el,
    top: el.scrollTop,
    left: el.scrollLeft,
  }));
  const winX = window.scrollX;
  const winY = window.scrollY;
  requestAnimationFrame(() => {
    for (const item of saved) {
      item.el.scrollTop = item.top;
      item.el.scrollLeft = item.left;
    }
    window.scrollTo(winX, winY);
  });
}

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
  const stageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [pageId, setPageId] = useState<GuestFeedbackSimPageId>("promotions");
  const previewPath = `${guestFeedbackPath(view.code)}${
    pageId === "form" ? "#form" : pageId === "thank-you" ? "#thanks" : ""
  }`;

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const measure = () => {
      const availableWidth = stage.clientWidth;
      const availableHeight = stage.clientHeight;
      if (availableWidth <= 0 || availableHeight <= 0) return;
      const next = Math.min(
        1,
        availableWidth / frameWidth,
        availableHeight / frameHeight,
      );
      setScale((prev) => (Math.abs(prev - next) < 0.004 ? prev : next));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [frameWidth, frameHeight]);

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
      <div className="flex min-h-0 flex-1 items-stretch gap-6 overflow-hidden">
        <div
          ref={stageRef}
          className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden"
        >
          <div
            className="relative shrink-0 overflow-hidden"
            style={{
              width: frameWidth * scale,
              height: frameHeight * scale,
            }}
          >
            <div
              className="absolute left-0 top-0 origin-top-left"
              style={{
                width: frameWidth,
                height: frameHeight,
                transform: `scale(${scale})`,
              }}
              onFocusCapture={keepPreviewScrollStill}
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
                    "0 1px 0 rgba(255,255,255,0.18) inset, 0 24px 48px -20px rgba(0,0,0,0.45)",
                }}
                aria-label={`${device.label} simulation, ${deviceRatioLabel(device.width, device.height)}`}
              >
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
            </div>
          </div>
        </div>
        <GuestFeedbackPathPanel
          code={view.code}
          selectedId={pageId}
          onSelect={setPageId}
        />
      </div>
    </div>
  );
}
