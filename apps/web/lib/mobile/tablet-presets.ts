export type TabletOrientation = "landscape" | "portrait";

export type TabletPreset = {
  id: string;
  label: string;
  /** CSS viewport width in portrait. */
  portraitWidth: number;
  /** CSS viewport height in portrait. */
  portraitHeight: number;
  dpr: number;
  /** Screen corner radius at 1× CSS pixels. */
  cornerRadius: number;
};

/** Restaurant iPad CSS viewports. Stored in portrait; the simulator swaps for landscape. */
export const TABLET_PRESETS: TabletPreset[] = [
  {
    id: "ipad-mini",
    label: "iPad mini",
    portraitWidth: 744,
    portraitHeight: 1133,
    dpr: 2,
    cornerRadius: 18,
  },
  {
    id: "ipad",
    label: "iPad",
    portraitWidth: 820,
    portraitHeight: 1180,
    dpr: 2,
    cornerRadius: 18,
  },
  {
    id: "ipad-air-11",
    label: "iPad Air 11\"",
    portraitWidth: 820,
    portraitHeight: 1180,
    dpr: 2,
    cornerRadius: 18,
  },
  {
    id: "ipad-pro-11",
    label: "iPad Pro 11\"",
    portraitWidth: 834,
    portraitHeight: 1210,
    dpr: 2,
    cornerRadius: 22,
  },
  {
    id: "ipad-pro-13",
    label: "iPad Pro 13\"",
    portraitWidth: 1032,
    portraitHeight: 1376,
    dpr: 2,
    cornerRadius: 22,
  },
];

export const DEFAULT_TABLET_ID = "ipad";
export const DEFAULT_TABLET_ORIENTATION: TabletOrientation = "landscape";

export function getTabletPreset(id: string): TabletPreset {
  return TABLET_PRESETS.find((tablet) => tablet.id === id) ?? TABLET_PRESETS[1]!;
}

export function tabletViewport(
  tablet: TabletPreset,
  orientation: TabletOrientation,
): { width: number; height: number } {
  if (orientation === "landscape") {
    return { width: tablet.portraitHeight, height: tablet.portraitWidth };
  }
  return { width: tablet.portraitWidth, height: tablet.portraitHeight };
}
