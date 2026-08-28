import { GuestFeedbackSettingsPanel } from "@/components/sentiment/guest-feedback-settings-panel";
import { getGuestFeedbackPage } from "@/lib/sentiment/guest-feedback/page-context";

export default async function GuestFeedbackPage() {
  const { venue, settings, formUrl, formQrSvg, canEdit } =
    await getGuestFeedbackPage();

  if (venue.is_global || !settings) {
    return (
      <p className="text-sm text-black/55">
        Guest Feedback is available on venue workspaces, not Global.
      </p>
    );
  }

  return (
    <div className="mx-auto h-full w-full max-w-5xl overflow-y-auto">
      <GuestFeedbackSettingsPanel
        settings={settings}
        formUrl={formUrl}
        formQrSvg={formQrSvg}
        canEdit={canEdit}
      />
    </div>
  );
}
