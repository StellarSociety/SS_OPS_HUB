import { cn } from "@/lib/utils";

type RefreshSpinnerProps = {
  /** 0–1 pull progress. Ignored while spinning. */
  progress?: number;
  spinning?: boolean;
  size?: number;
  className?: string;
};

const RADIUS = 10;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function RefreshSpinner({
  progress = 0.72,
  spinning = false,
  size = 22,
  className,
}: RefreshSpinnerProps) {
  const amount = Math.max(0, Math.min(1, progress));
  const dash = spinning ? CIRCUMFERENCE * 0.32 : CIRCUMFERENCE * Math.max(0.08, amount);
  const rotate = spinning ? undefined : amount * 300 - 90;

  return (
    <span
      className={cn("inline-flex", spinning && "ss-refresh-spin", className)}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        aria-hidden
        style={rotate == null ? undefined : { transform: `rotate(${rotate}deg)` }}
      >
        <circle
          cx="12"
          cy="12"
          r={RADIUS}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.2"
          strokeWidth="2.4"
        />
        <circle
          cx="12"
          cy="12"
          r={RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${CIRCUMFERENCE}`}
        />
      </svg>
    </span>
  );
}
