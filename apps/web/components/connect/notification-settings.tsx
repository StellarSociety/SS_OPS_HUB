"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { BellRing, Play, Volume2 } from "lucide-react";
import { DeviceNotificationSettingsCard } from "@/components/pwa/device-notifications";
import { toast } from "@/components/ui/toast";
import {
  saveMyConnectAlertPrefs,
  saveVenueSoundDefaults,
} from "@/lib/actions/connect-notification-prefs";
import {
  CONNECT_ALERT_OPTIONS,
  type ConnectAlertKey,
  type ConnectAlertPrefs,
} from "@/lib/connect/notification-prefs";
import {
  DEFAULT_SOUND_SETTINGS,
  clearSoundSettings,
  hasPersonalSoundSettings,
  setVenueSoundDefaults,
  SOUND_GROUPS,
  SOUND_PRESETS,
  playSound,
  readSoundSettings,
  subscribeSoundSettings,
  unlockAudio,
  writeSoundSettings,
  type SoundGroupKey,
  type SoundKey,
  type SoundSettings,
  type VenueSoundDefaults,
} from "@/lib/connect/sounds";
import { cn } from "@/lib/utils";

function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
        checked ? "bg-[var(--venue-primary,#818a40)]" : "bg-black/15",
      )}
    >
      <span
        className={cn(
          "inline-block h-5 w-5 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-[22px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

function Card({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-black/5 bg-white p-5">
      <h2 className="font-serif text-lg text-[#3D421F]">{title}</h2>
      <p className="mt-1 text-sm text-black/55">{description}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

// Snapshot of the device's sound settings, cached so useSyncExternalStore
// sees a stable value until storage actually changes.
let cachedRaw: string | null = null;
let cachedSettings: SoundSettings = DEFAULT_SOUND_SETTINGS;
function soundSnapshot(): SoundSettings {
  const next = readSoundSettings();
  const raw = JSON.stringify(next);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedSettings = next;
  }
  return cachedSettings;
}

const ALERT_GROUPS: SoundGroupKey[] = ["short", "long"];
const RING_GROUPS: SoundGroupKey[] = ["ring", "long", "short"];

function SoundPicker({
  label,
  hint,
  value,
  volume,
  disabled,
  groups = ALERT_GROUPS,
  onChange,
}: {
  label: string;
  hint?: string;
  value: SoundKey;
  volume: number;
  disabled: boolean;
  groups?: SoundGroupKey[];
  onChange: (next: SoundKey) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 py-3">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-[#2B2F16]">{label}</span>
        {hint ? <span className="block text-xs text-black/50">{hint}</span> : null}
      </span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const next = e.target.value as SoundKey;
          onChange(next);
          unlockAudio();
          playSound(next, volume);
        }}
        className="h-9 rounded-md border border-black/10 bg-white px-2 text-sm text-[#3D421F] disabled:opacity-50"
        aria-label={label}
      >
        {groups.map((key) => SOUND_GROUPS.find((g) => g.key === key)!).map((g) => (
          <optgroup key={g.key} label={g.label}>
            {SOUND_PRESETS.filter((p) => p.group === g.key).map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </optgroup>
        ))}
        <option value="none">No sound</option>
      </select>
      <button
        type="button"
        disabled={disabled || value === "none"}
        onClick={() => {
          unlockAudio();
          playSound(value, volume);
        }}
        className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[var(--venue-secondary,#F0F3DD)] px-3 text-sm font-medium text-[#3D421F] hover:opacity-90 disabled:opacity-50"
      >
        <Play className="h-3.5 w-3.5" aria-hidden />
        Play
      </button>
    </div>
  );
}

/** Admins: the sounds everyone at the venue starts with. */
function VenueDefaultsCard({
  venueName,
  initial,
  onSaved,
}: {
  venueName: string;
  initial: VenueSoundDefaults | null;
  onSaved: (next: VenueSoundDefaults) => void;
}) {
  const [draft, setDraft] = useState({
    enabled: initial?.enabled ?? DEFAULT_SOUND_SETTINGS.enabled,
    volume: initial?.volume ?? DEFAULT_SOUND_SETTINGS.volume,
    chatSound: initial?.chatSound ?? DEFAULT_SOUND_SETTINGS.chatSound,
    feedSound: initial?.feedSound ?? DEFAULT_SOUND_SETTINGS.feedSound,
    callSound: initial?.callSound ?? DEFAULT_SOUND_SETTINGS.callSound,
  });
  const [override, setOverride] = useState(false);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await saveVenueSoundDefaults({ ...draft, override });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      onSaved(result.defaults);
      setOverride(false);
      toast.saved(
        override
          ? "Default sounds saved and applied to everyone."
          : "Default sounds saved for everyone who hasn't picked their own.",
      );
    });
  }

  return (
    <Card
      title={`Default sounds for everyone at ${venueName}`}
      description="What people hear until they choose their own sounds below. Only Connecteam admins see this."
    >
      <div className="divide-y divide-black/5">
        <div className="flex items-center gap-4 pb-3">
          <p className="min-w-0 flex-1 text-sm font-medium text-[#2B2F16]">Sound on by default</p>
          <Toggle
            checked={draft.enabled}
            label="Sound on by default"
            onChange={(enabled) => setDraft((d) => ({ ...d, enabled }))}
          />
        </div>
        <SoundPicker
          label="Chat messages"
          value={draft.chatSound}
          volume={draft.volume}
          disabled={false}
          onChange={(chatSound) => setDraft((d) => ({ ...d, chatSound }))}
        />
        <SoundPicker
          label="Feed posts, comments & reactions"
          value={draft.feedSound}
          volume={draft.volume}
          disabled={false}
          onChange={(feedSound) => setDraft((d) => ({ ...d, feedSound }))}
        />
        <SoundPicker
          label="Incoming calls"
          value={draft.callSound}
          volume={draft.volume}
          disabled={false}
          groups={RING_GROUPS}
          onChange={(callSound) => setDraft((d) => ({ ...d, callSound }))}
        />
        <div className="flex flex-wrap items-center gap-3 py-3">
          <span className="min-w-0 flex-1 text-sm font-medium text-[#2B2F16]">Volume</span>
          <Volume2 className="h-4 w-4 text-black/40" aria-hidden />
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(draft.volume * 100)}
            onChange={(e) => setDraft((d) => ({ ...d, volume: Number(e.target.value) / 100 }))}
            className="w-44 accent-[var(--venue-primary,#818a40)]"
            aria-label="Default volume"
          />
          <span className="w-10 text-right text-sm tabular-nums text-black/55">
            {Math.round(draft.volume * 100)}%
          </span>
        </div>
        <div className="flex items-center gap-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-[#2B2F16]">Replace everyone&apos;s personal choices</p>
            <p className="text-xs text-black/50">
              Resets people who already picked their own sounds to these. They can change them again afterwards.
            </p>
          </div>
          <Toggle
            checked={override}
            label="Replace everyone's personal choices"
            onChange={setOverride}
          />
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="inline-flex h-9 items-center rounded-md bg-[var(--venue-primary,#818a40)] px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Saving…" : override ? "Save & apply to everyone" : "Save defaults"}
        </button>
      </div>
    </Card>
  );
}

export function ConnectNotificationSettings({
  initialPrefs,
  venueName,
  soundDefaults,
  canSetDefaults,
}: {
  initialPrefs: ConnectAlertPrefs;
  venueName: string;
  soundDefaults: VenueSoundDefaults | null;
  canSetDefaults: boolean;
}) {
  const [prefs, setPrefs] = useState(initialPrefs);
  const [pending, startTransition] = useTransition();
  const sound = useSyncExternalStore(subscribeSoundSettings, soundSnapshot, () => DEFAULT_SOUND_SETTINGS);
  const personal = useSyncExternalStore(subscribeSoundSettings, hasPersonalSoundSettings, () => false);

  // Make the venue's defaults the starting point on this device.
  useEffect(() => {
    setVenueSoundDefaults(soundDefaults);
  }, [soundDefaults]);

  function setAlert(key: ConnectAlertKey, value: boolean) {
    const previous = prefs;
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    startTransition(async () => {
      const result = await saveMyConnectAlertPrefs(next);
      if (!result.ok) {
        setPrefs(previous);
        toast.error(result.error);
        return;
      }
      toast.saved("Notification settings saved.");
    });
  }

  function updateSound(patch: Partial<SoundSettings>) {
    writeSoundSettings({ ...sound, ...patch });
  }

  return (
    <div className="space-y-5">
      <Card
        title="Alerts when you're away"
        description="Turn on device notifications to get chat and feed alerts as system pop-ups — even when the Hub is closed, minimised or the screen is idle. Do this once on each computer and phone you use."
      >
        <DeviceNotificationSettingsCard className="border-black/5 bg-[#F7F8F2]" />
        <p className="mt-3 flex gap-2 text-xs leading-relaxed text-black/50">
          <BellRing className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          System pop-ups use your device&apos;s own notification sound. On a computer the browser must
          stay running in the background (it can have no windows open). On iPhone, add the Hub to your
          Home Screen first.
        </p>
      </Card>

      <Card
        title="What alerts you"
        description="Applies to the bell, app badges and device pop-ups for your account on every device."
      >
        <ul className="divide-y divide-black/5">
          {CONNECT_ALERT_OPTIONS.map((option) => (
            <li key={option.key} className="flex items-center gap-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[#2B2F16]">{option.label}</p>
                <p className="text-xs text-black/50">{option.hint}</p>
              </div>
              <Toggle
                checked={prefs[option.key]}
                disabled={pending}
                label={option.label}
                onChange={(value) => setAlert(option.key, value)}
              />
            </li>
          ))}
        </ul>
      </Card>

      <Card
        title="Sounds on this device"
        description="Played while the Hub is open in a browser tab. Saved on this device only, so a phone and a computer can sound different."
      >
        <p className="-mt-1 mb-3 flex flex-wrap items-center gap-2 text-xs text-black/50">
          {personal ? (
            <>
              Using your own choices on this device.
              <button
                type="button"
                onClick={clearSoundSettings}
                className="font-medium text-[var(--venue-primary,#818a40)] hover:underline"
              >
                Use {venueName} defaults
              </button>
            </>
          ) : (
            `Using the ${venueName} defaults. Change anything below to make it your own.`
          )}
        </p>
        <div className="flex items-center gap-4 border-b border-black/5 pb-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-[#2B2F16]">Sound alerts</p>
            <p className="text-xs text-black/50">Play a sound for new messages and feed activity.</p>
          </div>
          <Toggle
            checked={sound.enabled}
            label="Sound alerts"
            onChange={(enabled) => {
              updateSound({ enabled });
              if (enabled) {
                unlockAudio();
                playSound(sound.chatSound, sound.volume);
              }
            }}
          />
        </div>
        <div className="divide-y divide-black/5">
          <SoundPicker
            label="Chat messages"
            value={sound.chatSound}
            volume={sound.volume}
            disabled={!sound.enabled}
            onChange={(chatSound) => updateSound({ chatSound })}
          />
          <SoundPicker
            label="Feed posts, comments & reactions"
            value={sound.feedSound}
            volume={sound.volume}
            disabled={!sound.enabled}
            onChange={(feedSound) => updateSound({ feedSound })}
          />
          <SoundPicker
            label="Incoming calls"
            hint="Rings while someone calls you — even with sound alerts off."
            value={sound.callSound}
            volume={sound.volume}
            disabled={false}
            groups={RING_GROUPS}
            onChange={(callSound) => updateSound({ callSound })}
          />
          <div className="flex flex-wrap items-center gap-3 py-3">
            <span className="min-w-0 flex-1 text-sm font-medium text-[#2B2F16]">Volume</span>
            <Volume2 className="h-4 w-4 text-black/40" aria-hidden />
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(sound.volume * 100)}
              disabled={!sound.enabled}
              onChange={(e) => updateSound({ volume: Number(e.target.value) / 100 })}
              onPointerUp={() => {
                unlockAudio();
                playSound(sound.chatSound, sound.volume);
              }}
              className="w-44 accent-[var(--venue-primary,#818a40)] disabled:opacity-50"
              aria-label="Volume"
            />
            <span className="w-10 text-right text-sm tabular-nums text-black/55">
              {Math.round(sound.volume * 100)}%
            </span>
          </div>
          <div className="flex items-center gap-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[#2B2F16]">Play in the background</p>
              <p className="text-xs text-black/50">
                Keep playing sounds while the Hub tab is hidden or the computer is idle.
              </p>
            </div>
            <Toggle
              checked={sound.playWhenHidden}
              disabled={!sound.enabled}
              label="Play in the background"
              onChange={(playWhenHidden) => updateSound({ playWhenHidden })}
            />
          </div>
        </div>
      </Card>

      {canSetDefaults ? (
        <VenueDefaultsCard
          venueName={venueName}
          initial={soundDefaults}
          onSaved={(next) => setVenueSoundDefaults(next)}
        />
      ) : null}
    </div>
  );
}
