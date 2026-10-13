/**
 * Connecteam alert sounds, synthesised with Web Audio (no files to load).
 * Settings are per device (localStorage): each browser / phone can pick its
 * own tones and volume. Browsers only allow audio after the user has
 * interacted with the page, so `unlockAudio()` runs on the first click or key.
 */

export const SOUND_PRESETS = [
  { key: "chime", label: "Chime", group: "short" },
  { key: "ping", label: "Ping", group: "short" },
  { key: "pop", label: "Pop", group: "short" },
  { key: "bell", label: "Bell", group: "short" },
  { key: "marimba", label: "Marimba", group: "short" },
  { key: "knock", label: "Soft knock", group: "short" },
  { key: "bubble", label: "Bubble", group: "short" },
  { key: "retro", label: "Retro", group: "short" },
  { key: "doorbell", label: "Doorbell", group: "long" },
  { key: "harp", label: "Harp", group: "long" },
  { key: "glass", label: "Glass", group: "long" },
  { key: "kalimba", label: "Kalimba", group: "long" },
  { key: "ripple", label: "Ripple", group: "long" },
  { key: "twinkle", label: "Twinkle", group: "long" },
  { key: "birdsong", label: "Birdsong", group: "long" },
  { key: "fanfare", label: "Fanfare", group: "long" },
  { key: "pad", label: "Soft swell", group: "long" },
  { key: "gong", label: "Gong", group: "long" },
  { key: "none", label: "No sound", group: "none" },
] as const;

export const SOUND_GROUPS = [
  { key: "short", label: "Short" },
  { key: "long", label: "Longer" },
] as const;

export type SoundKey = (typeof SOUND_PRESETS)[number]["key"];

export type SoundSettings = {
  enabled: boolean;
  /** 0–1 */
  volume: number;
  chatSound: SoundKey;
  feedSound: SoundKey;
  /** Also play while this tab is in the background or the screen is idle. */
  playWhenHidden: boolean;
};

export const DEFAULT_SOUND_SETTINGS: SoundSettings = {
  enabled: true,
  volume: 0.7,
  chatSound: "chime",
  feedSound: "pop",
  playWhenHidden: true,
};

const STORAGE_KEY = "ssops.connect.sound";
/** Older widget-only mute flag. */
const LEGACY_MUTE_KEY = "ssops.chat.muted";
const CHANGE_EVENT = "ssops-connect-sound-change";

const isSoundKey = (value: unknown): value is SoundKey =>
  SOUND_PRESETS.some((p) => p.key === value);

/** Venue-wide defaults an admin sets for everyone (Connecteam Settings). */
export type VenueSoundDefaults = {
  enabled: boolean;
  volume: number;
  chatSound: SoundKey;
  feedSound: SoundKey;
  /** When true, replaces personal choices saved before `updatedAt`. */
  override: boolean;
  updatedAt: number;
};

let venueDefaults: VenueSoundDefaults | null = null;

/** Called once the venue's defaults are loaded (chat widget / settings page). */
export function setVenueSoundDefaults(next: VenueSoundDefaults | null) {
  if (JSON.stringify(next) === JSON.stringify(venueDefaults)) return;
  venueDefaults = next;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function normalizeVenueSoundDefaults(raw: unknown): VenueSoundDefaults | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  if (!isSoundKey(v.chatSound) && !isSoundKey(v.feedSound)) return null;
  return {
    enabled: v.enabled !== false,
    volume:
      typeof v.volume === "number" && v.volume >= 0 && v.volume <= 1
        ? v.volume
        : DEFAULT_SOUND_SETTINGS.volume,
    chatSound: isSoundKey(v.chatSound) ? v.chatSound : DEFAULT_SOUND_SETTINGS.chatSound,
    feedSound: isSoundKey(v.feedSound) ? v.feedSound : DEFAULT_SOUND_SETTINGS.feedSound,
    override: v.override === true,
    updatedAt: typeof v.updatedAt === "number" ? v.updatedAt : 0,
  };
}

function baseSettings(): SoundSettings {
  if (!venueDefaults) return DEFAULT_SOUND_SETTINGS;
  return {
    ...DEFAULT_SOUND_SETTINGS,
    enabled: venueDefaults.enabled,
    volume: venueDefaults.volume,
    chatSound: venueDefaults.chatSound,
    feedSound: venueDefaults.feedSound,
  };
}

/** True when this device has its own sound choices that still apply. */
export function hasPersonalSoundSettings(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const savedAt = Number((JSON.parse(raw) as { savedAt?: number }).savedAt) || 0;
    return !(venueDefaults?.override && venueDefaults.updatedAt > savedAt);
  } catch {
    return false;
  }
}

export function readSoundSettings(): SoundSettings {
  if (typeof window === "undefined") return DEFAULT_SOUND_SETTINGS;
  const base = baseSettings();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const legacyMuted = localStorage.getItem(LEGACY_MUTE_KEY) === "1";
      return legacyMuted ? { ...base, enabled: false } : base;
    }
    const parsed = JSON.parse(raw) as Partial<SoundSettings> & { savedAt?: number };
    // An admin reset everyone to the venue defaults after this was saved.
    if (venueDefaults?.override && venueDefaults.updatedAt > (Number(parsed.savedAt) || 0)) {
      return { ...base, playWhenHidden: parsed.playWhenHidden !== false };
    }
    return {
      enabled: parsed.enabled !== false,
      volume:
        typeof parsed.volume === "number" && parsed.volume >= 0 && parsed.volume <= 1
          ? parsed.volume
          : base.volume,
      chatSound: isSoundKey(parsed.chatSound) ? parsed.chatSound : base.chatSound,
      feedSound: isSoundKey(parsed.feedSound) ? parsed.feedSound : base.feedSound,
      playWhenHidden: parsed.playWhenHidden !== false,
    };
  } catch {
    return base;
  }
}

/** Drops this device's own choices so the venue defaults apply again. */
export function clearSoundSettings() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_MUTE_KEY);
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function writeSoundSettings(next: SoundSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...next, savedAt: Date.now() }));
    localStorage.removeItem(LEGACY_MUTE_KEY);
  } catch {
    // Private mode / quota: settings just won't persist.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** For useSyncExternalStore / effects: fires when settings change in any tab. */
export function subscribeSoundSettings(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

let audioCtx: AudioContext | null = null;

export function unlockAudio() {
  if (typeof window === "undefined") return;
  try {
    audioCtx ??= new AudioContext();
    if (audioCtx.state === "suspended") void audioCtx.resume();
  } catch {
    audioCtx = null;
  }
}

type Note = {
  freq: number;
  at: number;
  length: number;
  type?: OscillatorType;
  gain?: number;
  /** Pitch slide target (Hz) over the note. */
  slideTo?: number;
  /** Fade-in time (s); default is a quick pluck. */
  attack?: number;
};

const PATTERNS: Record<Exclude<SoundKey, "none">, Note[]> = {
  chime: [
    { freq: 880, at: 0, length: 0.28 },
    { freq: 1318.5, at: 0.12, length: 0.28 },
  ],
  ping: [{ freq: 1567.98, at: 0, length: 0.35, gain: 0.8 }],
  pop: [{ freq: 420, at: 0, length: 0.12, slideTo: 900, type: "triangle" }],
  bell: [
    { freq: 1046.5, at: 0, length: 0.9, gain: 0.7 },
    { freq: 2093, at: 0, length: 0.5, gain: 0.25 },
    { freq: 3135.96, at: 0, length: 0.3, gain: 0.12 },
  ],
  marimba: [
    { freq: 523.25, at: 0, length: 0.22, type: "triangle" },
    { freq: 659.25, at: 0.09, length: 0.22, type: "triangle" },
    { freq: 783.99, at: 0.18, length: 0.3, type: "triangle" },
  ],
  knock: [
    { freq: 180, at: 0, length: 0.09, type: "triangle", gain: 1.2 },
    { freq: 180, at: 0.14, length: 0.09, type: "triangle", gain: 1.2 },
  ],
  bubble: [
    { freq: 300, at: 0, length: 0.14, slideTo: 1100 },
    { freq: 450, at: 0.16, length: 0.14, slideTo: 1500 },
  ],
  retro: [
    { freq: 987.77, at: 0, length: 0.08, type: "square", gain: 0.35 },
    { freq: 1318.51, at: 0.08, length: 0.2, type: "square", gain: 0.35 },
  ],
  // Longer tones (~1–2.5 s)
  doorbell: [
    { freq: 1318.51, at: 0, length: 0.9, gain: 0.9 },
    { freq: 2637.02, at: 0, length: 0.5, gain: 0.15 },
    { freq: 1046.5, at: 0.55, length: 1.3, gain: 0.9 },
    { freq: 2093, at: 0.55, length: 0.7, gain: 0.15 },
  ],
  harp: [
    { freq: 523.25, at: 0, length: 1.1, type: "triangle" },
    { freq: 659.25, at: 0.1, length: 1.1, type: "triangle" },
    { freq: 783.99, at: 0.2, length: 1.1, type: "triangle" },
    { freq: 1046.5, at: 0.3, length: 1.2, type: "triangle" },
    { freq: 1318.51, at: 0.4, length: 1.3, type: "triangle", gain: 0.8 },
  ],
  glass: [
    { freq: 2093, at: 0, length: 1.8, gain: 0.6 },
    { freq: 3135.96, at: 0, length: 1.2, gain: 0.25 },
    { freq: 2637.02, at: 0.35, length: 1.6, gain: 0.5 },
    { freq: 3951.07, at: 0.35, length: 1, gain: 0.18 },
  ],
  kalimba: [
    { freq: 783.99, at: 0, length: 0.8, gain: 0.9 },
    { freq: 987.77, at: 0.18, length: 0.8, gain: 0.85 },
    { freq: 1174.66, at: 0.36, length: 0.8, gain: 0.8 },
    { freq: 987.77, at: 0.54, length: 1.1, gain: 0.75 },
  ],
  ripple: [
    { freq: 1567.98, at: 0, length: 0.6, gain: 0.7 },
    { freq: 1318.51, at: 0.12, length: 0.6, gain: 0.7 },
    { freq: 1046.5, at: 0.24, length: 0.7, gain: 0.7 },
    { freq: 783.99, at: 0.36, length: 0.8, gain: 0.7 },
    { freq: 659.25, at: 0.48, length: 1.1, gain: 0.7 },
  ],
  twinkle: [
    { freq: 1760, at: 0, length: 0.5, gain: 0.55 },
    { freq: 2349.32, at: 0.15, length: 0.5, gain: 0.5 },
    { freq: 1975.53, at: 0.3, length: 0.5, gain: 0.5 },
    { freq: 2637.02, at: 0.45, length: 0.9, gain: 0.5 },
    { freq: 3520, at: 0.6, length: 1.1, gain: 0.35 },
  ],
  birdsong: [
    { freq: 2200, at: 0, length: 0.12, slideTo: 3200, gain: 0.45 },
    { freq: 2400, at: 0.16, length: 0.12, slideTo: 3400, gain: 0.45 },
    { freq: 3000, at: 0.45, length: 0.25, slideTo: 2000, gain: 0.45 },
    { freq: 2600, at: 0.8, length: 0.1, slideTo: 3600, gain: 0.4 },
    { freq: 2800, at: 0.93, length: 0.1, slideTo: 3800, gain: 0.4 },
  ],
  fanfare: [
    { freq: 523.25, at: 0, length: 0.25, type: "triangle" },
    { freq: 659.25, at: 0.18, length: 0.25, type: "triangle" },
    { freq: 783.99, at: 0.36, length: 0.3, type: "triangle" },
    { freq: 1046.5, at: 0.6, length: 1.2, type: "triangle" },
    { freq: 783.99, at: 0.6, length: 1.2, type: "triangle", gain: 0.5 },
    { freq: 659.25, at: 0.6, length: 1.2, type: "triangle", gain: 0.4 },
  ],
  pad: [
    { freq: 523.25, at: 0, length: 1.8, attack: 0.35, gain: 0.6 },
    { freq: 659.25, at: 0, length: 1.8, attack: 0.35, gain: 0.5 },
    { freq: 783.99, at: 0, length: 1.8, attack: 0.35, gain: 0.5 },
    { freq: 1046.5, at: 0.3, length: 1.5, attack: 0.3, gain: 0.35 },
  ],
  gong: [
    { freq: 196, at: 0, length: 2.5, gain: 1.1 },
    { freq: 293.66, at: 0, length: 2, gain: 0.45 },
    { freq: 415.3, at: 0, length: 1.6, gain: 0.3 },
    { freq: 587.33, at: 0, length: 1.2, gain: 0.2 },
  ],
};

export function playSound(key: SoundKey, volume = DEFAULT_SOUND_SETTINGS.volume) {
  if (key === "none") return;
  const ctx = audioCtx;
  if (!ctx || ctx.state !== "running") return;
  const peak = 0.25 * Math.max(0, Math.min(1, volume));
  if (peak <= 0) return;
  const start = ctx.currentTime;
  for (const note of PATTERNS[key]) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = note.type ?? "sine";
    const t = start + note.at;
    osc.frequency.setValueAtTime(note.freq, t);
    if (note.slideTo) osc.frequency.exponentialRampToValueAtTime(note.slideTo, t + note.length);
    const level = Math.max(0.0002, peak * (note.gain ?? 1));
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(level, t + (note.attack ?? 0.012));
    gain.gain.exponentialRampToValueAtTime(0.0001, t + note.length);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + note.length + 0.05);
  }
}

/** Plays the alert for `kind` if this device's settings allow it right now. */
export function playAlert(kind: "chat" | "feed") {
  const settings = readSoundSettings();
  if (!settings.enabled) return;
  if (!settings.playWhenHidden && document.visibilityState !== "visible") return;
  playSound(kind === "chat" ? settings.chatSound : settings.feedSound, settings.volume);
}
