import { GuestFeedbackSocialsEditor } from "@/components/sentiment/guest-feedback-socials-editor";
import { loadEmailChromeForVenue } from "@/lib/hr/email-chrome";
import {
  EMAIL_CHROME_SOCIAL_LINK_KEYS,
  type EmailChromeSocialLinkKey,
} from "@/lib/hr/types";
import { getGuestFeedbackPage } from "@/lib/sentiment/guest-feedback/page-context";
import { googleReviewHref } from "@/lib/sentiment/guest-feedback/outbound-links";
import { listReviewSources } from "@/lib/sentiment/store";
import { createServiceClient } from "@/lib/supabase/service";

export default async function GuestFeedbackSocialsPage() {
  const { venue, canEdit } = await getGuestFeedbackPage();

  if (venue.is_global) {
    return (
      <p className="text-sm text-black/55">
        Guest Feedback is available on venue workspaces, not Global.
      </p>
    );
  }

  const service = createServiceClient();
  const [chrome, sources] = await Promise.all([
    loadEmailChromeForVenue(service, venue),
    listReviewSources(service, venue.id),
  ]);
  const google = sources.find((source) => source.channel === "google");
  const tripadvisor = sources.find((source) => source.channel === "tripadvisor");
  const fallbacks: Partial<Record<EmailChromeSocialLinkKey, string>> = {
    googleUrl:
      googleReviewHref(google?.place_id ?? null, google?.location_url ?? null) ??
      "",
    tripadvisorUrl: tripadvisor?.location_url?.trim() || "",
  };

  const values = Object.fromEntries(
    EMAIL_CHROME_SOCIAL_LINK_KEYS.map((key) => [
      key,
      chrome[key] || fallbacks[key] || "",
    ]),
  ) as Record<EmailChromeSocialLinkKey, string>;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <GuestFeedbackSocialsEditor values={values} canEdit={canEdit} />
    </div>
  );
}
