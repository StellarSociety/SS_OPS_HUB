import { GuestFeedbackQuestionnaireEditor } from "@/components/sentiment/guest-feedback-questionnaire-editor";
import { getGuestFeedbackPage } from "@/lib/sentiment/guest-feedback/page-context";

export default async function GuestFeedbackQuestionnairePage() {
  const { venue, questions, canEdit } = await getGuestFeedbackPage();

  if (venue.is_global) {
    return (
      <p className="text-sm text-black/55">
        Guest Feedback is available on venue workspaces, not Global.
      </p>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <GuestFeedbackQuestionnaireEditor questions={questions} canEdit={canEdit} />
    </div>
  );
}
