"use client";

import { useSyncExternalStore } from "react";
import { readStandaloneFromWindow } from "@/lib/pwa/standalone";

function subscribe(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const media = window.matchMedia("(display-mode: standalone)");
  const fullscreen = window.matchMedia("(display-mode: fullscreen)");
  media.addEventListener("change", onStoreChange);
  fullscreen.addEventListener("change", onStoreChange);
  return () => {
    media.removeEventListener("change", onStoreChange);
    fullscreen.removeEventListener("change", onStoreChange);
  };
}

export function useStandaloneMode(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => readStandaloneFromWindow(),
    () => false,
  );
}
