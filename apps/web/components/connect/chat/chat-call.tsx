"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { LiveKitRoom, RoomAudioRenderer } from "@livekit/components-react";
import type { RoomOptions } from "livekit-client";
import { Loader2, Phone, Video } from "lucide-react";
import { CallStage, IncomingCallDialog, OngoingCallPill } from "@/components/connect/chat/chat-call-stage";
import { toast } from "@/components/ui/toast";
import {
  acceptChatCall,
  cancelChatCall,
  declineChatCall,
  endChatCall,
  expireChatCall,
  fetchChatCallPeer,
  fetchMyCallState,
  startChatCall,
  type ChatCallPeer,
} from "@/lib/actions/connect-call";
import { readCallPreferences, useCallPreferences } from "@/lib/connect/call-preferences";
import {
  isOpenChatCall,
  mapChatCallRow,
  type ChatCall,
  type ChatCallMode,
  type ChatCallRow,
} from "@/lib/connect/chat-call-types";
import type { ChatDetail } from "@/lib/connect/chat-types";
import type { ConnectPerson } from "@/lib/connect/types";
import { playRingtone, setVenueSoundDefaults, unlockAudio } from "@/lib/connect/sounds";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Session = { token: string; serverUrl: string; withVideo: boolean };
export type CallBusy = ChatCallMode | "accept" | "decline" | "end" | null;

type CallContextValue = {
  call: ChatCall | null;
  /** Someone is calling this viewer right now. */
  incoming: boolean;
  busy: CallBusy;
  start: (conversationId: string, mode: ChatCallMode, peer?: ChatCallPeer) => Promise<void>;
};

const CallContext = createContext<CallContextValue | null>(null);

/**
 * App-wide call manager: listens for calls in every chat the viewer belongs
 * to, rings wherever they are in the app, and hosts the live call.
 * `variant="mobile"` always runs calls full screen; on the web they float.
 */
export function CallProvider({
  variant = "web",
  children,
}: {
  variant?: "web" | "mobile";
  children: React.ReactNode;
}) {
  const [identity, setIdentity] = useState<{ meId: string; venueId: string } | null>(null);
  const [call, setCall] = useState<ChatCall | null>(null);
  const [peer, setPeer] = useState<ChatCallPeer | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState<CallBusy>(null);
  const localHangup = useRef(false);
  const preferences = useCallPreferences();
  const meId = identity?.meId ?? "";
  const callRef = useRef<ChatCall | null>(null);
  useEffect(() => {
    callRef.current = call;
  }, [call]);

  const consumeCall = useCallback(
    (next: ChatCall | null) => {
      const previous = callRef.current;
      // One call at a time: a second chat ringing while busy is left to time out.
      if (previous && next && next.id !== previous.id) return;
      if (!next || !isOpenChatCall(next.status)) {
        if (previous?.status === "ringing" && previous.initiatedBy === meId) {
          if (next?.status === "declined") toast.alert({ message: "Call declined", durationMs: 4000 });
          else if (next?.status === "missed") toast.alert({ message: "No answer", durationMs: 4000 });
        }
        callRef.current = null;
        setCall(null);
        setPeer(null);
        setSession(null);
        return;
      }
      callRef.current = next;
      setCall(next);
    },
    [meId],
  );

  // Who am I, and is a call already open (e.g. after a reload)?
  useEffect(() => {
    let alive = true;
    void fetchMyCallState().then((result) => {
      if (!alive || !result.ok) return;
      setIdentity({ meId: result.meId, venueId: result.venueId });
      // The venue's default ringtone, for devices without their own choice.
      setVenueSoundDefaults(result.soundDefaults);
      if (result.call) {
        callRef.current = result.call;
        setCall(result.call);
        setPeer(result.peer);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  // Row-level security only delivers calls from the viewer's own chats.
  useEffect(() => {
    if (!identity) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`chat-calls:${identity.venueId}:${identity.meId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_calls",
          filter: `venue_id=eq.${identity.venueId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const gone = (payload.old as { id?: string }).id;
            if (gone && gone === callRef.current?.id) consumeCall(null);
            return;
          }
          const next = mapChatCallRow(payload.new as ChatCallRow);
          if (!callRef.current && !isOpenChatCall(next.status)) return;
          consumeCall(next);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [consumeCall, identity]);

  // Name and photo of the other person, for the ringing dialog and call window.
  const callId = call?.id ?? null;
  useEffect(() => {
    if (!callId || peer) return;
    let alive = true;
    void fetchChatCallPeer(callId).then((result) => {
      if (alive && result.ok) setPeer(result.peer);
    });
    return () => {
      alive = false;
    };
  }, [callId, peer]);

  // Caller: mark the call missed once it has rung out.
  useEffect(() => {
    if (!call || call.status !== "ringing" || call.initiatedBy !== meId) return;
    const delay = Math.max(0, new Date(call.expiresAt).getTime() - Date.now());
    const timer = window.setTimeout(() => {
      void expireChatCall(call.id).then((result) => {
        if (result.ok) consumeCall({ ...call, status: "missed" });
      });
    }, delay + 250);
    return () => window.clearTimeout(timer);
  }, [call, consumeCall, meId]);

  const incoming = Boolean(call && call.status === "ringing" && call.initiatedBy !== meId && !session);

  // Callee: stop ringing locally if the caller vanished without hanging up.
  useEffect(() => {
    if (!incoming || !call) return;
    const delay = Math.max(0, new Date(call.expiresAt).getTime() - Date.now());
    const timer = window.setTimeout(() => consumeCall(null), delay + 1500);
    return () => window.clearTimeout(timer);
  }, [call, consumeCall, incoming]);

  // Ringtone, repeated until answered.
  useEffect(() => {
    if (!incoming) return;
    playRingtone();
    const timer = window.setInterval(playRingtone, 3000);
    return () => window.clearInterval(timer);
  }, [incoming]);

  // Browsers only play audio after a click or key press somewhere on the page.
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  async function requestSession(id: string, withVideo: boolean): Promise<Session | null> {
    try {
      const response = await fetch("/api/connect/calls/token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ callId: id }),
      });
      const data = (await response.json()) as Partial<Session> & { error?: string };
      if (!response.ok || !data.token || !data.serverUrl) {
        toast.error(data.error ?? "Could not join the call.");
        return null;
      }
      return { token: data.token, serverUrl: data.serverUrl, withVideo };
    } catch {
      toast.error("Could not connect to the call service.");
      return null;
    }
  }

  const start = useCallback(
    async (conversationId: string, mode: ChatCallMode, peerHint?: ChatCallPeer) => {
      if (callRef.current || busy) return;
      setBusy(mode);
      const result = await startChatCall(conversationId, mode);
      if (!result.ok) {
        toast.error(result.error);
        setBusy(null);
        return;
      }
      if (peerHint) setPeer(peerHint);
      consumeCall(result.call);
      const next = await requestSession(result.call.id, mode === "video");
      if (!next) {
        await cancelChatCall(result.call.id);
        consumeCall(null);
      } else {
        localHangup.current = false;
        setSession(next);
      }
      setBusy(null);
    },
    [busy, consumeCall],
  );

  async function accept(withVideo: boolean) {
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
    const next = await requestSession(call.id, withVideo);
    if (next) {
      localHangup.current = false;
      setSession(next);
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

  async function joinExisting() {
    if (!call) return;
    setBusy("accept");
    const next = await requestSession(call.id, call.mode === "video");
    if (next) {
      localHangup.current = false;
      setSession(next);
    }
    setBusy(null);
  }

  async function hangUp() {
    if (!call || busy === "end") return;
    setBusy("end");
    localHangup.current = true;
    setSession(null);
    const result =
      call.status === "ringing" && call.initiatedBy === meId
        ? await cancelChatCall(call.id)
        : await endChatCall(call.id);
    if (!result.ok) toast.error(result.error);
    setBusy(null);
    consumeCall(null);
  }

  // Saved devices seed the room when it connects; later switches happen in the call.
  const roomOptions = useMemo<RoomOptions>(() => {
    const prefs = readCallPreferences();
    return {
      adaptiveStream: true,
      dynacast: true,
      videoCaptureDefaults: prefs.videoInputId ? { deviceId: prefs.videoInputId } : undefined,
      audioCaptureDefaults: prefs.audioInputId ? { deviceId: prefs.audioInputId } : undefined,
      audioOutput: prefs.audioOutputId ? { deviceId: prefs.audioOutputId } : undefined,
    };
    // Re-read only when a new call connects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.token]);

  const contextValue = useMemo<CallContextValue>(
    () => ({ call, incoming, busy, start }),
    [busy, call, incoming, start],
  );
  const displayPeer = peer ?? { name: "Ops Hub user", photoUrl: null };

  return (
    <CallContext.Provider value={contextValue}>
      {children}

      {call && incoming ? (
        <IncomingCallDialog
          call={call}
          peer={displayPeer}
          busy={busy}
          onAccept={(withVideo) => void accept(withVideo)}
          onDecline={() => void decline()}
        />
      ) : null}

      {call && !incoming && !session ? (
        <OngoingCallPill
          call={call}
          peer={displayPeer}
          busy={busy}
          onJoin={() => void joinExisting()}
          onEnd={() => void hangUp()}
        />
      ) : null}

      {call && session ? (
        <LiveKitRoom
          token={session.token}
          serverUrl={session.serverUrl}
          connect
          audio={!preferences.startMuted}
          video={session.withVideo && call.mode === "video" && !preferences.startCameraOff}
          options={roomOptions}
          onError={(error) => toast.error(error.message || "Call connection failed.")}
          onMediaDeviceFailure={() => toast.error("Allow microphone and camera access to use calls.")}
          onDisconnected={() => {
            if (!localHangup.current) setSession(null);
          }}
        >
          <CallStage
            call={call}
            peer={displayPeer}
            variant={variant}
            onHangUp={() => void hangUp()}
            ending={busy === "end"}
          />
          <RoomAudioRenderer />
        </LiveKitRoom>
      ) : null}
    </CallContext.Provider>
  );
}

export function useChatCall(): CallContextValue | null {
  return useContext(CallContext);
}

/** Voice and video buttons for a 1:1 chat header. */
export function ChatCallButtons({
  conversationId,
  kind,
  peer,
  disabled,
  className,
  iconClassName = "h-5 w-5",
}: {
  conversationId: string;
  kind: "direct" | "group";
  peer?: ChatCallPeer;
  disabled?: boolean;
  className?: string;
  iconClassName?: string;
}) {
  const calls = useChatCall();
  if (!calls || kind !== "direct" || disabled) return null;
  const { call, busy, start } = calls;
  const blocked = Boolean(call) || Boolean(busy);
  const buttonClass = cn(
    "rounded-full p-2 text-black/50 hover:bg-black/5 hover:text-black/75 disabled:cursor-not-allowed disabled:opacity-35",
    className,
  );
  return (
    <>
      <button
        type="button"
        onClick={() => void start(conversationId, "audio", peer)}
        disabled={blocked}
        className={buttonClass}
        aria-label="Start voice call"
        title={call ? "A call is already in progress" : "Voice call"}
      >
        {busy === "audio" ? <Loader2 className={cn(iconClassName, "animate-spin")} /> : <Phone className={iconClassName} />}
      </button>
      <button
        type="button"
        onClick={() => void start(conversationId, "video", peer)}
        disabled={blocked}
        className={buttonClass}
        aria-label="Start video call"
        title={call ? "A call is already in progress" : "Video call"}
      >
        {busy === "video" ? <Loader2 className={cn(iconClassName, "animate-spin")} /> : <Video className={iconClassName} />}
      </button>
    </>
  );
}

/** Chat conversation header controls. */
export function ChatCallControls({
  detail,
  readOnly,
}: {
  detail: ChatDetail;
  me: ConnectPerson | null;
  readOnly: boolean;
}) {
  return (
    <ChatCallButtons
      conversationId={detail.id}
      kind={detail.kind}
      disabled={readOnly}
      peer={{ name: detail.title, photoUrl: detail.photoUrl }}
    />
  );
}
