"use client";

import { useState, type ComponentType } from "react";
import { CalendarDays, ClipboardList, MessageSquare } from "lucide-react";
import { Card } from "@/components/ui/card";
import { VenueBrandIcon } from "@/components/brand/venue-brand-icon";
import { AnimatedRatingStars } from "@/components/sentiment/animated-rating-stars";
import {
  GoogleMark,
  GuestMark,
  TripAdvisorMark,
} from "@/components/sentiment/channel-marks";
import { DashboardReviewsDialog } from "@/components/sentiment/dashboard-reviews-dialog";
import { MentionRankCard } from "@/components/sentiment/mention-rank-card";
import { ReviewsMonthStrip } from "@/components/sentiment/reviews-month-strip";
import { RatingHistogram } from "@/components/sentiment/rating-histogram";
import { ScopedLink } from "@/components/layout/scoped-link";
import type {
  MonthReviewStats,
  NamedCount,
  ReviewPeriodInsights,
  StarLevel,
} from "@/lib/sentiment/review-insights";
import {
  reviewsAtStarLevel,
  reviewsMentioningMenuItem,
  reviewsMentioningName,
  reviewsWithTopic,
} from "@/lib/sentiment/review-insights";
import type {
  SentimentChannel,
  SentimentReplyTemplate,
  SentimentReview,
  SentimentReviewAction,
} from "@/lib/sentiment/types";
import { cn } from "@/lib/utils";

type FollowUpLists = {
  unreplied: SentimentReview[];
  openActions: SentimentReview[];
  actionsByReviewId: Record<string, SentimentReviewAction>;
  canEdit: boolean;
  canEditActions: boolean;
  googleCanPost: boolean;
  venueName: string;
  templates: SentimentReplyTemplate[];
};

const METRIC_TAG_TONE = {
  brand:
    "border-[var(--venue-primary,#818a40)]/30 bg-[var(--venue-primary,#818a40)]/12 text-[#3D421F]",
  amber: "border-amber-300 bg-amber-100 text-amber-900",
  red: "border-red-300 bg-red-100 text-red-800",
} as const;

function MetricButton({
  label,
  value,
  hint,
  icon: Icon,
  onClick,
  href,
  tagTone = "brand",
}: {
  label: string;
  value: number;
  hint: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  onClick?: () => void;
  href?: string;
  tagTone?: keyof typeof METRIC_TAG_TONE;
}) {
  const className = cn(
    "rounded-xl border border-black/5 bg-white/60 shadow-sm backdrop-blur-xl",
    "flex h-full w-full items-center gap-3 px-4 py-3",
    "transition-[transform,box-shadow,border-color,background-color] duration-300",
    "hover:-translate-y-px hover:border-black/10 hover:bg-white/80",
    "hover:shadow-[0_10px_28px_rgba(61,66,31,0.08)]",
  );
  const body = (
    <>
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--venue-primary,#818a40)]/12 text-[var(--venue-primary,#818a40)]">
        <Icon className="h-7 w-7" strokeWidth={1.5} />
      </span>
      <span className="min-w-0 flex-1 text-center">
        <div className="flex items-center justify-center gap-2">
          <span
            className={cn(
              "inline-flex h-9 min-w-9 items-center justify-center rounded-full border px-2.5 font-google-sans text-2xl font-semibold leading-none tabular-nums",
              METRIC_TAG_TONE[tagTone],
            )}
          >
            {value}
          </span>
          <span className="text-xs font-semibold uppercase tracking-wide text-black/45">
            {label}
          </span>
        </div>
        <p className="mt-0.5 text-sm leading-snug text-black/50">{hint}</p>
      </span>
    </>
  );
  if (href) {
    return (
      <ScopedLink href={href} className={className}>
        {body}
      </ScopedLink>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {body}
    </button>
  );
}

type RatingMetric = {
  label: string;
  hintAfter: string;
  emptyHint: string;
  rating: number | null;
  count: number;
  href: string;
  channel?: SentimentChannel;
};

type VenueBrand = {
  slug: string;
  name: string;
  isGlobal: boolean;
  primaryColor: string;
  logoUrl: string | null;
  iconUrl: string | null;
  faviconUrl: string | null;
};

function ChannelIcon({
  channel,
  venue,
}: {
  channel?: SentimentChannel;
  venue: VenueBrand;
}) {
  if (channel === "google") {
    return <GoogleMark className="h-6 w-6" />;
  }
  if (channel === "tripadvisor") {
    return <TripAdvisorMark className="h-6 w-6" />;
  }
  if (channel === "guest") {
    return <GuestMark className="h-6 w-6" />;
  }
  return (
    <VenueBrandIcon
      slug={venue.slug}
      name={venue.name}
      isGlobal={venue.isGlobal}
      primaryColor={venue.primaryColor}
      logoUrl={venue.logoUrl}
      iconUrl={venue.iconUrl}
      faviconUrl={venue.faviconUrl}
      variant="mark"
      className="h-5 w-5 shrink-0 object-contain"
      title={venue.name}
    />
  );
}

function RatingCard({
  metric,
  venue,
}: {
  metric: RatingMetric;
  venue: VenueBrand;
}) {
  const venueRate = !metric.channel;
  return (
    <ScopedLink
      href={metric.href}
      className={cn(
        "group/rating flex h-full flex-col items-center justify-center p-5 text-center",
        "rounded-xl border border-black/5 shadow-sm backdrop-blur-xl",
        "transition-[transform,box-shadow,border-color,background-color] duration-500 ease-out",
        "hover:-translate-y-px hover:border-black/10",
        "hover:shadow-[0_10px_28px_rgba(61,66,31,0.08)]",
        venueRate
          ? "bg-black/[0.07] hover:bg-black/[0.1]"
          : "bg-white/60 hover:bg-white/80",
      )}
    >
      <p className="flex items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-black/45">
        <ChannelIcon channel={metric.channel} venue={venue} />
        {metric.label}
      </p>
      <div className="mt-2 flex items-center justify-center gap-2">
        <AnimatedRatingStars rating={metric.rating} />
        {metric.rating != null ? (
          <span className="font-google-sans text-2xl font-semibold tabular-nums leading-none text-[#3D421F]">
            {metric.rating.toFixed(1)}
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-black/50">
        {metric.count > 0 ? (
          <>
            across{" "}
            <span className="tabular-nums font-medium text-[#3D421F] underline decoration-black/30 underline-offset-2">
              {metric.count}
            </span>{" "}
            {metric.hintAfter}
          </>
        ) : (
          metric.emptyHint
        )}
      </p>
    </ScopedLink>
  );
}

function HistogramCard({
  label,
  insights,
  href,
  reviews,
  followUp,
}: {
  label: string;
  insights: ReviewPeriodInsights;
  href: string;
  reviews: SentimentReview[];
  followUp: FollowUpLists;
}) {
  const [star, setStar] = useState<StarLevel | null>(null);
  const list = star ? reviewsAtStarLevel(reviews, star) : [];

  return (
    <>
      <Card className="flex h-full flex-col p-5">
        <p className="text-center text-xs font-semibold uppercase tracking-wide text-black/45">
          {label}
        </p>
        <RatingHistogram
          className="mt-3 flex-1"
          averageRating={insights.averageRating}
          starCounts={insights.starCounts}
          total={insights.total}
          href={href}
          onSelectStar={setStar}
        />
      </Card>
      <DashboardReviewsDialog
        open={star != null}
        title={`${star ?? ""}-star reviews`}
        description={`${star}-star reviews · ${label}`}
        empty="No reviews at this rating."
        footerHref={href}
        footerLabel="Open reviews"
        reviews={list}
        actionsByReviewId={followUp.actionsByReviewId}
        canEdit={followUp.canEdit}
        canEditActions={followUp.canEditActions}
        googleCanPost={followUp.googleCanPost}
        venueName={followUp.venueName}
        templates={followUp.templates}
        compactAction
        onClose={() => setStar(null)}
      />
    </>
  );
}

export function SentimentDashboardMetrics({
  venue,
  ratings,
  followUp,
  overall,
  overallReviews,
  thisMonth,
  thisMonthReviews,
  topicCounts,
  menuItemMentions,
  staffMentions,
  monthStrip,
  selectedMonthKey,
}: {
  venue: VenueBrand;
  ratings: RatingMetric[];
  followUp: FollowUpLists;
  overall: ReviewPeriodInsights;
  overallReviews: SentimentReview[];
  thisMonth: ReviewPeriodInsights;
  thisMonthReviews: SentimentReview[];
  topicCounts: NamedCount[];
  menuItemMentions: NamedCount[];
  staffMentions: NamedCount[];
  monthStrip: MonthReviewStats[];
  selectedMonthKey: string;
}) {
  const [dialog, setDialog] = useState<"awaiting" | "actions" | null>(null);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ratings.map((metric) => (
          <RatingCard key={metric.label} metric={metric} venue={venue} />
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <HistogramCard
          label="Venue Overall Rates"
          insights={overall}
          href="/sentiment/reviews?period=all"
          reviews={overallReviews}
          followUp={followUp}
        />
        <HistogramCard
          label="This month"
          insights={thisMonth}
          href={`/sentiment/reviews?period=month&month=${selectedMonthKey}`}
          reviews={thisMonthReviews}
          followUp={followUp}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <MetricButton
          label="Calendar"
          value={thisMonth.total}
          hint="Reviews by posted date this month"
          icon={CalendarDays}
          href={`/sentiment/calendar?month=${selectedMonthKey}`}
        />
        <MetricButton
          label="Awaiting reply"
          value={followUp.unreplied.length}
          hint="Written reviews without an owner reply yet"
          icon={MessageSquare}
          tagTone="amber"
          onClick={() => setDialog("awaiting")}
        />
        <MetricButton
          label="Open actions"
          value={followUp.openActions.length}
          hint="1–3 star reviews or follow-ups still in progress"
          icon={ClipboardList}
          tagTone="red"
          onClick={() => setDialog("actions")}
        />
      </div>
      <ReviewsMonthStrip
        items={monthStrip}
        selectedMonthKey={selectedMonthKey}
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <MentionRankCard
          title="Most used tags"
          items={topicCounts}
          empty="No topic tags in these reviews yet."
          resolveReviews={(key) => reviewsWithTopic(overallReviews, key)}
          followUp={followUp}
          footerHref="/sentiment/reviews?period=all"
        />
        <MentionRankCard
          title="Menu items mentioned"
          items={menuItemMentions}
          empty="No menu items found in these reviews yet."
          resolveReviews={(key) =>
            reviewsMentioningMenuItem(overallReviews, key)
          }
          followUp={followUp}
          footerHref="/sentiment/reviews?period=all"
        />
        <MentionRankCard
          title="Staff mentioned"
          items={staffMentions}
          empty="No waiter or staff names found in reviews."
          resolveReviews={(_key, label) =>
            reviewsMentioningName(overallReviews, label)
          }
          followUp={followUp}
          footerHref="/sentiment/reviews?period=all"
        />
      </div>
      <DashboardReviewsDialog
        open={dialog === "awaiting"}
        title="Awaiting reply"
        description="Written reviews that still need an owner reply."
        empty="Every written review has a reply."
        footerHref="/sentiment/reviews?period=all"
        footerLabel="Open all reviews"
        reviews={followUp.unreplied}
        actionsByReviewId={followUp.actionsByReviewId}
        canEdit={followUp.canEdit}
        canEditActions={followUp.canEditActions}
        googleCanPost={followUp.googleCanPost}
        venueName={followUp.venueName}
        templates={followUp.templates}
        compactAction
        onClose={() => setDialog(null)}
      />
      <DashboardReviewsDialog
        open={dialog === "actions"}
        title="Open actions"
        description="1–3 star reviews or follow-ups still in progress."
        empty="No open follow-ups right now."
        footerHref="/sentiment/actions"
        footerLabel="Open Actions"
        reviews={followUp.openActions}
        actionsByReviewId={followUp.actionsByReviewId}
        canEdit={followUp.canEdit}
        canEditActions={followUp.canEditActions}
        googleCanPost={followUp.googleCanPost}
        venueName={followUp.venueName}
        templates={followUp.templates}
        compactAction
        onClose={() => setDialog(null)}
      />
    </div>
  );
}
