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

/**
 * Donut comparing entitlement (eligible) vs taken vs remaining.
 * Thick track = full allowance; coloured arcs = taken + left.
 */
export function LeaveBalanceRing({
  label,
  code,
  available,
  used,
  total,
  size = 128,
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

  const stroke = 16;
  const radius = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * radius;

  const usedLen = circumference * usedRatio;
  const leftLen = circumference * leftRatio;
  const otherLen = circumference * otherRatio;

  const body = (
    <>
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90"
          aria-hidden
        >
          {/* Full allowance track */}
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={stroke}
            className="text-black/[0.08]"
          />
          {/* Taken */}
          {usedLen > 0 ? (
            <circle
              cx={cx}
              cy={cy}
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth={stroke}
              strokeLinecap="butt"
              strokeDasharray={`${usedLen} ${circumference - usedLen}`}
              strokeDashoffset={0}
              className="text-[#a16207] transition-[stroke-dasharray] duration-500"
            />
          ) : null}
          {/* Remaining / left */}
          {leftLen > 0 ? (
            <circle
              cx={cx}
              cy={cy}
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth={stroke}
              strokeLinecap="butt"
              strokeDasharray={`${leftLen} ${circumference - leftLen}`}
              strokeDashoffset={-usedLen}
              className="text-[var(--venue-primary,#818a40)] transition-[stroke-dasharray,stroke-dashoffset] duration-500"
            />
          ) : null}
          {/* Held / other (scheduled, pending, expired) */}
          {otherLen > 0.5 ? (
            <circle
              cx={cx}
              cy={cy}
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth={stroke}
              strokeLinecap="butt"
              strokeDasharray={`${otherLen} ${circumference - otherLen}`}
              strokeDashoffset={-(usedLen + leftLen)}
              className="text-black/25 transition-[stroke-dasharray,stroke-dashoffset] duration-500"
            />
          ) : null}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center px-2">
          <span className="font-serif text-2xl leading-none tabular-nums text-[#3D421F]">
            {formatDays(safeAvailable)}
          </span>
          <span className="mt-0.5 text-[10px] uppercase tracking-wide text-black/45">
            left
          </span>
          <span className="mt-1 text-[11px] tabular-nums text-black/50">
            of {formatDays(eligible)}
          </span>
        </div>
      </div>

      <div className="w-full max-w-[11rem]">
        {code ? (
          <p className="font-mono text-[11px] text-black/45">{code}</p>
        ) : null}
        <p className="text-sm font-medium leading-snug text-[#3D421F]">
          {label}
        </p>
        <dl className="mt-2 space-y-1 text-left text-xs">
          <div className="flex items-center justify-between gap-2">
            <dt className="flex items-center gap-1.5 text-black/55">
              <span
                className="inline-block h-2 w-2 rounded-full bg-black/15"
                aria-hidden
              />
              Eligible
            </dt>
            <dd className="tabular-nums font-medium text-[#3D421F]">
              {formatDays(eligible)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="flex items-center gap-1.5 text-black/55">
              <span
                className="inline-block h-2 w-2 rounded-full bg-[#a16207]"
                aria-hidden
              />
              Taken
            </dt>
            <dd className="tabular-nums font-medium text-[#3D421F]">
              {formatDays(safeUsed)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="flex items-center gap-1.5 text-black/55">
              <span
                className="inline-block h-2 w-2 rounded-full bg-[var(--venue-primary,#818a40)]"
                aria-hidden
              />
              Left
            </dt>
            <dd className="tabular-nums font-medium text-[#3D421F]">
              {formatDays(safeAvailable)}
            </dd>
          </div>
        </dl>
        {hint ? (
          <p className="mt-2 text-center text-[11px] text-[var(--venue-primary,#818a40)]">
            {hint}
          </p>
        ) : null}
      </div>
    </>
  );

  const shellClass = cn(
    "flex w-[11.5rem] flex-col items-center gap-3 text-center",
    onClick &&
      "rounded-xl p-2 transition-colors hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--venue-primary,#818a40)]/40",
    expanded && "bg-black/[0.03]",
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

function formatDays(n: number): string {
  return String(Math.round(Number(n) || 0));
}
