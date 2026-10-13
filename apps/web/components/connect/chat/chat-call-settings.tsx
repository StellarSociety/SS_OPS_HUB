"use client";

import { useMediaDeviceSelect } from "@livekit/components-react";
import { X } from "lucide-react";
import { toast } from "@/components/ui/toast";
import {
  updateCallPreferences,
  useCallPreferences,
  type CallPreferences,
} from "@/lib/connect/call-preferences";
import { cn } from "@/lib/utils";

export function canPickSpeaker(): boolean {
  return typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;
}

/** Quick settings during a call. The full set lives in Connecteam Settings → Calls. */
export function CallSettingsSheet({
  mode,
  onClose,
}: {
  mode: "audio" | "video";
  onClose: () => void;
}) {
  const preferences = useCallPreferences();
  return (
    <div
      className="fixed inset-0 z-[310] flex items-end justify-center bg-black/50 sm:items-center sm:p-5"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Call settings"
    >
      <div
        className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-[#1d2215] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 text-white shadow-2xl sm:rounded-[28px]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Call settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-white/60 hover:bg-white/10 hover:text-white"
            aria-label="Close settings"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {mode === "video" ? (
          <Section title="Video">
            <ToggleRow
              label="Mirror my video"
              hint="Only changes how you see yourself. Others always see the true image."
              checked={preferences.mirrorSelf}
              onChange={(mirrorSelf) => updateCallPreferences({ mirrorSelf })}
            />
            <ToggleRow
              label="Hide self view"
              hint="Your camera stays on — you just won't see your own picture."
              checked={preferences.hideSelf}
              onChange={(hideSelf) => updateCallPreferences({ hideSelf })}
            />
            <FitRow value={preferences.videoFit} onChange={(videoFit) => updateCallPreferences({ videoFit })} />
          </Section>
        ) : null}

        <Section title="Devices">
          {mode === "video" ? <LiveDeviceRow kind="videoinput" label="Camera" field="videoInputId" /> : null}
          <LiveDeviceRow kind="audioinput" label="Microphone" field="audioInputId" />
          {canPickSpeaker() ? <LiveDeviceRow kind="audiooutput" label="Speaker" field="audioOutputId" /> : null}
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-4">
      <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-white/45">{title}</h3>
      <div className="divide-y divide-white/10 rounded-2xl bg-white/[0.06] px-4">{children}</div>
    </section>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <span>
        <span className="block text-sm">{label}</span>
        {hint ? <span className="mt-0.5 block text-xs text-white/45">{hint}</span> : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn("relative h-7 w-12 shrink-0 rounded-full transition", checked ? "bg-[#4b9f56]" : "bg-white/20")}
      >
        <span
          className={cn(
            "absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all",
            checked ? "left-[22px]" : "left-0.5",
          )}
        />
      </button>
    </div>
  );
}

function FitRow({
  value,
  onChange,
}: {
  value: CallPreferences["videoFit"];
  onChange: (value: CallPreferences["videoFit"]) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <span className="text-sm">Video framing</span>
      <div className="flex rounded-full bg-white/10 p-0.5 text-xs">
        {(
          [
            ["cover", "Fill"],
            ["contain", "Fit"],
          ] as const
        ).map(([option, label]) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={cn("rounded-full px-3 py-1.5 transition", value === option ? "bg-white text-black" : "text-white/70")}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Switches the device in the running call and remembers it for next time. */
function LiveDeviceRow({
  kind,
  label,
  field,
}: {
  kind: MediaDeviceKind;
  label: string;
  field: "videoInputId" | "audioInputId" | "audioOutputId";
}) {
  const { devices, activeDeviceId, setActiveMediaDevice } = useMediaDeviceSelect({
    kind,
    // Already granted for the call, so this only fills in the device names.
    requestPermissions: true,
    onError: () => toast.error(`Could not switch the ${label.toLowerCase()}.`),
  });
  const options = devices.filter((device) => device.deviceId);

  async function pick(deviceId: string) {
    try {
      await setActiveMediaDevice(deviceId);
      updateCallPreferences({ [field]: deviceId });
    } catch {
      toast.error(`Could not switch the ${label.toLowerCase()}.`);
    }
  }

  return (
    <label className="flex items-center justify-between gap-4 py-3">
      <span className="shrink-0 text-sm">{label}</span>
      {options.length === 0 ? (
        <span className="text-sm text-white/45">None found</span>
      ) : (
        <select
          value={activeDeviceId}
          onChange={(event) => void pick(event.target.value)}
          className="min-w-0 max-w-[60%] truncate rounded-xl bg-white/10 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-white/30"
          aria-label={label}
        >
          {options.map((device, index) => (
            <option key={device.deviceId} value={device.deviceId} className="text-black">
              {device.label || `${label} ${index + 1}`}
            </option>
          ))}
        </select>
      )}
    </label>
  );
}
