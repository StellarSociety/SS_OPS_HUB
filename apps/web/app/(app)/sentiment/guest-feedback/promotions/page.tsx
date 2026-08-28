import { GuestFeedbackPromotionsEditor } from "@/components/sentiment/guest-feedback-promotions-editor";
import { getGuestFeedbackPage } from "@/lib/sentiment/guest-feedback/page-context";

export default async function GuestFeedbackPromotionsPage() {
  const { venue, promotions, canEdit } = await getGuestFeedbackPage();

  if (venue.is_global) {
    return (
      <p className="text-sm text-black/55">
        Guest Feedback is available on venue workspaces, not Global.
      </p>
    );
  }

  return (
    <div className="mx-auto h-full w-full max-w-5xl overflow-y-auto">
      <GuestFeedbackPromotionsEditor promotions={promotions} canEdit={canEdit} />
    </div>
  );
}
