"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import {
  deletePersistedValue,
  readPersistedJson,
  writePersistedJson,
} from "@/lib/ui/client-persistence";

function resolveDefault<T>(value: T | (() => T)): T {
  return typeof value === "function" ? (value as () => T)() : value;
}

/**
 * Persist React state to cookies (+ localStorage mirror) so filters / dates
 * survive page refresh. Hydrates once after mount to avoid SSR mismatches.
 */
export function usePersistedState<T>(
  storageKey: string,
  defaultValue: T | (() => T),
  sanitize?: (value: unknown) => T,
): [T, Dispatch<SetStateAction<T>>, boolean] {
  const [state, setState] = useState<T>(() => resolveDefault(defaultValue));
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);
  const hydrated = hydratedKey === storageKey;

  useEffect(() => {
    const stored = readPersistedJson(storageKey);
    if (stored != null) {
      setState(sanitize ? sanitize(stored) : (stored as T));
    } else {
      setState(resolveDefault(defaultValue));
    }
    setHydratedKey(storageKey);
    // Only re-hydrate when the storage key changes (e.g. venue switch).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- defaultValue/sanitize are stable enough per call site
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    writePersistedJson(storageKey, state);
  }, [hydrated, state, storageKey]);

  return [state, setState, hydrated];
}

export function clearPersistedState(storageKey: string): void {
  deletePersistedValue(storageKey);
}
