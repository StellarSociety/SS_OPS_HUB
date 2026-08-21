export type DeviceBrand = "iphone" | "samsung";

export type DeviceIsland = "dynamic-island" | "home-button" | "punch-hole";

export type DevicePreset = {
  id: string;
  brand: DeviceBrand;
  label: string;
  /** CSS viewport width (portrait). */
  width: number;
  /** CSS viewport height (portrait). */
  height: number;
  dpr: number;
  /** Screen corner radius at 1× CSS pixels. */
  cornerRadius: number;
  island: DeviceIsland;
};

export const DEVICE_BRANDS: { key: DeviceBrand; label: string }[] = [
  { key: "iphone", label: "iPhone" },
  { key: "samsung", label: "Samsung" },
];

/** Popular phone CSS viewports (portrait), used as the simulation canvas size. */
export const DEVICE_PRESETS: DevicePreset[] = [
  {
    id: "iphone-se",
    brand: "iphone",
    label: "iPhone SE",
    width: 375,
    height: 667,
    dpr: 2,
    cornerRadius: 0,
    island: "home-button",
  },
  {
    id: "iphone-16",
    brand: "iphone",
    label: "iPhone 16",
    width: 393,
    height: 852,
    dpr: 3,
    cornerRadius: 47,
    island: "dynamic-island",
  },
  {
    id: "iphone-16-pro",
    brand: "iphone",
    label: "iPhone 16 Pro",
    width: 402,
    height: 874,
    dpr: 3,
    cornerRadius: 53,
    island: "dynamic-island",
  },
  {
    id: "iphone-16-plus",
    brand: "iphone",
    label: "iPhone 16 Plus",
    width: 430,
    height: 932,
    dpr: 3,
    cornerRadius: 53,
    island: "dynamic-island",
  },
  {
    id: "iphone-16-pro-max",
    brand: "iphone",
    label: "iPhone 16 Pro Max",
    width: 440,
    height: 956,
    dpr: 3,
    cornerRadius: 55,
    island: "dynamic-island",
  },
  {
    id: "galaxy-s24",
    brand: "samsung",
    label: "Galaxy S24",
    width: 360,
    height: 780,
    dpr: 3,
    cornerRadius: 26,
    island: "punch-hole",
  },
  {
    id: "galaxy-s25",
    brand: "samsung",
    label: "Galaxy S25",
    width: 360,
    height: 800,
    dpr: 3,
    cornerRadius: 26,
    island: "punch-hole",
  },
  {
    id: "galaxy-s24-ultra",
    brand: "samsung",
    label: "Galaxy S24 Ultra",
    width: 384,
    height: 832,
    dpr: 3,
    cornerRadius: 16,
    island: "punch-hole",
  },
  {
    id: "galaxy-s25-ultra",
    brand: "samsung",
    label: "Galaxy S25 Ultra",
    width: 412,
    height: 891,
    dpr: 3.5,
    cornerRadius: 18,
    island: "punch-hole",
  },
];

export const DEFAULT_DEVICE_ID = "iphone-16-pro";

export function getDevicePreset(id: string): DevicePreset {
  return DEVICE_PRESETS.find((device) => device.id === id) ?? DEVICE_PRESETS[2];
}

export function devicesForBrand(brand: DeviceBrand): DevicePreset[] {
  return DEVICE_PRESETS.filter((device) => device.brand === brand);
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x || 1;
}

const KNOWN_RATIOS: { label: string; value: number }[] = [
  { label: "19.5:9", value: 19.5 / 9 },
  { label: "20:9", value: 20 / 9 },
  { label: "19.3:9", value: 19.3 / 9 },
  { label: "16:9", value: 16 / 9 },
];

/** Closest common phone ratio, or a reduced W:H. */
export function deviceRatioLabel(width: number, height: number): string {
  const actual = height / width;
  let best = KNOWN_RATIOS[0];
  let bestDiff = Infinity;
  for (const ratio of KNOWN_RATIOS) {
    const diff = Math.abs(actual - ratio.value);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = ratio;
    }
  }
  if (bestDiff < 0.06) return best.label;
  const divisor = gcd(width, height);
  return `${width / divisor}:${height / divisor}`;
}
