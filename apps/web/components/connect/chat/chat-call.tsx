"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  isTrackReference,
  LiveKitRoom,
  RoomAudioRenderer,
  VideoTrack,
  useLocalParticipant,
  useParticipants,
  useTracks,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { Loader2, Mic, MicOff, Phone, PhoneOff, Video, VideoOff } from "lucide-react";
import { ChatAvatar } from "@/components/connect/chat/chat-shell";
import { toast } from "@/components/ui/toast";
import {
  acceptChatCall,
  cancelChatCall,
  declineChatCall,
  endChatCall,
  expireChatCall,
  fetchOpenChatCall,
  startChatCall,
} from "@/lib/actions/connect-call";
import {
  isOpenChatCall,
  mapChatCallRow,
  type ChatCall,
  type ChatCallMode,
  type ChatCallRow,
} from "@/lib/connect/chat-call-types";
import type { ChatDetail } from "@/lib/connect/chat-types";
import type { ConnectPerson } from "@/lib/connect/types";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Session = { token: string; serverUrl: string };

export function ChatCallControls({
  detail,
  me,
  readOnly,
}: {
  detail: ChatDetail;
  me: ConnectPerson | null;
  readOnly: boolean;
}) {
  const meId = me?.userId ?? "";
  const [call, setCall] = useState<ChatCall | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState<ChatCallMode | "accept" | "decline" | "end" | null>(null);
  const localHangup = useRef(false);

  const consumeCall = useCallback(
    (next: ChatCall | null) => {
      if (!next || !isOpenChatCall(next.status)) {
        setCall((previous) => {
          if (previous?.status === "ringing" && next?.status === "declined" && previous.initiatedBy === meId) {
            toast.alert({ message: "Call declined", durationMs: 4000 });
          } else if (previous?.status === "ringing" && next?.status === "missed" && previous.initiatedBy === meId) {
            toast.alert({ message: "No answer", durationMs: 4000 });
          }
          return null;
        });
        setSession(null);
        return;
      }
      setCall(next);
    },
    [meId],
  );

  useEffect(() => {
    if (detail.kind !== "direct" || readOnly) return;
    let alive = true;
    void fetchOpenChatCall(detail.id).then((result) => {
      if (!alive) return;
      if (result.ok) consumeCall(result.call);
    });
    return () => {
      alive = false;
    };
  }, [consumeCall, detail.id, detail.kind, readOnly]);

  useEffect(() => {
    if (detail.kind !== "direct" || readOnly) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`chat-calls:${detail.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_calls",
          filter: `conversation_id=eq.${detail.id}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            consumeCall(null);
            return;
          }
          consumeCall(mapChatCallRow(payload.new as ChatCallRow));
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [consumeCall, detail.id, detail.kind, readOnly]);

  useEffect(() => {
    if (!call || call.status !== "ringing" || call.initiatedBy !== meId) return;
    const delay = Math.max(0, new Date(call.expiresAt).getTime() - Date.now());
    const timer = window.setTimeout(() => {
      void expireChatCall(call.id).then((result) => {
        if (!result.ok) return;
        setSession(null);
        setCall(null);
      });
    }, delay + 250);
    return () => window.clearTimeout(timer);
  }, [call, meId]);

  async function requestSession(callId: string): Promise<Session | null> {
    try {
      const response = await fetch("/api/connect/calls/token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ callId }),
      });
      const data = (await response.json()) as Partial<Session> & { error?: string };
      if (!response.ok || !data.token || !data.serverUrl) {
        toast.error(data.error ?? "Could not join the call.");
        return null;
      }
      return { token: data.token, serverUrl: data.serverUrl };
    } catch {
      toast.error("Could not connect to the call service.");
      return null;
    }
  }

  async function start(mode: ChatCallMode) {
    setBusy(mode);
    const result = await startChatCall(detail.id, mode);
    if (!result.ok) {
      toast.error(result.error);
      setBusy(null);
      return;
    }
    consumeCall(result.call);
    const nextSession = await requestSession(result.call.id);
    if (!nextSession) {
      await cancelChatCall(result.call.id);
      consumeCall(null);
    } else {
      localHangup.current = false;
      setSession(nextSession);
    }
    setBusy(null);
  }

  async function accept() {
    if (!call) return;
    setBusy("accept");
    const result = await acceptChatCall(call.id);
    if (!result.ok) {
      toast.error(result.error);
      setBusy(null);
      consumeCall(null);
      return;
    }
    consumeCall(result.call);
    const nextSession = await requestSession(call.id);
    if (nextSession) {
      localHangup.current = false;
      setSession(nextSession);
    } else {
      await endChatCall(call.id);
      consumeCall(null);
    }
    setBusy(null);
  }

  async function decline() {
    if (!call) return;
    setBusy("decline");
    const result = await declineChatCall(call.id);
    if (!result.ok) toast.error(result.error);
    setBusy(null);
    consumeCall(null);
  }

  async function cancel() {
    if (!call) return;
    setBusy("end");
    const result = await cancelChatCall(call.id);
    if (!result.ok) toast.error(result.error);
    localHangup.current = true;
    setSession(null);
    setBusy(null);
    consumeCall(null);
  }

  async function joinExisting() {
    if (!call) return;
    setBusy("accept");
    const nextSession = await requestSession(call.id);
    if (nextSession) {
      localHangup.current = false;
      setSession(nextSession);
    }
    setBusy(null);
  }

  async function hangUp() {
    if (!call || busy === "end") return;
    setBusy("end");
    localHangup.current = true;
    setSession(null);
    const result = await endChatCall(call.id);
    if (!result.ok) toast.error(result.error);
    setBusy(null);
    consumeCall(null);
  }

  if (detail.kind !== "direct" || readOnly) return null;
  const incoming = call?.status === "ringing" && call.initiatedBy !== meId;

  return (
    <>
      <button
        type="button"
        onClick={() => void start("audio")}
        disabled={Boolean(call) || Boolean(busy)}
        className="rounded-full p-2 text-black/50 hover:bg-black/5 hover:text-black/75 disabled:cursor-not-allowed disabled:opacity-35"
        aria-label="Start voice call"
        title={call ? "A call is already in progress" : "Voice call"}
      >
        {busy === "audio" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Phone className="h-5 w-5" />}
      </button>
      <button
        type="button"
        onClick={() => void start("video")}
        disabled={Boolean(call) || Boolean(busy)}
        className="rounded-full p-2 text-black/50 hover:bg-black/5 hover:text-black/75 disabled:cursor-not-allowed disabled:opacity-35"
        aria-label="Start video call"
        title={call ? "A call is already in progress" : "Video call"}
      >
        {busy === "video" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Video className="h-5 w-5" />}
      </button>

      {call && !session ? (
        <CallPrompt
          detail={detail}
          call={call}
          incoming={incoming}
          busy={busy}
          onAccept={() => void accept()}
          onDecline={() => void decline()}
          onCancel={() => void cancel()}
          onEnd={() => void hangUp()}
          onJoin={() => void joinExisting()}
        />
      ) : null}

      {call && session ? (
        <LiveKitRoom
          token={session.token}
          serverUrl={session.serverUrl}
          connect
          audio
          video={call.mode === "video"}
          options={{ adaptiveStream: true, dynacast: true }}
          onError={(error) => toast.error(error.message || "Call connection failed.")}
          onMediaDeviceFailure={() => toast.error("Allow microphone and camera access to use calls.")}
          onDisconnected={() => {
            if (!localHangup.current) setSession(null);
          }}
        >
          <CallStage call={call} onHangUp={() => void hangUp()} ending={busy === "end"} />
        </LiveKitRoom>
      ) : null}
    </>
  );
}

function CallPrompt({
  detail,
  call,
  incoming,
  busy,
  onAccept,
  onDecline,
  onCancel,
  onEnd,
  onJoin,
}: {
  detail: ChatDetail;
  call: ChatCall;
  incoming: boolean;
  busy: ChatCallMode | "accept" | "decline" | "end" | null;
  onAccept: () => void;
  onDecline: () => void;
  onCancel: () => void;
  onEnd: () => void;
  onJoin: () => void;
}) {
  const isActive = call.status === "active";
  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-[#11150c]/75 p-5 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label={incoming ? "Incoming call" : "Call in progress"}
    >
      <div className="w-full max-w-sm rounded-[30px] bg-white px-7 py-9 text-center shadow-2xl">
        <div className="mx-auto mb-5 w-fit scale-125">
          <ChatAvatar chat={detail} />
        </div>
        <h2 className="text-xl font-semibold text-[#2B2F16]">{detail.title}</h2>
        <p className="mt-1 text-sm text-black/50">
          {isActive
            ? `${call.mode === "video" ? "Video" : "Voice"} call in progress`
            : incoming
              ? `Incoming ${call.mode === "video" ? "video" : "voice"} call`
              : "Calling…"}
        </p>
        <div className="mt-8 flex items-center justify-center gap-8">
          {incoming ? (
            <>
              <PromptButton label="Decline" tone="red" busy={busy === "decline"} onClick={onDecline}>
                <PhoneOff className="h-6 w-6" />
              </PromptButton>
              <PromptButton label="Accept" tone="green" busy={busy === "accept"} onClick={onAccept}>
                {call.mode === "video" ? <Video className="h-6 w-6" /> : <Phone className="h-6 w-6" />}
              </PromptButton>
            </>
          ) : isActive ? (
            <>
              <PromptButton label="End" tone="red" busy={busy === "end"} onClick={onEnd}>
                <PhoneOff className="h-6 w-6" />
              </PromptButton>
              <PromptButton label="Join" tone="green" busy={busy === "accept"} onClick={onJoin}>
                {call.mode === "video" ? <Video className="h-6 w-6" /> : <Phone className="h-6 w-6" />}
              </PromptButton>
            </>
          ) : (
            <PromptButton label="Cancel" tone="red" busy={busy === "end"} onClick={onCancel}>
              <PhoneOff className="h-6 w-6" />
            </PromptButton>
          )}
        </div>
      </div>
    </div>
  );
}

function PromptButton({
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
    <button type="button" onClick={onClick} disabled={busy} className="flex flex-col items-center gap-2 text-xs text-black/55">
      <span
        className={cn(
          "flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg",
          tone === "red" ? "bg-[#d94242]" : "bg-[#4b9f56]",
        )}
      >
        {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : children}
      </span>
      {label}
    </button>
  );
}

function CallStage({ call, onHangUp, ending }: { call: ChatCall; onHangUp: () => void; ending: boolean }) {
  const participants = useParticipants();
  const cameraTracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }]);
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();
  const [deviceBusy, setDeviceBusy] = useState<"mic" | "camera" | null>(null);
  const elapsed = useElapsed(call.status === "active" ? call.answeredAt : null);
  const tracksByParticipant = useMemo(
    () => new Map(cameraTracks.map((track) => [track.participant.identity, track])),
    [cameraTracks],
  );

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

  return (
    <div className="fixed inset-0 z-[130] flex flex-col bg-[#11150c] text-white" role="dialog" aria-modal="true" aria-label="Active call">
      <div className="flex items-center justify-between px-5 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
        <div>
          <p className="text-sm font-medium">{call.mode === "video" ? "Video call" : "Voice call"}</p>
          <p className="text-xs text-white/55">{call.status === "ringing" ? "Calling…" : elapsed}</p>
        </div>
        <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/65">
          {participants.length} participant{participants.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className={cn("grid min-h-0 flex-1 gap-2 p-3", participants.length > 1 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1")}>
        {participants.map((participant) => {
          const track = tracksByParticipant.get(participant.identity);
          const showVideo = call.mode === "video" && track && isTrackReference(track) && !track.publication.isMuted;
          return (
            <div key={participant.identity} className="relative flex min-h-0 items-center justify-center overflow-hidden rounded-3xl bg-white/[0.07]">
              {showVideo ? (
                <VideoTrack trackRef={track} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-28 w-28 items-center justify-center rounded-full bg-[#818a40] text-4xl font-semibold shadow-xl">
                  {(participant.name || participant.identity).trim().charAt(0).toUpperCase()}
                </div>
              )}
              <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-full bg-black/45 px-3 py-1.5 text-sm backdrop-blur">
                <span>{participant.name || "Ops Hub user"}</span>
                {!participant.isMicrophoneEnabled ? <MicOff className="h-3.5 w-3.5 text-white/70" /> : null}
              </div>
            </div>
          );
        })}
      </div>

      <RoomAudioRenderer />
      <div className="flex items-center justify-center gap-4 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
        <CallControl
          label={isMicrophoneEnabled ? "Mute" : "Unmute"}
          active={!isMicrophoneEnabled}
          busy={deviceBusy === "mic"}
          onClick={() => void toggleMicrophone()}
        >
          {isMicrophoneEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
        </CallControl>
        {call.mode === "video" ? (
          <CallControl
            label={isCameraEnabled ? "Camera off" : "Camera on"}
            active={!isCameraEnabled}
            busy={deviceBusy === "camera"}
            onClick={() => void toggleCamera()}
          >
            {isCameraEnabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
          </CallControl>
        ) : null}
        <CallControl label="End" danger busy={ending} onClick={onHangUp}>
          <PhoneOff className="h-5 w-5" />
        </CallControl>
      </div>
    </div>
  );
}

function CallControl({
  label,
  active,
  danger,
  busy,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  danger?: boolean;
  busy?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} disabled={busy} className="flex min-w-16 flex-col items-center gap-1.5 text-[11px] text-white/65">
      <span
        className={cn(
          "flex h-12 w-12 items-center justify-center rounded-full transition",
          danger ? "bg-[#d94242] text-white" : active ? "bg-white text-black" : "bg-white/15 text-white hover:bg-white/25",
        )}
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : children}
      </span>
      {label}
    </button>
  );
}

function useElapsed(startedAt: string | null): string {
  const [total, setTotal] = useState(0);
  useEffect(() => {
    if (!startedAt) return;
    const started = new Date(startedAt).getTime();
    const timer = window.setInterval(
      () => setTotal(Math.max(0, Math.floor((Date.now() - started) / 1000))),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [startedAt]);
  if (!startedAt) return "Connecting…";
  const minutes = Math.floor(total / 60);
  return `${String(minutes).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
