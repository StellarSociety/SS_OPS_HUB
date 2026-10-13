import { describe, expect, it } from "vitest";
import { PATTERNS, SOUND_PRESETS, soundLength } from "@/lib/connect/sounds";

const ringtones = SOUND_PRESETS.filter((p) => p.group === "ring").map((p) => p.key);

describe("call ringtones", () => {
  it.each(ringtones)("%s plays one note at a time", (key) => {
    const notes = [...PATTERNS[key as Exclude<typeof key, "none">]].sort((a, b) => a.at - b.at);
    for (let i = 1; i < notes.length; i++) {
      const previous = notes[i - 1]!;
      expect(previous.at + previous.length).toBeLessThanOrEqual(notes[i]!.at + 1e-9);
    }
  });

  it.each(ringtones)("%s is short enough to ring with a pause", (key) => {
    expect(soundLength(key)).toBeLessThanOrEqual(2.5);
  });
});
