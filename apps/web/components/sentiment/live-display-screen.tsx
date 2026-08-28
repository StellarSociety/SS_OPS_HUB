import {
  BarChart3,
  MessageCircle,
  Smartphone,
  Star,
} from "lucide-react";
import {
  GoogleMark,
  TripAdvisorMark,
} from "@/components/sentiment/channel-marks";
import { GoogleStars } from "@/components/sentiment/google-stars";
import { LiveDisplayAtmosphere } from "@/components/sentiment/live-display-atmosphere";
import type {
  LiveDisplayChannelCard,
  LiveDisplayListingStats,
  LiveDisplayView,
} from "@/lib/sentiment/live-display/types";
import { handwritten } from "@/lib/fonts";
import { cn } from "@/lib/utils";

const INK = "#3D421F";

function formatRating(rating: number | null): string {
  if (rating == null) return "—";
  return rating.toFixed(1);
}

function formatCount(count: number): string {
  return count.toLocaleString("en-US");
}

export function LiveDisplayScreen({ view }: { view: LiveDisplayView }) {
  return (
    <div
      className="relative flex h-full min-h-0 w-full flex-col overflow-hidden text-[#3D421F]"
      style={{
        containerType: "size",
        containerName: "live",
        padding:
          "clamp(1.65rem, 4.4cqh, 3.15rem) clamp(0.9rem, 3cqi, 2.5rem) clamp(0.55rem, 1.5cqh, 1.75rem)",
      }}
    >
      <LiveDisplayAtmosphere />
      <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Header view={view} />

        <div className="mt-[clamp(0.95rem,2.6cqh,1.85rem)] grid min-h-0 min-w-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] items-stretch gap-[clamp(0.7rem,2cqi,2rem)] @[900px]/live:grid-cols-[minmax(0,0.92fr)_minmax(0,1.22fr)] @[900px]/live:grid-rows-1">
          <HeroColumn google={view.google} tripadvisor={view.tripadvisor} />
          <ShareColumn channels={view.channels} />
        </div>

        <StatsBar view={view} />

        <footer className="mt-[clamp(0.55rem,1.6cqh,0.95rem)] flex shrink-0 flex-col items-center gap-0.5">
          <OliveBranch />
          <p className="text-[clamp(8px,1.15cqi,10px)] font-semibold uppercase tracking-[0.32em] text-[#3D421F]/55">
            Thank you for dining with us
          </p>
          <p className="text-[clamp(7px,1cqi,9px)] font-semibold uppercase tracking-[0.28em] text-[#3D421F]/40">
            Stellar Society Group
          </p>
        </footer>
      </div>
    </div>
  );
}

function Header({ view }: { view: LiveDisplayView }) {
  return (
    <header className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2">
      <span aria-hidden />
      <div className="flex min-w-0 flex-col items-center text-center">
        {view.venueLogoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={view.venueLogoUrl}
            alt={view.venueName}
            className="h-[clamp(3.15rem,10cqh,5.75rem)] w-auto max-w-[min(26rem,56cqi)] object-contain"
          />
        ) : (
          <h1 className="font-serif text-[clamp(1.15rem,3.2cqi,2rem)] font-medium leading-none tracking-[0.18em] text-[#3D421F]">
            {view.venueName.toUpperCase()}
          </h1>
        )}
        {view.venueTagline ? (
          <p className="mt-1.5 whitespace-pre-line text-[clamp(8px,1.15cqi,10px)] font-medium uppercase leading-snug tracking-[0.22em] text-[#3D421F]/55">
            {view.venueTagline}
          </p>
        ) : null}
      </div>
      <div className="flex items-start justify-end gap-2 pt-0.5">
        <span className="min-w-0 text-right">
          <span className="block text-[clamp(8px,1.15cqi,10px)] font-semibold uppercase tracking-[0.18em] text-[#3D421F]">
            Live rating
          </span>
          <span className="block text-[clamp(7px,1cqi,9px)] font-medium uppercase tracking-[0.16em] text-[#3D421F]/45">
            {view.updatedLabel}
          </span>
        </span>
        <span className="relative mt-1 flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
      </div>
    </header>
  );
}

function HeroColumn({
  google,
  tripadvisor,
}: {
  google: LiveDisplayListingStats;
  tripadvisor: LiveDisplayListingStats;
}) {
  const showTripadvisor =
    tripadvisor.reviewCount > 0 || tripadvisor.rating != null;
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col justify-start">
      <div className="flex w-fit flex-col items-start self-start">
        <h2 className="whitespace-nowrap font-serif text-[clamp(1.35rem,3.8cqi,2.15rem)] leading-none tracking-tight text-[#3D421F]">
          Loved your experience?
        </h2>
        <div className="mt-[clamp(0.5rem,1.4cqh,1rem)] h-px w-full bg-[#C4A35A]" />
        <p className="mt-[clamp(0.5rem,1.4cqh,1rem)] max-w-[22rem] text-left text-[clamp(9px,1.25cqi,11px)] font-medium uppercase leading-relaxed tracking-[0.16em] text-[#3D421F]/55">
          Share your experience and help us keep getting better.
        </p>
      </div>
      <div className="mt-[clamp(0.95rem,2.7cqh,2.35rem)] flex w-fit items-center justify-center gap-5 self-center">
        <p className="font-serif text-[clamp(3.85rem,12.5cqh,7.25rem)] font-medium leading-none tabular-nums tracking-tight">
          {formatRating(google.rating)}
        </p>
        <div className="min-w-0 text-left">
          <div className="@[900px]/live:hidden">
            <GoogleStars rating={google.rating} size="2xl" pulse />
          </div>
          <div className="hidden @[900px]/live:block">
            <GoogleStars rating={google.rating} size="3xl" pulse />
          </div>
          <p className="mt-2 text-[clamp(12px,1.75cqi,16px)] font-semibold uppercase tracking-[0.16em] text-[#3D421F]/50">
            {formatCount(google.reviewCount)} Google reviews
          </p>
          {showTripadvisor ? (
            <p className="mt-1 text-[clamp(12px,1.75cqi,16px)] font-semibold uppercase tracking-[0.16em] text-[#3D421F]/50">
              {formatCount(tripadvisor.reviewCount)} Tripadvisor reviews
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ShareColumn({ channels }: { channels: LiveDisplayChannelCard[] }) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col justify-start">
      {channels.length > 0 ? (
        <div
          className={cn(
            "ml-auto inline-grid max-w-full justify-items-stretch gap-x-3 gap-y-[clamp(0.2rem,0.55cqh,0.4rem)] @[900px]/live:gap-x-4",
            channels.length > 1
              ? "grid-cols-[repeat(2,10.75rem)]"
              : "grid-cols-[10.75rem]",
          )}
        >
          <div className="col-span-full flex min-w-0 items-center gap-3">
            <span className="h-px min-w-0 flex-1 bg-[#3D421F]/15" />
            <p className="whitespace-nowrap text-[clamp(9px,1.25cqi,11px)] font-semibold uppercase tracking-[0.22em] text-[#3D421F]/60">
              Share your experience
            </p>
            <span className="h-px min-w-0 flex-1 bg-[#3D421F]/15" />
          </div>
          {channels.map((channel) => (
            <ChannelCard key={channel.key} channel={channel} />
          ))}
          <div className="col-span-full mt-[clamp(0.15rem,0.5cqh,0.35rem)] flex flex-col items-center">
            <ScanArrow />
            <p
              className={cn(
                handwritten.className,
                "whitespace-nowrap px-1 py-[0.15em] text-[clamp(1.7rem,5.4cqi,2.35rem)] leading-tight text-[#3D421F]",
              )}
            >
              Scan to review us
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-[clamp(0.2rem,0.55cqh,0.4rem)] flex shrink-0 items-center gap-3">
            <span className="h-px flex-1 bg-[#3D421F]/15" />
            <p className="text-[clamp(9px,1.25cqi,11px)] font-semibold uppercase tracking-[0.22em] text-[#3D421F]/60">
              Share your experience
            </p>
            <span className="h-px flex-1 bg-[#3D421F]/15" />
          </div>
          <p className="text-sm text-[#3D421F]/50">
            Connect Google or Tripadvisor in Sentiment settings to show review QR
            codes here.
          </p>
        </>
      )}
    </div>
  );
}

function ChannelCard({ channel }: { channel: LiveDisplayChannelCard }) {
  const Mark = channel.key === "google" ? GoogleMark : TripAdvisorMark;
  return (
    <article className="flex min-h-0 min-w-0 w-full flex-col overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-[0_14px_36px_rgba(61,66,31,0.08)]">
      <div className="flex min-w-0 flex-col px-[clamp(0.65rem,1.6cqi,1rem)] pb-2 pt-[clamp(0.55rem,1.2cqh,0.85rem)]">
        <div className="flex shrink-0 items-center justify-center gap-2">
          <Mark className="h-5 w-5 shrink-0 @[900px]/live:h-6 @[900px]/live:w-6" />
          <p className="truncate text-[clamp(0.75rem,1.7cqi,0.875rem)] font-semibold tracking-wide text-[#3D421F]">
            {channel.label}
          </p>
        </div>
        {channel.qrSvg ? (
          <div
            className="mx-auto mt-2.5 aspect-square w-[min(100%,clamp(6.25rem,32cqi,8.5rem))] [&_svg]:block [&_svg]:h-full [&_svg]:w-full"
            role="img"
            aria-label={`${channel.label} review QR code`}
            dangerouslySetInnerHTML={{ __html: channel.qrSvg }}
          />
        ) : (
          <div className="mt-2.5 flex aspect-square w-full max-w-[8.5rem] items-center justify-center self-center text-center text-xs text-[#3D421F]/40">
            QR unavailable
          </div>
        )}
      </div>
      <div
        className="flex shrink-0 items-center justify-center gap-1.5 px-2 py-[clamp(0.4rem,1cqh,0.65rem)] text-center text-[clamp(7px,1.05cqi,9px)] font-semibold uppercase leading-tight tracking-[0.12em] text-[#F0F3DD]"
        style={{ backgroundColor: INK }}
      >
        <Smartphone className="h-3 w-3 shrink-0 @[900px]/live:h-3.5 @[900px]/live:w-3.5" strokeWidth={2} />
        <span className="min-w-0">{channel.cta}</span>
      </div>
    </article>
  );
}

function ScanArrow() {
  return (
    <svg
      viewBox="0 0 48 34"
      className="mb-0.5 h-[clamp(1.2rem,3.6cqh,1.75rem)] w-[clamp(1.7rem,4.6cqi,2.25rem)] text-[#3D421F]"
      aria-hidden
      fill="none"
    >
      <path
        d="M22 32c1.2-7.5 2.4-15.2 7.8-26"
        stroke="currentColor"
        strokeWidth="1.45"
        strokeLinecap="round"
      />
      <path
        d="M21.2 14.2c2.4-3.2 5.4-6.4 8.6-11.4 2.1 3.6 5.2 7.2 8.6 10.6"
        stroke="currentColor"
        strokeWidth="1.45"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StatsBar({ view }: { view: LiveDisplayView }) {
  return (
    <div className="-mt-[clamp(0.55rem,1.8cqh,1.15rem)] grid shrink-0 grid-cols-3 divide-x divide-[#3D421F]/10 border-y border-[#3D421F]/10 py-[clamp(0.45rem,1.3cqh,1rem)]">
      <StatCell
        icon={BarChart3}
        label="This month"
        value={formatRating(view.thisMonth.rating)}
        hint={`${formatCount(view.thisMonth.reviewCount)} reviews`}
      />
      <StatCell
        icon={Star}
        label="Overall rating"
        value={formatRating(view.overall.rating)}
        hint={`Across ${formatCount(view.overall.reviewCount)} reviews`}
      />
      <StatCell
        icon={MessageCircle}
        label="We value your feedback"
        hint="Every review helps us create better experiences."
      />
    </div>
  );
}

function StatCell({
  icon: Icon,
  label,
  value,
  hint,
  valueClassName,
}: {
  icon: typeof Star;
  label: string;
  value?: string;
  hint?: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col items-center px-[clamp(0.35rem,1.2cqi,0.75rem)] text-center">
      <span className="mb-[clamp(0.25rem,0.8cqh,0.5rem)] flex h-[clamp(1.7rem,4.6cqh,2.5rem)] w-[clamp(1.7rem,4.6cqh,2.5rem)] items-center justify-center rounded-full border border-[#3D421F]/55 bg-[#3D421F]/10 text-[#3D421F]">
        <Icon className="h-3.5 w-3.5 @[900px]/live:h-4 @[900px]/live:w-4" strokeWidth={2.2} />
      </span>
      <p className="text-[clamp(8px,1.1cqi,10px)] font-semibold uppercase tracking-[0.18em] text-[#3D421F]/50">
        {label}
      </p>
      {value ? (
        <p
          className={cn(
            "mt-0.5 font-serif text-[clamp(1.2rem,3.8cqh,1.85rem)] leading-none tabular-nums text-[#3D421F]",
            valueClassName,
          )}
        >
          {value}
        </p>
      ) : null}
      {hint ? (
        <p className="mt-0.5 max-w-[16rem] text-[clamp(8px,1.05cqi,10px)] font-medium uppercase leading-snug tracking-[0.12em] text-[#3D421F]/45">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function OliveBranch() {
  return (
    <svg
      viewBox="0 0 64 20"
      className="h-3.5 w-11 text-[#818a40] @[900px]/live:h-4 @[900px]/live:w-12"
      aria-hidden
      fill="none"
    >
      <path
        d="M4 12c8-1 14-1 28 0 12 1 20 1 28-1"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <ellipse
        cx="16"
        cy="7.5"
        rx="5"
        ry="2.6"
        transform="rotate(-28 16 7.5)"
        fill="currentColor"
      />
      <ellipse
        cx="26"
        cy="14.2"
        rx="5"
        ry="2.6"
        transform="rotate(24 26 14.2)"
        fill="currentColor"
      />
      <ellipse
        cx="38"
        cy="7.2"
        rx="5"
        ry="2.6"
        transform="rotate(-22 38 7.2)"
        fill="currentColor"
      />
      <ellipse
        cx="48"
        cy="14"
        rx="5"
        ry="2.6"
        transform="rotate(26 48 14)"
        fill="currentColor"
      />
    </svg>
  );
}
