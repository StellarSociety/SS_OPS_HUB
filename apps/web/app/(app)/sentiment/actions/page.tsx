import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import { ModulePageTitle } from "@/components/layout/module-page-title";
import { ReviewActionsTable } from "@/components/sentiment/review-actions-table";
import { SentimentLink } from "@/components/sentiment/sentiment-link";
import { Card } from "@/components/ui/card";
import { followUpActionRows } from "@/lib/sentiment/action-rows";
import {
  canAccessActions,
} from "@/lib/sentiment/permissions";
import { getSentimentPageContext } from "@/lib/sentiment/page-context";
import {
  loadSentimentWorkspace,
  sentimentEditFlags,
} from "@/lib/sentiment/workspace";

export default async function SentimentActionsPage() {
  const { supabase, venue, permissions, user } = await getSentimentPageContext();

  if (!canAccessActions(permissions, venue.id)) {
    return <AccessDeniedBounce />;
  }

  const workspace = await loadSentimentWorkspace(supabase, venue.id);
  const rows = followUpActionRows(
    workspace.reviews,
    workspace.actionsByReviewId,
  );
  const { canEditActions: canEdit } = sentimentEditFlags(
    permissions,
    venue.id,
  );

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <div>
        <ModulePageTitle>Actions</ModulePageTitle>
        <p className="mt-1 text-sm text-black/60">
          Follow-up on weak reviews: what happened, then how you recovered the
          guest.
        </p>
        <hr className="mt-4 border-black/10" />
      </div>

      {rows.length === 0 ? (
        <Card className="p-8 text-center">
          <h2 className="font-serif text-xl text-[#3D421F]">No follow-ups yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-black/55">
            1–3 star reviews appear here automatically. You can also start a
            follow-up from any review card.
          </p>
          <SentimentLink
            href="/sentiment/reviews"
            className="mt-4 inline-flex h-10 items-center rounded-md bg-[var(--venue-primary,#818a40)] px-4 text-sm font-medium text-white hover:opacity-90"
          >
            Open Reviews
          </SentimentLink>
        </Card>
      ) : (
        <ReviewActionsTable
          rows={rows}
          canEdit={canEdit}
          currentUserId={user.id}
        />
      )}
    </div>
  );
}
