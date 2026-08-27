import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type GuestsIntelDashboardMetricsProps = {
  guestsTotal: number;
  guestsThisMonth: number;
  issuedOpen: number;
  redeemed: number;
};

export function GuestsIntelDashboardMetrics({
  guestsTotal,
  guestsThisMonth,
  issuedOpen,
  redeemed,
}: GuestsIntelDashboardMetricsProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <MetricCard label="Guests" value={String(guestsTotal)} hint="Profiles collected" />
      <MetricCard
        label="This month"
        value={String(guestsThisMonth)}
        hint="New guests this calendar month"
      />
      <MetricCard
        label="Open passes"
        value={String(issuedOpen)}
        hint="Ready to redeem"
        tone={issuedOpen > 0 ? "ok" : "neutral"}
      />
      <MetricCard
        label="Redeemed"
        value={String(redeemed)}
        hint="Passes already used"
      />
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "neutral" | "ok";
}) {
  return (
    <Card
      className={cn(
        "flex h-full flex-col items-center justify-center p-5 text-center",
        "transition-[transform,box-shadow,border-color,background-color] duration-500 ease-out",
        "hover:-translate-y-px hover:border-black/10 hover:bg-white/80",
        "hover:shadow-[0_10px_28px_rgba(61,66,31,0.08)]",
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-black/45">
        {label}
      </p>
      <p
        className={cn(
          "mt-2 font-serif text-3xl font-semibold text-[#3D421F]",
          tone === "ok" && "text-[var(--venue-primary,#818a40)]",
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-sm text-black/50">{hint}</p>
    </Card>
  );
}
