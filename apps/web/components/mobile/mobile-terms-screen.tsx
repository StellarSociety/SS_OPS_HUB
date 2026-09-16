"use client";

import { type CSSProperties } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import { buildMobileTerms } from "@/lib/mobile/terms-content";
import { mobileWelcomeHref } from "@/lib/mobile/app-path";
import type { Venue } from "@/lib/types/database";
import {
  MobilePressTarget,
  useMobilePressMotion,
} from "@/components/mobile/mobile-press";
import { useMobileNavBusy } from "@/components/mobile/mobile-nav-busy";

type MobileTermsScreenProps = {
  venue: Venue;
  onBack?: () => void;
  backHref?: string;
};

export function MobileTermsScreen({
  venue,
  onBack,
  backHref,
}: MobileTermsScreenProps) {
  const { beginNav } = useMobileNavBusy();
  const terms = buildMobileTerms(venue.name);
  const homeHref = backHref ?? mobileWelcomeHref(venue.slug);

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
          <h1 className="px-8 text-center font-serif text-2xl font-semibold text-[#3D421F] dark:text-[CanvasText]">
            {terms.title}
          </h1>
        </div>
        <p className="text-center text-xs text-black/50 dark:text-white/50">
          Effective {terms.effectiveDate}
        </p>
        <p className="mt-0.5 text-center text-xs text-black/40 dark:text-white/40">
          {terms.productName}
        </p>
        <hr className="mt-3 border-black/10 dark:border-white/12" />

        <p className="mt-4 text-sm leading-relaxed text-black/70 dark:text-white/70">
          {terms.intro}
        </p>

        <div className="mt-5 space-y-5">
          {terms.sections.map((section) => (
            <section key={section.id}>
              <h2 className="font-serif text-base text-[#3D421F] dark:text-[CanvasText]">
                {section.heading}
              </h2>
              <div className="mt-1.5 space-y-2">
                {section.paragraphs.map((paragraph, index) => (
                  <p
                    key={`${section.id}-${index}`}
                    className="text-sm leading-relaxed text-black/65 dark:text-white/65"
                  >
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <p className="mt-6 rounded-xl border border-black/10 bg-black/[0.03] px-3 py-2.5 text-center text-xs leading-relaxed text-black/50 dark:border-white/12 dark:bg-white/[0.08] dark:text-white/50">
          Continued use of the Hub confirms you have read these terms and will
          follow them. Consequences in section 16 apply if you do not.
        </p>
      </div>
    </div>
  );
}

function TermsBackLink({ href }: { href: string }) {
  const { motionProps } = useMobilePressMotion();
  const { beginNav } = useMobileNavBusy();
  return (
    <motion.div className="absolute left-0 top-0.5" {...motionProps}>
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
