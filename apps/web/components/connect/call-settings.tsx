"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { canPickSpeaker } from "@/components/connect/chat/chat-call-settings";
import {
  DEFAULT_CALL_PREFERENCES,
  updateCallPreferences,
  useCallPreferences,
} from "@/lib/connect/call-preferences";
import { cn } from "@/lib/utils";

/** Connecteam Settings → Calls. Saved on this device, like the alert sounds. */
export function ConnectCallSettings() {
  const prefs = useCallPreferences();
  const devices = useDevices();
  const [previewOn, setPreviewOn] = useState(false);

  return (
    <div className="space-y-6">
      <Card
        title="Video"
        description="How video calls look to you. These apply on this device only."
      >
        <div className="grid gap-5 md:grid-cols-[1fr_260px]">
          <div className="divide-y divide-black/5">
            <Row label="Mirror my video" hint="Only changes how you see yourself — others always see the true image.">
              <Toggle
                label="Mirror my video"
                checked={prefs.mirrorSelf}
                onChange={(mirrorSelf) => updateCallPreferences({ mirrorSelf })}
              />
            </Row>
            <Row label="Hide self view" hint="Your camera stays on; you just won't see your own picture.">
              <Toggle
                label="Hide self view"
                checked={prefs.hideSelf}
                onChange={(hideSelf) => updateCallPreferences({ hideSelf })}
              />
            </Row>
            <Row label="Start video calls with camera off">
              <Toggle
                label="Start video calls with camera off"
                checked={prefs.startCameraOff}
                onChange={(startCameraOff) => updateCallPreferences({ startCameraOff })}
              />
            </Row>
            <Row label="Video framing" hint="Fill crops the edges to fill the window; Fit shows the whole picture.">
              <Segmented
                value={prefs.videoFit}
                options={[
                  ["cover", "Fill"],
                  ["contain", "Fit"],
                ]}
                onChange={(videoFit) => updateCallPreferences({ videoFit })}
              />
            </Row>
          </div>
          <CameraPreview
            on={previewOn}
            onToggle={() => setPreviewOn((v) => !v)}
            deviceId={prefs.videoInputId}
            mirror={prefs.mirrorSelf}
            fit={prefs.videoFit}
            onPermission={devices.refresh}
          />
        </div>
      </Card>

      <Card title="Devices" description="Which camera, microphone and speaker calls start with.">
        {!devices.labelled ? (
          <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg bg-[var(--venue-secondary,#F0F3DD)]/60 px-4 py-3 text-sm text-[#3D421F]">
            <span className="min-w-0 flex-1">Allow camera and microphone access to see your device names.</span>
            <button
              type="button"
              onClick={() => void devices.requestAccess()}
              className="h-9 rounded-md bg-[var(--venue-primary,#818a40)] px-3 text-sm font-medium text-white hover:opacity-90"
            >
              Allow access
            </button>
          </div>
        ) : null}
        <div className="divide-y divide-black/5">
          <DeviceSelect
            label="Camera"
            devices={devices.list.filter((d) => d.kind === "videoinput")}
            value={prefs.videoInputId}
            onChange={(videoInputId) => updateCallPreferences({ videoInputId })}
          />
          <DeviceSelect
            label="Microphone"
            devices={devices.list.filter((d) => d.kind === "audioinput")}
            value={prefs.audioInputId}
            onChange={(audioInputId) => updateCallPreferences({ audioInputId })}
          />
          {canPickSpeaker() ? (
            <DeviceSelect
              label="Speaker"
              devices={devices.list.filter((d) => d.kind === "audiooutput")}
              value={prefs.audioOutputId}
              onChange={(audioOutputId) => updateCallPreferences({ audioOutputId })}
            />
          ) : null}
          <Row label="Join calls muted">
            <Toggle
              label="Join calls muted"
              checked={prefs.startMuted}
              onChange={(startMuted) => updateCallPreferences({ startMuted })}
            />
          </Row>
        </div>
      </Card>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => updateCallPreferences(DEFAULT_CALL_PREFERENCES)}
          className="text-sm text-black/50 underline-offset-2 hover:text-black/75 hover:underline"
        >
          Reset call settings
        </button>
      </div>
    </div>
  );
}

function useDevices() {
  const [list, setList] = useState<MediaDeviceInfo[]>([]);
  const refresh = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      setList(await navigator.mediaDevices.enumerateDevices());
    } catch {
      setList([]);
    }
  }, []);

  useEffect(() => {
    // enumerateDevices resolves asynchronously, so this isn't a synchronous effect update.
    const load = () => void refresh();
    load();
    navigator.mediaDevices?.addEventListener?.("devicechange", load);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", load);
  }, [refresh]);

  async function requestAccess() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      stream.getTracks().forEach((track) => track.stop());
    } catch {
      // Denied or no camera: still list whatever the browser exposes.
    }
    await refresh();
  }

  return {
    list,
    labelled: list.some((d) => d.label),
    refresh,
    requestAccess,
  };
}

function CameraPreview({
  on,
  onToggle,
  deviceId,
  mirror,
  fit,
  onPermission,
}: {
  on: boolean;
  onToggle: () => void;
  deviceId: string | null;
  mirror: boolean;
  fit: "cover" | "contain";
  onPermission: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!on) return;
    let stream: MediaStream | null = null;
    let alive = true;
    navigator.mediaDevices
      .getUserMedia({ video: deviceId ? { deviceId: { ideal: deviceId } } : true })
      .then((next) => {
        if (!alive) {
          next.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = next;
        setError(null);
        if (video.current) video.current.srcObject = next;
        onPermission();
      })
      .catch(() => {
        if (alive) setError("Camera unavailable. Check the browser's camera permission.");
      });
    return () => {
      alive = false;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [deviceId, on, onPermission]);

  return (
    <div className="flex flex-col gap-2">
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-[#11150c]">
        {on && !error ? (
          <video
            ref={video}
            autoPlay
            playsInline
            muted
            className={cn("h-full w-full", fit === "contain" ? "object-contain" : "object-cover")}
            style={mirror ? { transform: "scaleX(-1)" } : undefined}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-xs text-white/55">
            <Camera className="h-6 w-6" aria-hidden />
            {error ?? "Preview how you'll look"}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onToggle}
        className="h-9 rounded-md bg-[var(--venue-secondary,#F0F3DD)] px-3 text-sm font-medium text-[#3D421F] hover:opacity-90"
      >
        {on ? "Stop preview" : "Test camera"}
      </button>
    </div>
  );
}

function DeviceSelect({
  label,
  devices,
  value,
  onChange,
}: {
  label: string;
  devices: MediaDeviceInfo[];
  value: string | null;
  onChange: (deviceId: string | null) => void;
}) {
  const known = devices.some((d) => d.deviceId === value);
  return (
    <Row label={label}>
      <select
        value={known && value ? value : ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="h-9 max-w-[16rem] truncate rounded-md border border-black/10 bg-white px-2 text-sm text-[#3D421F]"
        aria-label={label}
      >
        <option value="">System default</option>
        {devices
          .filter((d) => d.deviceId && d.deviceId !== "default")
          .map((d, index) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `${label} ${index + 1}`}
            </option>
          ))}
      </select>
    </Row>
  );
}

function Card({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-black/5 bg-white p-5">
      <h2 className="font-serif text-lg text-[#3D421F]">{title}</h2>
      <p className="mt-1 text-sm text-black/55">{description}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 py-3">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-[#2B2F16]">{label}</span>
        {hint ? <span className="mt-0.5 block text-xs text-black/50">{hint}</span> : null}
      </span>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
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

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: [T, string][];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex rounded-full bg-black/5 p-0.5 text-xs">
      {options.map(([option, label]) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={cn(
            "rounded-full px-3 py-1.5 transition",
            value === option ? "bg-white text-[#2B2F16] shadow-sm" : "text-black/55",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
