"use client";

import { useState, type CSSProperties } from "react";
import { ChevronLeft, X } from "lucide-react";
import { AcknowledgementEmployeeView } from "@/components/hr/acknowledgement-employee-view";
import { MobilePressTarget } from "@/components/mobile/mobile-press";
import { useMobileNavBusy } from "@/components/mobile/mobile-nav-busy";
import { submitPublicEmailAcknowledgement } from "@/lib/actions/hr-acknowledgements";
import { acknowledgementMessageHtml } from "@/lib/hr/acknowledgement-email-preview";
import { DEFAULT_HR_ACKNOWLEDGEMENT_PAGE_SETTINGS } from "@/lib/hr/acknowledgement";
import type { MobileProfileAssetTerms, MobileWelcomeProfile } from "@/lib/mobile/welcome-profile";
import { getVenueLogoUrl } from "@/lib/venue/branding";
import type { Venue } from "@/lib/types/database";

type MobileAssetTermsScreenProps = {
  venue: Venue;
  profile: MobileWelcomeProfile;
  terms: MobileProfileAssetTerms;
  onBack: () => void;
  onSubmitted?: (terms: MobileProfileAssetTerms) => void;
};

export function MobileAssetTermsScreen({
  venue,
  profile,
  terms,
  onBack,
  onSubmitted,
}: MobileAssetTermsScreenProps) {
  const { beginNav } = useMobileNavBusy();
  const [current, setCurrent] = useState(terms);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showContents, setShowContents] = useState(false);
  const venueLogoUrl = getVenueLogoUrl(venue);
  const contentsHtml = acknowledgementMessageHtml({
    html: current.bodyHtml,
    text: current.bodyText,
  });

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
          <MobilePressTarget
            type="button"
            onClick={() => {
              beginNav();
              onBack();
            }}
            aria-label="Back to profile"
            className="absolute left-0 top-0.5 flex h-8 w-8 items-center justify-center rounded-full text-[#3D421F] hover:bg-black/[0.06] dark:text-[CanvasText] dark:hover:bg-white/[0.08]"
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={2} />
          </MobilePressTarget>
          <h1 className="px-8 text-center font-serif text-2xl font-semibold text-[#3D421F] dark:text-[CanvasText]">
            Asset T&Cs
          </h1>
        </div>
        <hr className="mb-4 border-black/10 dark:border-white/12" />

        <AcknowledgementEmployeeView
          venueName={venue.name}
          venueLogoUrl={venueLogoUrl}
          settings={{
            ...DEFAULT_HR_ACKNOWLEDGEMENT_PAGE_SETTINGS,
            ...current.settings,
            submittedMessage:
              "Your response has been recorded. Tap back to return to your profile.",
          }}
          subject={current.subject}
          employeeName={profile.fullName?.trim() || profile.email || "Employee"}
          employeeEmail={profile.workEmail || profile.personalEmail || profile.email}
          status={current.status}
          comments={current.comments}
          submitting={submitting}
          error={error}
          onOpenContents={() => setShowContents(true)}
          onSubmit={async (input) => {
            setSubmitting(true);
            setError(null);
            const result = await submitPublicEmailAcknowledgement({
              token: current.token,
              decision: input.decision,
              comments: input.comments,
            });
            setSubmitting(false);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            const next: MobileProfileAssetTerms = {
              ...current,
              status: result.record.status,
              comments: result.record.comments,
              respondedAt: result.record.respondedAt,
            };
            setCurrent(next);
            onSubmitted?.(next);
          }}
        />
      </div>

      {showContents ? (
        <div
          className="absolute inset-0 z-20 flex flex-col bg-[var(--venue-secondary,#F0F3DD)]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="asset-terms-contents-title"
        >
          <div className="flex items-center gap-2 px-3 pt-4">
            <button
              type="button"
              onClick={() => setShowContents(false)}
              aria-label="Close contents"
              className="flex h-8 w-8 items-center justify-center rounded-full text-[#3D421F] hover:bg-black/[0.06]"
            >
              <X className="h-5 w-5" strokeWidth={2} />
            </button>
            <h2
              id="asset-terms-contents-title"
              className="min-w-0 flex-1 pr-8 text-center font-serif text-lg font-semibold text-[#3D421F]"
            >
              Contents
            </h2>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-3">
            <div className="rounded-2xl border border-black/10 bg-white px-4 py-4 shadow-sm">
              <p className="text-[11px] font-medium uppercase tracking-wide text-black/45">
                Subject
              </p>
              <p className="mt-1 text-sm font-medium text-[#3D421F]">
                {current.subject}
              </p>
              <hr className="my-3 border-black/10" />
              {contentsHtml ? (
                <div
                  className="text-sm leading-relaxed text-[#3D421F] [&_a]:text-[var(--venue-primary,#6B7B3A)] [&_a]:underline [&_p]:mb-2 [&_table]:w-full"
                  dangerouslySetInnerHTML={{ __html: contentsHtml }}
                />
              ) : (
                <p className="text-sm text-black/45">
                  The original T&amp;Cs message is not available on this record.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
