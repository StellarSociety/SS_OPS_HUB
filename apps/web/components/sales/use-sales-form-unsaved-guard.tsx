"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { useRouter } from "next/navigation";
import { SalesUnsavedChangesDialog } from "@/components/sales/sales-unsaved-changes-dialog";

type UseSalesFormUnsavedGuardOptions<T> = {
  isEditing: boolean;
  state: T;
  onSaveRef: MutableRefObject<() => Promise<boolean>>;
};

function isInternalNavigationHref(href: string): boolean {
  if (
    href.startsWith("#") ||
    href.startsWith("mailto:") ||
    href.startsWith("tel:") ||
    href.startsWith("javascript:")
  ) {
    return false;
  }

  try {
    const url = new URL(href, window.location.href);
    return url.origin === window.location.origin;
  } catch {
    return false;
  }
}

export function useSalesFormUnsavedGuard<T>({
  isEditing,
  state,
  onSaveRef,
}: UseSalesFormUnsavedGuardOptions<T>) {
  const router = useRouter();
  const baselineRef = useRef("");
  const pendingActionRef = useRef<(() => void) | null>(null);
  const pendingHrefRef = useRef<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const syncBaseline = useCallback((nextState: T) => {
    baselineRef.current = JSON.stringify(nextState);
  }, []);

  const isDirty =
    isEditing &&
    baselineRef.current.length > 0 &&
    JSON.stringify(state) !== baselineRef.current;

  const executePending = useCallback(() => {
    const action = pendingActionRef.current;
    const href = pendingHrefRef.current;
    pendingActionRef.current = null;
    pendingHrefRef.current = null;

    if (action) {
      action();
      return;
    }

    if (href) {
      router.push(href);
    }
  }, [router]);

  const guardAction = useCallback(
    (action: () => void) => {
      if (!isEditing || !isDirty) {
        action();
        return;
      }

      pendingActionRef.current = action;
      pendingHrefRef.current = null;
      setDialogOpen(true);
    },
    [isDirty, isEditing],
  );

  const keepEditing = useCallback(() => {
    pendingActionRef.current = null;
    pendingHrefRef.current = null;
    setDialogOpen(false);
  }, []);

  const dontSave = useCallback(() => {
    setDialogOpen(false);
    executePending();
  }, [executePending]);

  const saveFromDialog = useCallback(async () => {
    setSaving(true);
    try {
      const saved = await onSaveRef.current();
      if (!saved) return;
      setDialogOpen(false);
      executePending();
    } finally {
      setSaving(false);
    }
  }, [executePending, onSaveRef]);

  useEffect(() => {
    if (!isDirty) return;

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    function handleDocumentClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) return;

      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;

      const href = anchor.getAttribute("href");
      if (!href || !isInternalNavigationHref(href)) return;

      const destination = new URL(href, window.location.href);
      const current = new URL(window.location.href);
      if (
        destination.pathname === current.pathname &&
        destination.search === current.search &&
        destination.hash === current.hash
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      pendingActionRef.current = null;
      pendingHrefRef.current = `${destination.pathname}${destination.search}${destination.hash}`;
      setDialogOpen(true);
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleDocumentClick, true);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleDocumentClick, true);
    };
  }, [isDirty]);

  useEffect(() => {
    if (!isDirty || dialogOpen) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        keepEditing();
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [dialogOpen, isDirty, keepEditing]);

  const unsavedDialog = (
    <SalesUnsavedChangesDialog
      open={dialogOpen}
      saving={saving}
      onDontSave={dontSave}
      onKeepEditing={keepEditing}
      onSave={() => {
        void saveFromDialog();
      }}
    />
  );

  return {
    syncBaseline,
    guardAction,
    isDirty,
    unsavedDialog,
  };
}
