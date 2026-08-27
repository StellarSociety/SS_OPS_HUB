"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { DevicePreviewChrome } from "@/components/simulators/device-preview-chrome";
import { LiveDisplayScreen } from "@/components/sentiment/live-display-screen";
import {
  LiveDisplayPathPanel,
  type LiveDisplaySimPageId,
} from "@/components/sentiment/live-display-path-panel";
import {
  DEFAULT_TABLET_ID,
  DEFAULT_TABLET_ORIENTATION,
  TABLET_PRESETS,
  getTabletPreset,
  tabletViewport,
  type TabletOrientation,
} from "@/lib/mobile/tablet-presets";
import { deviceRatioLabel } from "@/lib/mobile/device-presets";
import { liveDisplayPath, type LiveDisplayView } from "@/lib/sentiment/live-display/types";

const BEZEL = 22;

export function LiveDisplaySimulator({
  view,
  code,
  themeStyle,
}: {
  view: LiveDisplayView;
  code: string;
  themeStyle: CSSProperties;
}) {
  const [tabletId, setTabletId] = useState(DEFAULT_TABLET_ID);
  const [orientation, setOrientation] = useState<TabletOrientation>(
    DEFAULT_TABLET_ORIENTATION,
  );
  const [pageId, setPageId] = useState<LiveDisplaySimPageId>("live");
  const tablet = getTabletPreset(tabletId);
  const viewport = tabletViewport(tablet, orientation);
  const frameWidth = viewport.width + BEZEL * 2;
  const frameHeight = viewport.height + BEZEL * 2;
  const bodyRadius = tablet.cornerRadius + BEZEL;
  const ratio = deviceRatioLabel(viewport.width, viewport.height);
  const previewPath = liveDisplayPath(code);
  const stageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

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

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <DevicePreviewChrome
        intro="Preview the restaurant iPad. This is the live rating screen guests see on the floor."
        formatLabel="Format"
        formatValue={orientation}
        formatOptions={[
          { value: "landscape", label: "Landscape" },
          { value: "portrait", label: "Portrait" },
        ]}
        onFormatChange={(value) =>
          setOrientation(value as TabletOrientation)
        }
        formatAriaLabel="Orientation"
        modelValue={tabletId}
        modelOptions={TABLET_PRESETS.map((item) => ({
          value: item.id,
          label: item.label,
        }))}
        onModelChange={setTabletId}
        modelAriaLabel="iPad model"
        spec={`${tablet.label} · ${viewport.width} × ${viewport.height} · ${ratio} · ${tablet.dpr}×`}
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
          >
            <div
              className="relative h-full w-full"
              style={{
                padding: BEZEL,
                borderRadius: bodyRadius,
                background:
                  "linear-gradient(160deg, #3a3a3c 0%, #1c1c1e 42%, #111113 100%)",
                boxShadow:
                  "0 1px 0 rgba(255,255,255,0.18) inset, 0 24px 48px -20px rgba(0,0,0,0.45)",
              }}
              aria-label={`${tablet.label} ${orientation} simulation`}
            >
              <div
                className="relative h-full w-full overflow-hidden"
                style={{
                  borderRadius: tablet.cornerRadius,
                  ...themeStyle,
                  backgroundColor:
                    "color-mix(in srgb, var(--venue-secondary, #F0F3DD) 35%, white)",
                }}
              >
                  <LiveDisplayScreen view={view} />
                <div
                  aria-hidden
                  className="pointer-events-none absolute bottom-2 left-1/2 z-10 h-[5px] w-[160px] -translate-x-1/2 rounded-full bg-black/35"
                />
              </div>
            </div>
          </div>
        </div>
        </div>
        <LiveDisplayPathPanel
          code={code}
          selectedId={pageId}
          onSelect={setPageId}
        />
      </div>
    </div>
  );
}
