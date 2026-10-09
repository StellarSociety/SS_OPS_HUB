import type { ComposerCelebration } from "@/components/connect/post-composer";
import type { ConnectCelebrationItem } from "./types";

/** Resolve `?celebrate=<staffId>&kind=…` into a composer celebration preset. */
export function composerCelebrationFromParams(
  params: { celebrate?: string; kind?: string },
  celebrations: ConnectCelebrationItem[],
): ComposerCelebration | null {
  if (!params.celebrate) return null;
  const match = celebrations.find(
    (c) => c.staffId === params.celebrate && (!params.kind || c.kind === params.kind),
  );
  if (!match) return null;
  return {
    staffId: match.staffId,
    staffName: match.staffName,
    kind: match.kind,
    years: match.years,
  };
}
