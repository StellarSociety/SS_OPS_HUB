import { formatLeaveDays } from "@/lib/hr/leave";
import { cn } from "@/lib/utils";

type LeaveBalanceRingProps = {
  label: string;
  code?: string;
  /** Days still available to take. */
  available: number;
  /** Days already taken. */
  used: number;
  /** Full entitlement / allowance pool (eligible). */
  total?: number;
  size?: number;
  className?: string;
  /** Optional hint under the used line (e.g. “Click to expand”). */
  hint?: string;
  onClick?: () => void;
  expanded?: boolean;
};

const TAKEN = "#3D421F";
const LEFT = "var(--venue-primary, #818a40)";
const TRACK = "var(--venue-secondary, #F0F3DD)";

/**
 * Leave-type card: remaining days first, then a stacked taken/left bar.
 */
export function LeaveBalanceRing({
  label,
  code,
  available,
  used,
  total,
  className,
  hint,
  onClick,
  expanded,
}: LeaveBalanceRingProps) {
  // Bar widths cannot be negative; displayed leftover can (overdrawn).
  const barAvailable = Math.max(0, available);
  const barUsed = Math.max(0, used);
  const eligible =
    total != null && Number.isFinite(total)
      ? Math.max(0, total)
      : Math.max(0, barAvailable + barUsed);
  const denom = Math.max(eligible, 0.0001);

  const usedRatio = Math.min(1, Math.max(0, barUsed / denom));
  const leftRatio = Math.min(
    1 - usedRatio,
    Math.max(0, barAvailable / denom),
  );
  const otherRatio = Math.max(0, 1 - usedRatio - leftRatio);
  const overdrawn = available < 0;
  const depleted = !overdrawn && available <= 0 && eligible > 0;

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {code ? (
            <p className="inline-flex rounded-md bg-[#3D421F] px-1.5 py-0.5 font-mono text-[11px] font-semibold tracking-wide text-[var(--venue-secondary,#F0F3DD)]">
              {code}
            </p>
          ) : null}
          <p className="mt-1.5 text-sm font-semibold leading-snug text-[#3D421F]">
            {label}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p
            className={cn(
              "text-[2rem] font-semibold leading-none tabular-nums tracking-tight",
              overdrawn
                ? "text-red-700"
                : depleted
                  ? "text-[#3D421F]/55"
                  : "text-[var(--venue-primary,#818a40)]",
            )}
          >
            {formatDays(available)}
          </p>
          <p
            className={cn(
              "mt-1 text-[11px] font-semibold uppercase tracking-wider",
              overdrawn
                ? "text-red-700"
                : depleted
                  ? "text-[#3D421F]/45"
                  : "text-[var(--venue-primary,#818a40)]",
            )}
          >
            days left
          </p>
        </div>
      </div>

      <div
        className="mt-4 h-2.5 w-full overflow-hidden rounded-full"
        style={{ backgroundColor: TRACK }}
        role="img"
        aria-label={`${formatDays(barUsed)} taken, ${formatDays(available)} left of ${formatDays(eligible)} eligible`}
      >
        <div className="flex h-full w-full">
          {usedRatio > 0 ? (
            <div
              className="h-full min-w-0"
              style={{ width: `${usedRatio * 100}%`, backgroundColor: TAKEN }}
            />
          ) : null}
          {leftRatio > 0 ? (
            <div
              className="h-full min-w-0"
              style={{ width: `${leftRatio * 100}%`, backgroundColor: LEFT }}
            />
          ) : null}
          {otherRatio > 0.004 ? (
            <div
              className="h-full min-w-0 bg-[#3D421F]/25"
              style={{ width: `${otherRatio * 100}%` }}
            />
          ) : null}
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-left">
        <Stat
          swatch={TRACK}
          swatchBorder
          label="Eligible"
          value={formatDays(eligible)}
          tone="muted"
        />
        <Stat
          swatch={LEFT}
          label="Left"
          value={formatDays(available)}
          tone={overdrawn ? "negative" : "accent"}
        />
        <Stat
          swatch={TAKEN}
          label="Taken"
          value={formatDays(barUsed)}
          tone="ink"
        />
      </dl>

      {hint ? (
        <p className="mt-3 text-[12px] font-medium text-[var(--venue-primary,#818a40)] underline-offset-2 group-hover:underline">
          {hint}
        </p>
      ) : null}
    </>
  );

  const shellClass = cn(
    "group w-full rounded-xl border border-black/10 bg-white p-4 text-left shadow-sm",
    onClick &&
      "cursor-pointer transition hover:border-[var(--venue-primary,#818a40)]/40 hover:bg-[var(--venue-secondary,#F0F3DD)]/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--venue-primary,#818a40)]/40",
    expanded &&
      "border-[var(--venue-primary,#818a40)]/50 bg-[var(--venue-secondary,#F0F3DD)]/50",
    className,
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-expanded={expanded}
        className={shellClass}
      >
        {body}
      </button>
    );
  }

  return <div className={shellClass}>{body}</div>;
}

function Stat({
  swatch,
  swatchBorder,
  label,
  value,
  tone,
}: {
  swatch: string;
  swatchBorder?: boolean;
  label: string;
  value: string;
  tone: "ink" | "accent" | "muted" | "negative";
}) {
  return (
    <div className="min-w-0">
      <dt
        className={cn(
          "flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider",
          tone === "ink" && "text-[#3D421F]",
          tone === "accent" && "text-[var(--venue-primary,#818a40)]",
          tone === "muted" && "text-black/45",
          tone === "negative" && "text-red-700",
        )}
      >
        <span
          className={cn(
            "inline-block h-2 w-2 shrink-0 rounded-full",
            swatchBorder && "ring-1 ring-black/15",
          )}
          style={{ backgroundColor: swatch }}
          aria-hidden
        />
        {label}
      </dt>
      <dd
        className={cn(
          "mt-0.5 text-base font-semibold tabular-nums",
          tone === "ink" && "text-[#3D421F]",
          tone === "accent" && "text-[var(--venue-primary,#818a40)]",
          tone === "muted" && "text-black/55",
          tone === "negative" && "text-red-700",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function formatDays(n: number): string {
  return formatLeaveDays(n);
}
