"use client";

import { useState } from "react";
import { DashboardReviewsDialog } from "@/components/sentiment/dashboard-reviews-dialog";
import { Card } from "@/components/ui/card";
import type { NamedCount } from "@/lib/sentiment/review-insights";
import type {
  SentimentReplyTemplate,
  SentimentReview,
  SentimentReviewAction,
} from "@/lib/sentiment/types";
import { cn } from "@/lib/utils";

const TOP_N = 8;

type FollowUp = {
  actionsByReviewId: Record<string, SentimentReviewAction>;
  canEdit: boolean;
  canEditActions: boolean;
  googleCanPost: boolean;
  venueName: string;
  templates: SentimentReplyTemplate[];
};

export function MentionRankCard({
  title,
  items,
  empty,
  resolveReviews,
  followUp,
  footerHref,
}: {
  title: string;
  items: NamedCount[];
  empty: string;
  resolveReviews: (key: string, label: string) => SentimentReview[];
  followUp: FollowUp;
  footerHref: string;
}) {
  const [selected, setSelected] = useState<NamedCount | null>(null);
  const top = items.slice(0, TOP_N);
  const max = top[0]?.count ?? 0;
  const list = selected ? resolveReviews(selected.key, selected.label) : [];

  return (
    <>
      <Card className="flex h-full flex-col p-5">
        <p className="text-center text-xs font-semibold uppercase tracking-wide text-black/45">
          {title}
        </p>
        <div className="mt-2 h-px w-full bg-black/10" />
        {top.length === 0 ? (
          <p className="mt-6 text-center text-sm text-black/45">{empty}</p>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {top.map((item) => {
              const pct = max > 0 ? (item.count / max) * 100 : 0;
              return (
                <li key={item.key} className="flex items-center justify-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSelected(item)}
                    className={cn(
                      "shrink-0 truncate rounded-full border px-2.5 py-0.5 text-left text-[11px] font-medium",
                      "border-[var(--venue-primary,#818a40)]/30 bg-[var(--venue-primary,#818a40)]/12 text-[#3D421F]",
                      "hover:bg-[var(--venue-primary,#818a40)]/20",
                    )}
                  >
                    {item.label}
                  </button>
                  <div className="h-1 w-10 shrink-0 overflow-hidden rounded-full bg-black/[0.08]">
                    <div
                      className="h-full rounded-full bg-[var(--venue-primary,#818a40)]"
                      style={{ width: `${Math.max(pct, 12)}%` }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelected(item)}
                    className="shrink-0 tabular-nums text-sm font-medium text-[var(--venue-primary,#818a40)] hover:underline"
                    aria-label={`${item.count} reviews mentioning ${item.label}`}
                  >
                    {item.count}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <DashboardReviewsDialog
        open={selected != null}
        title={selected?.label ?? title}
        description={`${list.length} review${list.length === 1 ? "" : "s"} mentioning this.`}
        empty="No matching reviews."
        footerHref={footerHref}
        footerLabel="Open reviews"
        reviews={list}
        actionsByReviewId={followUp.actionsByReviewId}
        canEdit={followUp.canEdit}
        canEditActions={followUp.canEditActions}
        googleCanPost={followUp.googleCanPost}
        venueName={followUp.venueName}
        templates={followUp.templates}
        compactAction
        onClose={() => setSelected(null)}
      />
    </>
  );
}
