"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Lock } from "lucide-react";
import { useVenueScope } from "@/components/providers/venue-scope-provider";
import { Button } from "@/components/ui/button";
import { ACCESS_DENIED_MESSAGE, ACCESS_DENIED_TITLE } from "@/lib/access/messages";
import { canOpenAppPath, toCanonicalAppPath } from "@/lib/access/page-access";
import type { UserPermission } from "@/lib/role-permissions";

type PageAccessValue = {
  canOpenHref: (href: string) => boolean;
  notifyAccessDenied: () => void;
};

const PageAccessContext = createContext<PageAccessValue | null>(null);

export function PageAccessProvider({
  permissions,
  venueId,
  children,
}: {
  permissions: UserPermission[];
  venueId: string;
  children: ReactNode;
}) {
  const { scope, slug } = useVenueScope();
  const [deniedOpen, setDeniedOpen] = useState(false);

  const canOpenHref = useCallback(
    (href: string) => {
      const canonical = toCanonicalAppPath(href, scope, slug);
      return canOpenAppPath(permissions, venueId, canonical);
    },
    [permissions, venueId, scope, slug],
  );

  const notifyAccessDenied = useCallback(() => {
    setDeniedOpen(true);
  }, []);

  const value = useMemo(
    () => ({ canOpenHref, notifyAccessDenied }),
    [canOpenHref, notifyAccessDenied],
  );

  return (
    <PageAccessContext.Provider value={value}>
      {children}
      {deniedOpen ? (
        <AccessDeniedPopup onClose={() => setDeniedOpen(false)} />
      ) : null}
    </PageAccessContext.Provider>
  );
}

export function usePageAccess(): PageAccessValue {
  return (
    useContext(PageAccessContext) ?? {
      canOpenHref: () => true,
      notifyAccessDenied: () => {},
    }
  );
}

/** Returns false when the click was blocked (caller should skip navigation). */
export function guardAppNavigation(
  access: PageAccessValue,
  href: string | undefined,
  event?: MouseEvent,
): boolean {
  if (!href || href.startsWith("#")) return true;
  if (event?.metaKey || event?.ctrlKey || event?.shiftKey || event?.altKey) {
    return true;
  }
  if (access.canOpenHref(href)) return true;
  event?.preventDefault();
  event?.stopPropagation();
  access.notifyAccessDenied();
  return false;
}

function AccessDeniedPopup({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="access-denied-title"
        className="w-full max-w-md rounded-2xl border border-black/10 bg-white p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <Lock className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2
              id="access-denied-title"
              className="font-serif text-xl text-[#3D421F]"
            >
              {ACCESS_DENIED_TITLE}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-black/70">
              {ACCESS_DENIED_MESSAGE}
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end">
          <Button type="button" onClick={onClose}>
            OK
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
