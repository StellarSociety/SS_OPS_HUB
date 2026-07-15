"use client";

import { useCallback, useRef, type MutableRefObject } from "react";
import { useUnsavedChangesGuard } from "@/components/use-unsaved-changes-guard";

type UseSalesFormUnsavedGuardOptions<T> = {
  isEditing: boolean;
  state: T;
  onSaveRef: MutableRefObject<() => Promise<boolean>>;
};

export function useSalesFormUnsavedGuard<T>({
  isEditing,
  state,
  onSaveRef,
}: UseSalesFormUnsavedGuardOptions<T>) {
  const baselineRef = useRef("");

  const syncBaseline = useCallback((nextState: T) => {
    baselineRef.current = JSON.stringify(nextState);
  }, []);

  const isDirty =
    isEditing &&
    baselineRef.current.length > 0 &&
    JSON.stringify(state) !== baselineRef.current;

  const { guardAction, unsavedDialog } = useUnsavedChangesGuard({
    isDirty,
    onSaveRef,
  });

  return {
    syncBaseline,
    guardAction,
    isDirty,
    unsavedDialog,
  };
}
