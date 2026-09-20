"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { HubTermsDocument } from "@/components/hub-terms/hub-terms-document";
import { LiquidGlassPanel, LiquidGlassScrimBackdrop } from "@/components/ui/liquid-glass";
import { acceptHubTerms } from "@/lib/actions/hub-terms";
import type { HubTermsClient } from "@/lib/hub-terms";
import { buildMobileTerms } from "@/lib/mobile/terms-content";
import type { Venue } from "@/lib/types/database";
import { cn } from "@/lib/utils";

const ACCEPT_BUTTON_CLASS =
  "flex w-full items-center justify-center gap-1.5 rounded-xl border border-black/10 bg-[#3D421F] py-2.5 text-[15px] font-medium text-white disabled:opacity-60 dark:border-white/12";

export function HubTermsAcceptanceDialog({
  venue,
  client,
}: {
  venue: Venue;
  client: HubTermsClient;
}) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const terms = buildMobileTerms(venue.name);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  if (!mounted) return null;

  function accept() {
    setError(null);
    startTransition(async () => {
      const result = await acceptHubTerms({ venueId: venue.id, client });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  const compact = client === "mobile";

  return createPortal(
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-3 sm:p-4">
      <LiquidGlassScrimBackdrop />
      <LiquidGlassPanel
        labelledBy="hub-terms-title"
        className={cn(
          "flex w-full flex-col rounded-2xl",
          compact
            ? "max-h-[min(92dvh,720px)] max-w-[26rem]"
            : "max-h-[min(92vh,820px)] max-w-2xl",
        )}
      >
        <div className="relative min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <p className="mb-3 text-center text-xs font-medium uppercase tracking-wide text-black/45">
            Please read and accept to continue
          </p>
          <HubTermsDocument terms={terms} />
          <p className="mt-6 rounded-xl border border-black/10 bg-black/[0.03] px-3 py-2.5 text-center text-xs leading-relaxed text-black/50 dark:border-white/12 dark:bg-white/[0.08] dark:text-white/50">
            Continued use of the Hub confirms you have read these terms and will
            follow them. Consequences in section 16 apply if you do not.
          </p>
        </div>
        <div className="relative shrink-0 border-t border-white/35 px-5 py-3">
          {error ? (
            <p className="mb-2 text-center text-xs text-rose-700">{error}</p>
          ) : null}
          <button
            type="button"
            className={ACCEPT_BUTTON_CLASS}
            disabled={pending}
            onClick={accept}
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            I read and understood
          </button>
        </div>
      </LiquidGlassPanel>
    </div>,
    document.body,
  );
}
