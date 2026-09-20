"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { HubTermsDocument } from "@/components/hub-terms/hub-terms-document";
import { acceptHubTerms } from "@/lib/actions/hub-terms";
import { buildMobileTerms } from "@/lib/mobile/terms-content";
import type { Venue } from "@/lib/types/database";

export function HubTermsWebPage({
  venue,
  alreadyAccepted,
}: {
  venue: Venue;
  alreadyAccepted: boolean;
}) {
  const router = useRouter();
  const terms = buildMobileTerms(venue.name);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function accept() {
    setError(null);
    startTransition(async () => {
      const result = await acceptHubTerms({
        venueId: venue.id,
        client: "web",
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-6 pb-16">
      <HubTermsDocument terms={terms} />
      <p className="mt-6 rounded-xl border border-black/10 bg-black/[0.03] px-3 py-2.5 text-center text-xs leading-relaxed text-black/50">
        Continued use of the Hub confirms you have read these terms and will
        follow them. Consequences in section 16 apply if you do not.
      </p>
      {alreadyAccepted ? (
        <p className="mt-4 text-center text-sm font-medium text-[#3D421F]">
          You have read and understood these terms.
        </p>
      ) : (
        <div className="mt-4">
          {error ? (
            <p className="mb-2 text-center text-xs text-rose-700">{error}</p>
          ) : null}
          <button
            type="button"
            disabled={pending}
            onClick={accept}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-black/10 bg-[#3D421F] py-2.5 text-[15px] font-medium text-white disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            I read and understood
          </button>
        </div>
      )}
    </div>
  );
}
