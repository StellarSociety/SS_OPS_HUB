"use client";

import { useEffect } from "react";
import { markConnectSeen } from "@/lib/actions/connect";

/** Marks this feed's Connecteam notifications read once it has been opened. */
export function ConnectSeenMarker({ groupId = null }: { groupId?: string | null }) {
  useEffect(() => {
    void markConnectSeen(groupId);
  }, [groupId]);
  return null;
}
