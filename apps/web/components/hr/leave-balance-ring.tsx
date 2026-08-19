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
  const safeAvailable = Math.max(0, available);
  const safeUsed = Math.max(0, used);
  const eligible =
    total != null && total > 0
      ? Math.max(0, total)
      : Math.max(0, safeAvailable + safeUsed);
  const denom = Math.max(eligible, 0.0001);

  const usedRatio = Math.min(1, Math.max(0, safeUsed / denom));
  const leftRatio = Math.min(
    1 - usedRatio,
    Math.max(0, safeAvailable / denom),
  );
  const otherRatio = Math.max(0, 1 - usedRatio - leftRatio);
  const depleted = safeAvailable <= 0 && eligible > 0;

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
              depleted
                ? "text-[#3D421F]/55"
                : "text-[var(--venue-primary,#818a40)]",
            )}
          >
            {formatDays(safeAvailable)}
          </p>
          <p
            className={cn(
              "mt-1 text-[11px] font-semibold uppercase tracking-wider",
              depleted
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
        aria-label={`${formatDays(safeUsed)} taken, ${formatDays(safeAvailable)} left of ${formatDays(eligible)} eligible`}
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
          value={formatDays(safeAvailable)}
          tone="accent"
        />
        <Stat
          swatch={TAKEN}
          label="Taken"
          value={formatDays(safeUsed)}
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
  tone: "ink" | "accent" | "muted";
}) {
  return (
    <div className="min-w-0">
      <dt
        className={cn(
          "flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider",
          tone === "ink" && "text-[#3D421F]",
          tone === "accent" && "text-[var(--venue-primary,#818a40)]",
          tone === "muted" && "text-black/45",
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
