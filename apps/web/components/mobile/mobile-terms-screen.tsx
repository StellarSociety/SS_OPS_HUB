"use client";

import { useState, useTransition, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ChevronLeft, Loader2 } from "lucide-react";
import { HubTermsDocument } from "@/components/hub-terms/hub-terms-document";
import {
  MobilePressTarget,
  useMobilePressMotion,
} from "@/components/mobile/mobile-press";
import { useMobileNavBusy } from "@/components/mobile/mobile-nav-busy";
import { acceptHubTerms } from "@/lib/actions/hub-terms";
import { mobileWelcomeHref } from "@/lib/mobile/app-path";
import { buildMobileTerms } from "@/lib/mobile/terms-content";
import type { Venue } from "@/lib/types/database";

const ACCEPT_BUTTON_CLASS =
  "flex w-full items-center justify-center gap-1.5 rounded-xl border border-black/10 bg-[#3D421F] py-2.5 text-[15px] font-medium text-white disabled:opacity-60 dark:border-white/12";

type MobileTermsScreenProps = {
  venue: Venue;
  onBack?: () => void;
  backHref?: string;
  onAccepted?: () => void;
  /** Device preview only — do not write a real acknowledgement. */
  persistAcceptance?: boolean;
};

export function MobileTermsScreen({
  venue,
  onBack,
  backHref,
  onAccepted,
  persistAcceptance = true,
}: MobileTermsScreenProps) {
  const router = useRouter();
  const { beginNav } = useMobileNavBusy();
  const terms = buildMobileTerms(venue.name);
  const homeHref = backHref ?? mobileWelcomeHref(venue.slug);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function accept() {
    setError(null);
    startTransition(async () => {
      if (persistAcceptance) {
        const result = await acceptHubTerms({
          venueId: venue.id,
          client: "mobile",
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
      }
      beginNav();
      if (onAccepted) {
        onAccepted();
        return;
      }
      if (onBack) {
        onBack();
        return;
      }
      router.push(homeHref);
      router.refresh();
    });
  }

  return (
    <div
      className="mobile-app-canvas relative flex h-full min-h-0 flex-col"
      style={
        {
          "--venue-primary": venue.primary_color,
          "--venue-secondary": venue.secondary_color,
        } as CSSProperties
      }
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-10 pt-4">
        <div className="relative mb-3">
          {onBack ? (
            <MobilePressTarget
              type="button"
              onClick={() => {
                beginNav();
                onBack();
              }}
              aria-label="Back to welcome"
              className="absolute left-0 top-0.5 flex h-8 w-8 items-center justify-center rounded-full text-[#3D421F] hover:bg-black/[0.06] dark:text-[CanvasText] dark:hover:bg-white/[0.08]"
            >
              <ChevronLeft className="h-5 w-5" strokeWidth={2} />
            </MobilePressTarget>
          ) : (
            <TermsBackLink href={homeHref} />
          )}
          <HubTermsDocument terms={terms} titleClassName="px-8" />
        </div>

        <p className="mt-6 rounded-xl border border-black/10 bg-black/[0.03] px-3 py-2.5 text-center text-xs leading-relaxed text-black/50 dark:border-white/12 dark:bg-white/[0.08] dark:text-white/50">
          Continued use of the Hub confirms you have read these terms and will
          follow them. Consequences in section 16 apply if you do not.
        </p>

        {error ? (
          <p className="mt-3 text-center text-xs text-rose-700">{error}</p>
        ) : null}

        <div className="mt-3">
          <MobilePressTarget
            type="button"
            onClick={accept}
            disabled={pending}
            className={ACCEPT_BUTTON_CLASS}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            I read and understood
          </MobilePressTarget>
        </div>
      </div>
    </div>
  );
}

function TermsBackLink({ href }: { href: string }) {
  const { motionProps } = useMobilePressMotion();
  const { beginNav } = useMobileNavBusy();
  return (
    <motion.div className="absolute left-0 top-0.5 z-10" {...motionProps}>
      <Link
        href={href}
        aria-label="Back to welcome"
        className="flex h-8 w-8 items-center justify-center rounded-full text-[#3D421F] hover:bg-black/[0.06] dark:text-[CanvasText] dark:hover:bg-white/[0.08]"
        onClick={() => beginNav()}
      >
        <ChevronLeft className="h-5 w-5" strokeWidth={2} />
      </Link>
    </motion.div>
  );
}
