"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { ConnectAvatar } from "@/components/connect/connect-avatar";
import { getChatPresence } from "@/lib/actions/connect-chat-widget";
import { PRESENCE_LABELS, type PresenceStatus } from "@/lib/connect/presence";
import { cn } from "@/lib/utils";

/** Ring / dot colours. Offline people get no ring at all. */
export const PRESENCE_COLORS: Record<Exclude<PresenceStatus, "offline">, string> = {
  online: "#22A35A",
  recent: "#E8A317",
};

const PresenceContext = createContext<Record<string, PresenceStatus>>({});

/** Shares everyone's online status and refreshes it every minute. */
export function PresenceProvider({
  initial,
  children,
}: {
  initial: Record<string, PresenceStatus>;
  children: React.ReactNode;
}) {
  const [presence, setPresence] = useState(initial);
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      void getChatPresence().then((result) => {
        if (result.ok) setPresence(result.presence);
      });
    };
    const id = window.setInterval(tick, 60_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);
  return <PresenceContext.Provider value={presence}>{children}</PresenceContext.Provider>;
}

export function usePresence(userId: string | null | undefined): PresenceStatus {
  const presence = useContext(PresenceContext);
  return (userId ? presence[userId] : undefined) ?? "offline";
}

/** Green (online) or amber (recently active) ring around an avatar. */
export function PresenceRing({
  status,
  children,
  className,
}: {
  status: PresenceStatus;
  children: React.ReactNode;
  className?: string;
}) {
  if (status === "offline") return <>{children}</>;
  return (
    <span
      className={cn("inline-flex shrink-0 rounded-full p-[2px]", className)}
      style={{ boxShadow: `0 0 0 2.5px ${PRESENCE_COLORS[status]}` }}
      title={PRESENCE_LABELS[status]}
    >
      {children}
    </span>
  );
}

/** Small status dot + label (header lines). */
export function PresenceLabel({ status }: { status: PresenceStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden
        className="h-2 w-2 rounded-full"
        style={{
          backgroundColor: status === "offline" ? "rgba(0,0,0,0.2)" : PRESENCE_COLORS[status],
        }}
      />
      {PRESENCE_LABELS[status]}
    </span>
  );
}

/** Person avatar with their live presence ring (inside a PresenceProvider). */
export function PresenceAvatar({
  userId,
  name,
  photoUrl,
  size = "sm",
  className,
}: {
  userId: string;
  name: string;
  photoUrl: string | null;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}) {
  const status = usePresence(userId);
  return (
    <PresenceRing status={status}>
      <ConnectAvatar
        name={name}
        photoUrl={photoUrl}
        size={size}
        className={cn(className, status !== "offline" && "ring-0")}
      />
    </PresenceRing>
  );
}
