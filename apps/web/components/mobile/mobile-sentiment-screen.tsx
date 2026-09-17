"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { MobileTabBar } from "@/components/mobile/mobile-tab-bar";
import { ReviewCard } from "@/components/sentiment/review-card";
import { ReviewsCalendar } from "@/components/sentiment/reviews-calendar";
import { ReviewsList } from "@/components/sentiment/reviews-list";
import { ReviewsPeriodFilter } from "@/components/sentiment/reviews-period-filter";
import { SentimentDashboardMetrics } from "@/components/sentiment/dashboard-metrics";
import {
  SentimentLink,
  SentimentNavProvider,
} from "@/components/sentiment/sentiment-link";
import { Card } from "@/components/ui/card";
import { followUpActionRows } from "@/lib/sentiment/action-rows";
import { buildSentimentDashboardModel } from "@/lib/sentiment/dashboard-data";
import {
  currentMonthKeyInDubai,
  lastTwelveMonthKeys,
  resolveReviewPeriod,
  type ResolvedReviewPeriod,
} from "@/lib/sentiment/review-period";
import type { StaffMentionRow } from "@/lib/sentiment/workspace";
import type { MobileTabItem } from "@/lib/mobile/tab-bars";
import { tabBarItems } from "@/lib/mobile/tab-bars";
import type {
  SentimentReplyTemplate,
  SentimentReview,
  SentimentReviewAction,
} from "@/lib/sentiment/types";
import type { Venue } from "@/lib/types/database";

export type MobileSentimentTab =
  | "dashboard"
  | "reviews"
  | "calendar"
  | "actions";

export type MobileSentimentBundle = {
  reviews: SentimentReview[];
  actionsByReviewId: Record<string, SentimentReviewAction>;
  templates: SentimentReplyTemplate[];
  staffRows: StaffMentionRow[];
  googleCanPost: boolean;
  canEdit: boolean;
  canEditActions: boolean;
};

const TAB_TITLES: Record<MobileSentimentTab, string> = {
  dashboard: "Dashboard",
  reviews: "Reviews",
  calendar: "Calendar Reviews",
  actions: "Reviews Actions",
};

type MobileSentimentScreenProps = {
  tab: MobileSentimentTab;
  venue: Venue;
  bundle: MobileSentimentBundle;
  period?: ResolvedReviewPeriod;
  monthKey?: string;
  onSelectTab?: (tab: MobileTabItem) => void;
};

export function MobileSentimentScreen({
  tab,
  venue,
  bundle,
  period,
  monthKey: monthKeyProp,
  onSelectTab,
}: MobileSentimentScreenProps) {
  const preview = Boolean(onSelectTab);
  const [previewMonthKey, setPreviewMonthKey] = useState(
    () => monthKeyProp ?? currentMonthKeyInDubai(),
  );
  const monthKey = preview ? previewMonthKey : (monthKeyProp ?? currentMonthKeyInDubai());
  const resolvedPeriod = period ?? resolveReviewPeriod({ period: "all" });

  const dashboard = useMemo(
    () =>
      buildSentimentDashboardModel({
        venue: {
          slug: venue.slug,
          name: venue.name,
          isGlobal: venue.is_global,
          primaryColor: venue.primary_color,
          logoUrl: venue.logo_url,
          iconUrl: venue.icon_url,
          faviconUrl: venue.favicon_url,
        },
        reviews: bundle.reviews,
        actionsByReviewId: bundle.actionsByReviewId,
        templates: bundle.templates,
        staffRows: bundle.staffRows,
        canEdit: bundle.canEdit,
        canEditActions: bundle.canEditActions,
        googleCanPost: bundle.googleCanPost,
      }),
    [bundle, venue],
  );

  const actionRows = useMemo(
    () => followUpActionRows(bundle.reviews, bundle.actionsByReviewId),
    [bundle.actionsByReviewId, bundle.reviews],
  );

  return (
    <SentimentNavProvider
      base={`/m/${venue.slug}/sentiment`}
      preview={preview}
      onNavigate={(pageId) => {
        const next = tabBarItems("sentiment").find((item) => item.pageId === pageId);
        if (next) onSelectTab?.(next);
      }}
    >
      <div
        className="mobile-app-canvas relative flex h-full min-h-0 flex-col"
        style={
          {
            "--venue-primary": venue.primary_color,
            "--venue-secondary": venue.secondary_color,
          } as CSSProperties
        }
      >
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 pb-32 pt-4">
          <h1 className="text-center font-serif text-2xl font-semibold text-[#3D421F] dark:text-[CanvasText]">
            {venue.name} {TAB_TITLES[tab]}
          </h1>
          <hr className="mt-3 border-black/10 dark:border-white/12" />

          <div className="mx-auto mt-4 w-full max-w-none space-y-4">
            {tab === "dashboard" ? (
              <SentimentDashboardMetrics {...dashboard} compact />
            ) : null}

            {tab === "reviews" ? (
              <>
                {preview ? null : <ReviewsPeriodFilter compact />}
                <ReviewsList
                  reviews={bundle.reviews}
                  period={resolvedPeriod}
                  canEdit={bundle.canEdit}
                  canEditActions={bundle.canEditActions}
                  googleCanPost={bundle.googleCanPost}
                  venueName={venue.name}
                  templates={bundle.templates}
                  actionsByReviewId={bundle.actionsByReviewId}
                  compact
                />
              </>
            ) : null}

            {tab === "calendar" ? (
              <ReviewsCalendar
                monthKey={monthKey}
                stripMonthKeys={lastTwelveMonthKeys()}
                reviews={bundle.reviews}
                canEdit={bundle.canEdit}
                canEditActions={bundle.canEditActions}
                googleCanPost={bundle.googleCanPost}
                venueName={venue.name}
                templates={bundle.templates}
                actionsByReviewId={bundle.actionsByReviewId}
                compact
                onMonthChange={preview ? setPreviewMonthKey : undefined}
              />
            ) : null}

            {tab === "actions" ? (
              <MobileActionsList
                rows={actionRows}
                canEdit={bundle.canEdit}
                canEditActions={bundle.canEditActions}
                googleCanPost={bundle.googleCanPost}
                venueName={venue.name}
                templates={bundle.templates}
              />
            ) : null}
          </div>
        </div>

        <MobileTabBar
          app="sentiment"
          activeId={tab}
          venueSlug={venue.slug}
          onSelectTab={onSelectTab}
        />
      </div>
    </SentimentNavProvider>
  );
}

function MobileActionsList({
  rows,
  canEdit,
  canEditActions,
  googleCanPost,
  venueName,
  templates,
}: {
  rows: ReturnType<typeof followUpActionRows>;
  canEdit: boolean;
  canEditActions: boolean;
  googleCanPost: boolean;
  venueName: string;
  templates: SentimentReplyTemplate[];
}) {
  const awaiting = rows.filter((row) => !row.review.reply_text?.trim());
  const replied = rows.filter((row) => Boolean(row.review.reply_text?.trim()));

  if (rows.length === 0) {
    return (
      <Card className="p-6 text-center">
        <h2 className="font-serif text-xl text-[#3D421F] dark:text-[CanvasText]">
          No follow-ups yet
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-black/55 dark:text-white/55">
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
    );
  }

  return (
    <div className="space-y-5">
      {awaiting.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-black/45">
            Awaiting reply
            <span className="ml-2 tabular-nums text-black/35">
              {awaiting.length}
            </span>
          </h2>
          {awaiting.map(({ review, action }) => (
            <ReviewCard
              key={review.id}
              review={review}
              canEdit={canEdit}
              googleCanPost={googleCanPost}
              venueName={venueName}
              templates={templates}
              action={action}
              canEditActions={canEditActions}
              compactAction
            />
          ))}
        </section>
      ) : null}
      {replied.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-black/45">
            Reply sent
            <span className="ml-2 tabular-nums text-black/35">
              {replied.length}
            </span>
          </h2>
          {replied.map(({ review, action }) => (
            <ReviewCard
              key={review.id}
              review={review}
              canEdit={canEdit}
              googleCanPost={googleCanPost}
              venueName={venueName}
              templates={templates}
              action={action}
              canEditActions={canEditActions}
              compactAction
            />
          ))}
        </section>
      ) : null}
    </div>
  );
}
