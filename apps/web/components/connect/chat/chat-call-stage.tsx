"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  isTrackReference,
  VideoTrack,
  useLocalParticipant,
  useMediaDeviceSelect,
  useParticipants,
  useTracks,
  type TrackReferenceOrPlaceholder,
} from "@livekit/components-react";
import { Track, type Participant } from "livekit-client";
import {
  GripHorizontal,
  Loader2,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  Phone,
  PhoneOff,
  Settings2,
  SwitchCamera,
  Video,
  VideoOff,
} from "lucide-react";
import type { CallBusy } from "@/components/connect/chat/chat-call";
import { CallSettingsSheet } from "@/components/connect/chat/chat-call-settings";
import { ConnectAvatar } from "@/components/connect/connect-avatar";
import { toast } from "@/components/ui/toast";
import type { ChatCallPeer } from "@/lib/actions/connect-call";
import { updateCallPreferences, useCallPreferences } from "@/lib/connect/call-preferences";
import type { ChatCall } from "@/lib/connect/chat-call-types";
import { cn } from "@/lib/utils";

const modeLabel = (call: ChatCall) => (call.mode === "video" ? "video" : "voice");

/* ------------------------------------------------------------------ */
/* Incoming call — a dialog in the middle of the screen                */
/* ------------------------------------------------------------------ */

export function IncomingCallDialog({
  call,
  peer,
  busy,
  onAccept,
  onDecline,
}: {
  call: ChatCall;
  peer: ChatCallPeer;
  busy: CallBusy;
  onAccept: (withVideo: boolean) => void;
  onDecline: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[320] flex items-center justify-center bg-[#11150c]/60 p-5 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-label={`Incoming ${modeLabel(call)} call from ${peer.name}`}
    >
      <div className="w-full max-w-[340px] rounded-[30px] bg-white px-7 pb-7 pt-9 text-center shadow-2xl">
        <div className="relative mx-auto mb-5 h-24 w-24">
          <span className="absolute inset-0 animate-ping rounded-full bg-[var(--venue-primary,#818a40)]/25" aria-hidden />
          <ConnectAvatar
            name={peer.name}
            photoUrl={peer.photoUrl}
            className="ss-call-shake relative h-24 w-24 text-3xl"
          />
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-black/40">
          Incoming {modeLabel(call)} call
        </p>
        <h2 className="mt-1 truncate text-xl font-semibold text-[#2B2F16]">{peer.name}</h2>
        <div className="mt-8 flex items-start justify-center gap-10">
          <RoundAction label="Decline" tone="red" busy={busy === "decline"} disabled={Boolean(busy)} onClick={onDecline}>
            <PhoneOff className="h-6 w-6" />
          </RoundAction>
          <RoundAction label="Accept" tone="green" busy={busy === "accept"} disabled={Boolean(busy)} onClick={() => onAccept(true)}>
            <span className={busy ? undefined : "ss-call-shake"}>
              {call.mode === "video" ? <Video className="h-6 w-6" /> : <Phone className="h-6 w-6" />}
            </span>
          </RoundAction>
        </div>
        {call.mode === "video" ? (
          <button
            type="button"
            onClick={() => onAccept(false)}
            disabled={Boolean(busy)}
            className="mt-5 text-xs font-medium text-black/50 underline-offset-2 hover:text-black/75 hover:underline disabled:opacity-50"
          >
            Answer with voice only
          </button>
        ) : null}
      </div>
    </div>
  );
}

function RoundAction({
  label,
  tone,
  busy,
  disabled,
  onClick,
  children,
}: {
  label: string;
  tone: "red" | "green";
  busy: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="flex flex-col items-center gap-2 text-xs text-black/55">
      <span
        className={cn(
          "flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition hover:brightness-110",
          tone === "red" ? "bg-[#d94242]" : "bg-[#4b9f56]",
        )}
      >
        {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : children}
      </span>
      {label}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* A call open without media here (another device, or after a drop)    */
/* ------------------------------------------------------------------ */

export function OngoingCallPill({
  call,
  peer,
  busy,
  onJoin,
  onEnd,
}: {
  call: ChatCall;
  peer: ChatCallPeer;
  busy: CallBusy;
  onJoin: () => void;
  onEnd: () => void;
}) {
  const status = call.status === "ringing" ? "Calling on another device" : "Call in progress";
  return (
    <div
      className="fixed right-4 top-[max(1rem,env(safe-area-inset-top))] z-[300] flex items-center gap-3 rounded-full bg-[#1d2215] py-1.5 pl-1.5 pr-2 text-white shadow-2xl"
      role="status"
    >
      <ConnectAvatar name={peer.name} photoUrl={peer.photoUrl} size="sm" className="ring-0" />
      <span className="min-w-0 max-w-[160px]">
        <span className="block truncate text-sm font-medium">{peer.name}</span>
        <span className="block truncate text-[11px] text-white/55">{status}</span>
      </span>
      {call.status === "active" ? (
        <PillButton label="Join" tone="green" busy={busy === "accept"} onClick={onJoin}>
          {call.mode === "video" ? <Video className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
        </PillButton>
      ) : null}
      <PillButton label="End" tone="red" busy={busy === "end"} onClick={onEnd}>
        <PhoneOff className="h-4 w-4" />
      </PillButton>
    </div>
  );
}

function PillButton({
  label,
  tone,
  busy,
  onClick,
  children,
}: {
  label: string;
  tone: "red" | "green";
  busy: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-full text-white transition hover:brightness-110",
        tone === "red" ? "bg-[#d94242]" : "bg-[#4b9f56]",
      )}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* The live call                                                       */
/* ------------------------------------------------------------------ */

function subscribeWide(onChange: () => void) {
  const query = window.matchMedia("(min-width: 768px)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function useWideScreen(): boolean {
  return useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia("(min-width: 768px)").matches,
    () => false,
  );
}

/** The rear camera shouldn't be mirrored — text and scenery would read backwards. */
function isRearCamera(track: MediaStreamTrack | undefined): boolean {
  return track?.getSettings().facingMode === "environment";
}

function useElapsed(startedAt: string | null): string {
  const [total, setTotal] = useState(0);
  useEffect(() => {
    if (!startedAt) return;
    const started = new Date(startedAt).getTime();
    const tick = () => setTotal(Math.max(0, Math.floor((Date.now() - started) / 1000)));
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);
  if (!startedAt) return "Connecting…";
  const minutes = Math.floor(total / 60);
  return `${String(minutes).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Everything both call layouts need: who's here, their video, and the controls. */
function useCallRoom(call: ChatCall) {
  const participants = useParticipants();
  const cameraTracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }]);
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();
  const cameras = useMediaDeviceSelect({ kind: "videoinput", requestPermissions: false });
  const [deviceBusy, setDeviceBusy] = useState<"mic" | "camera" | null>(null);
  const preferences = useCallPreferences();
  const elapsed = useElapsed(call.status === "active" ? call.answeredAt : null);

  const remote = participants.find((participant) => !participant.isLocal) ?? null;
  const trackFor = (participant: Participant | null) =>
    participant ? cameraTracks.find((track) => track.participant.identity === participant.identity) : undefined;

  async function toggleMicrophone() {
    setDeviceBusy("mic");
    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
    } catch {
      toast.error("Could not change the microphone.");
    } finally {
      setDeviceBusy(null);
    }
  }

  async function toggleCamera() {
    setDeviceBusy("camera");
    try {
      await localParticipant.setCameraEnabled(!isCameraEnabled);
    } catch {
      toast.error("Could not change the camera.");
    } finally {
      setDeviceBusy(null);
    }
  }

  async function flipCamera() {
    const list = cameras.devices;
    if (list.length < 2) return;
    const index = list.findIndex((device) => device.deviceId === cameras.activeDeviceId);
    const next = list[(index + 1) % list.length]!;
    setDeviceBusy("camera");
    try {
      await cameras.setActiveMediaDevice(next.deviceId);
      updateCallPreferences({ videoInputId: next.deviceId });
    } catch {
      toast.error("Could not switch the camera.");
    } finally {
      setDeviceBusy(null);
    }
  }

  const status =
    call.status === "ringing" ? "Calling…" : remote ? elapsed : call.answeredAt ? "Reconnecting…" : "Connecting…";

  return {
    preferences,
    remote,
    remoteTrack: trackFor(remote),
    local: localParticipant,
    localTrack: trackFor(localParticipant),
    isMicrophoneEnabled,
    isCameraEnabled,
    canFlip: cameras.devices.length > 1,
    deviceBusy,
    status,
    toggleMicrophone,
    toggleCamera,
    flipCamera,
  };
}

type CallRoom = ReturnType<typeof useCallRoom>;

function ParticipantVideo({
  participant,
  track,
  mirror,
  fit,
  className,
}: {
  participant: Participant;
  track: TrackReferenceOrPlaceholder | undefined;
  mirror: boolean;
  fit: "cover" | "contain";
  className?: string;
}) {
  if (!track || !isTrackReference(track) || track.publication.isMuted) return null;
  const flip = mirror && participant.isLocal && !isRearCamera(track.publication.track?.mediaStreamTrack);
  return (
    <VideoTrack
      trackRef={track}
      className={cn("h-full w-full", fit === "contain" ? "object-contain" : "object-cover", className)}
      style={flip ? { transform: "scaleX(-1)" } : undefined}
    />
  );
}

function hasVideo(track: TrackReferenceOrPlaceholder | undefined): boolean {
  return Boolean(track && isTrackReference(track) && !track.publication.isMuted);
}

export function CallStage({
  call,
  peer,
  variant,
  onHangUp,
  ending,
}: {
  call: ChatCall;
  peer: ChatCallPeer;
  variant: "web" | "mobile";
  onHangUp: () => void;
  ending: boolean;
}) {
  const room = useCallRoom(call);
  const wide = useWideScreen();
  const [expanded, setExpanded] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const floating = variant === "web" && wide && !expanded;

  const controls = (
    <CallControls
      call={call}
      room={room}
      compact={floating}
      // Front/back flipping is a phone thing; on a computer, pick the camera in settings.
      allowFlip={variant === "mobile"}
      ending={ending}
      onHangUp={onHangUp}
      onSettings={() => setSettingsOpen(true)}
    />
  );

  return (
    <>
      {floating ? (
        <FloatingCall call={call} peer={peer} room={room} onExpand={() => setExpanded(true)}>
          {controls}
        </FloatingCall>
      ) : (
        <FullScreenCall
          call={call}
          peer={peer}
          room={room}
          onCollapse={variant === "web" && wide ? () => setExpanded(false) : undefined}
        >
          {controls}
        </FullScreenCall>
      )}
      {settingsOpen ? <CallSettingsSheet mode={call.mode} onClose={() => setSettingsOpen(false)} /> : null}
    </>
  );
}

function CallControls({
  call,
  room,
  compact,
  allowFlip,
  ending,
  onHangUp,
  onSettings,
}: {
  call: ChatCall;
  room: CallRoom;
  compact: boolean;
  allowFlip: boolean;
  ending: boolean;
  onHangUp: () => void;
  onSettings: () => void;
}) {
  const icon = compact ? "h-4 w-4" : "h-5 w-5";
  return (
    <div className={cn("flex items-center justify-center", compact ? "gap-2" : "gap-4")}>
      <CallControl
        compact={compact}
        label={room.isMicrophoneEnabled ? "Mute" : "Unmute"}
        active={!room.isMicrophoneEnabled}
        busy={room.deviceBusy === "mic"}
        onClick={() => void room.toggleMicrophone()}
      >
        {room.isMicrophoneEnabled ? <Mic className={icon} /> : <MicOff className={icon} />}
      </CallControl>
      {call.mode === "video" ? (
        <CallControl
          compact={compact}
          label={room.isCameraEnabled ? "Camera off" : "Camera on"}
          active={!room.isCameraEnabled}
          busy={room.deviceBusy === "camera"}
          onClick={() => void room.toggleCamera()}
        >
          {room.isCameraEnabled ? <Video className={icon} /> : <VideoOff className={icon} />}
        </CallControl>
      ) : null}
      {allowFlip && call.mode === "video" && room.canFlip && room.isCameraEnabled ? (
        <CallControl compact={compact} label="Flip" busy={room.deviceBusy === "camera"} onClick={() => void room.flipCamera()}>
          <SwitchCamera className={icon} />
        </CallControl>
      ) : null}
      <CallControl compact={compact} label="Settings" onClick={onSettings}>
        <Settings2 className={icon} />
      </CallControl>
      <CallControl compact={compact} label="End" danger busy={ending} onClick={onHangUp}>
        <PhoneOff className={icon} />
      </CallControl>
    </div>
  );
}

function CallControl({
  label,
  compact,
  active,
  danger,
  busy,
  onClick,
  children,
}: {
  label: string;
  compact: boolean;
  active?: boolean;
  danger?: boolean;
  busy?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const circle = cn(
    "flex items-center justify-center rounded-full transition",
    compact ? "h-9 w-9" : "h-12 w-12",
    danger ? "bg-[#d94242] text-white hover:brightness-110" : active ? "bg-white text-black" : "bg-white/15 text-white hover:bg-white/25",
  );
  const spinner = <Loader2 className={cn("animate-spin", compact ? "h-4 w-4" : "h-5 w-5")} />;
  if (compact) {
    return (
      <button type="button" onClick={onClick} disabled={busy} aria-label={label} title={label} className={circle}>
        {busy ? spinner : children}
      </button>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={busy} className="flex min-w-14 flex-col items-center gap-1.5 text-[11px] text-white/65">
      <span className={circle}>{busy ? spinner : children}</span>
      {label}
    </button>
  );
}

/** The other person's tile: their video, or their photo while it's off. */
function RemoteView({
  call,
  peer,
  room,
  avatarClassName,
}: {
  call: ChatCall;
  peer: ChatCallPeer;
  room: CallRoom;
  avatarClassName: string;
}) {
  if (call.mode === "video" && room.remote && hasVideo(room.remoteTrack)) {
    return (
      <ParticipantVideo
        participant={room.remote}
        track={room.remoteTrack}
        mirror={false}
        fit={room.preferences.videoFit}
      />
    );
  }
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3">
      <ConnectAvatar name={peer.name} photoUrl={peer.photoUrl} className={cn("ring-0 shadow-xl", avatarClassName)} />
    </div>
  );
}

function SelfView({ room, className }: { room: CallRoom; className: string }) {
  if (room.preferences.hideSelf || !hasVideo(room.localTrack)) return null;
  return (
    <div className={cn("overflow-hidden bg-black shadow-xl ring-1 ring-white/15", className)}>
      <ParticipantVideo
        participant={room.local}
        track={room.localTrack}
        mirror={room.preferences.mirrorSelf}
        fit="cover"
      />
    </div>
  );
}

const FLOAT_WIDTH = 320;
const EDGE = 16;

/** Web: a small call window, top right by default, that can be dragged anywhere. */
function FloatingCall({
  call,
  peer,
  room,
  onExpand,
  children,
}: {
  call: ChatCall;
  peer: ChatCallPeer;
  room: CallRoom;
  onExpand: () => void;
  children: React.ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);

  const clamp = useCallback((x: number, y: number) => {
    const height = box.current?.offsetHeight ?? 240;
    return {
      x: Math.min(Math.max(EDGE, x), window.innerWidth - FLOAT_WIDTH - EDGE),
      y: Math.min(Math.max(EDGE, y), window.innerHeight - height - EDGE),
    };
  }, []);

  useEffect(() => {
    const keepInView = () => setPosition((current) => (current ? clamp(current.x, current.y) : current));
    window.addEventListener("resize", keepInView);
    return () => window.removeEventListener("resize", keepInView);
  }, [clamp]);

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("button")) return;
    const rect = box.current?.getBoundingClientRect();
    if (!rect) return;
    drag.current = { dx: event.clientX - rect.left, dy: event.clientY - rect.top };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    setPosition(clamp(event.clientX - drag.current.dx, event.clientY - drag.current.dy));
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <div
      ref={box}
      className="fixed z-[300] overflow-hidden rounded-2xl bg-[#11150c] text-white shadow-[0_18px_50px_rgba(0,0,0,0.35)] ring-1 ring-black/25"
      style={{
        width: FLOAT_WIDTH,
        ...(position ? { left: position.x, top: position.y } : { right: EDGE, top: 72 }),
      }}
      role="dialog"
      aria-label={`${call.mode === "video" ? "Video" : "Voice"} call with ${peer.name}`}
    >
      <div
        className="flex cursor-grab touch-none select-none items-center gap-2 px-3 py-2 active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <GripHorizontal className="h-4 w-4 shrink-0 text-white/35" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{peer.name}</span>
          <span className="block text-[11px] tabular-nums text-white/55">{room.status}</span>
        </span>
        <button
          type="button"
          onClick={onExpand}
          className="rounded-full p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
          aria-label="Full screen"
          title="Full screen"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>

      {call.mode === "video" ? (
        <div className="relative mx-2 aspect-[4/3] overflow-hidden rounded-xl bg-white/[0.06]">
          <RemoteView call={call} peer={peer} room={room} avatarClassName="h-20 w-20 text-2xl" />
          <SelfView room={room} className="absolute bottom-2 right-2 aspect-[3/4] w-[84px] rounded-lg" />
          {room.remote && !room.remote.isMicrophoneEnabled ? (
            <span className="absolute left-2 top-2 rounded-full bg-black/50 p-1.5">
              <MicOff className="h-3.5 w-3.5" />
            </span>
          ) : null}
        </div>
      ) : (
        <div className="flex items-center justify-center py-4">
          <RemoteView call={call} peer={peer} room={room} avatarClassName="h-16 w-16 text-xl" />
        </div>
      )}

      <div className="px-3 py-3">{children}</div>
    </div>
  );
}

/** Phones (and "full screen" on the web): the whole screen. */
function FullScreenCall({
  call,
  peer,
  room,
  onCollapse,
  children,
}: {
  call: ChatCall;
  peer: ChatCallPeer;
  room: CallRoom;
  onCollapse?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[300] flex flex-col bg-[#11150c] text-white" role="dialog" aria-modal="true" aria-label="Active call">
      <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold">{peer.name}</p>
          <p className="text-xs tabular-nums text-white/55">
            {call.mode === "video" ? "Video call" : "Voice call"} · {room.status}
          </p>
        </div>
        {onCollapse ? (
          <button
            type="button"
            onClick={onCollapse}
            className="rounded-full p-2 text-white/60 hover:bg-white/10 hover:text-white"
            aria-label="Shrink to a window"
            title="Shrink to a window"
          >
            <Minimize2 className="h-5 w-5" />
          </button>
        ) : null}
      </div>

      <div className="relative min-h-0 flex-1 px-3">
        <div className="relative h-full overflow-hidden rounded-3xl bg-white/[0.06]">
          <RemoteView call={call} peer={peer} room={room} avatarClassName="h-28 w-28 text-4xl" />
          {room.remote && !room.remote.isMicrophoneEnabled ? (
            <span className="absolute bottom-4 left-4 flex items-center gap-1.5 rounded-full bg-black/45 px-3 py-1.5 text-sm backdrop-blur">
              <MicOff className="h-3.5 w-3.5" /> Muted
            </span>
          ) : null}
        </div>
        {call.mode === "video" ? (
          <SelfView room={room} className="absolute right-6 top-3 aspect-[3/4] w-[28vw] max-w-[180px] rounded-2xl" />
        ) : null}
      </div>

      <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">{children}</div>
    </div>
  );
}
