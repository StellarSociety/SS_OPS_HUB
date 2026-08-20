import { ReplyTemplatesEditor } from "@/components/sentiment/reply-templates-editor";
import {
  canAdminSettings,
  canEditReviews,
} from "@/lib/sentiment/permissions";
import { getSentimentPageContext } from "@/lib/sentiment/page-context";
import { listReplyTemplates } from "@/lib/sentiment/store";
import type { SentimentReplyTemplate } from "@/lib/sentiment/types";

export default async function SentimentTemplatesSettingsPage() {
  const { supabase, venue, permissions } = await getSentimentPageContext();
  const templates = await listReplyTemplates(supabase, venue.id).catch(
    () => [] as SentimentReplyTemplate[],
  );
  const canEdit =
    canAdminSettings(permissions, venue.id) ||
    canEditReviews(permissions, venue.id);

  return (
    <ReplyTemplatesEditor templates={templates} canEdit={canEdit} />
  );
}
