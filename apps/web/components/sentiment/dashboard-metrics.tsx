"use client";

import { Card } from "@/components/ui/card";
import { VenueBrandIcon } from "@/components/brand/venue-brand-icon";
import { AnimatedRatingStars } from "@/components/sentiment/animated-rating-stars";
import {
  GoogleMark,
  TripAdvisorMark,
} from "@/components/sentiment/channel-marks";
import type { SentimentChannel } from "@/lib/sentiment/types";
import { cn } from "@/lib/utils";

type StatMetric = {
  label: string;
  value: string;
  hint: string;
};

type RatingMetric = {
  label: string;
  hint: string;
  rating: number | null;
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
    return <GoogleMark className="h-3.5 w-3.5" />;
  }
  if (channel === "tripadvisor") {
    return <TripAdvisorMark className="h-3.5 w-3.5" />;
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
  return (
    <Card
      className={cn(
        "group/rating flex h-full flex-col items-center justify-center p-5 text-center",
        "transition-[transform,box-shadow,border-color,background-color] duration-500 ease-out",
        "hover:-translate-y-px hover:border-black/10 hover:bg-white/80",
        "hover:shadow-[0_10px_28px_rgba(61,66,31,0.08)]",
      )}
    >
      <p className="flex items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-black/45">
        <ChannelIcon channel={metric.channel} venue={venue} />
        {metric.label}
      </p>
      <AnimatedRatingStars rating={metric.rating} className="mt-2" />
      <p className="mt-1 text-sm text-black/50">
        {metric.rating != null ? (
          <>
            <span className="font-serif text-[15px] font-semibold uppercase tracking-wide text-[#3D421F]">
              {metric.rating.toFixed(1)}
            </span>{" "}
            {metric.hint}
          </>
        ) : (
          metric.hint
        )}
      </p>
    </Card>
  );
}

export function SentimentDashboardMetrics({
  venue,
  ratings,
  metrics,
}: {
  venue: VenueBrand;
  ratings: RatingMetric[];
  metrics: StatMetric[];
}) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ratings.map((metric) => (
          <RatingCard key={metric.label} metric={metric} venue={venue} />
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {metrics.map((metric) => (
          <Card
            key={metric.label}
            className="flex h-full flex-col items-center justify-center p-5 text-center"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-black/45">
              {metric.label}
            </p>
            <p className="mt-2 font-serif text-3xl text-[#3D421F]">
              {metric.value}
            </p>
            <p className="mt-1 text-sm text-black/50">{metric.hint}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
