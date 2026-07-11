export const CURRENT_BAR = "#3D421F";
export const PREVIOUS_BAR = "#B6BE6873";
export const TREND_BAR = "#6B7340";
export const TREND_LINE = "#C45C3E";

export function formatChartAxisMoney(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}k`;
  return String(Math.round(value));
}

export function formatBarLabel(value: number): string {
  if (!value) return "";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return Math.round(value).toLocaleString();
}

export function OverviewTooltipCard({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ label: string; value: string }>;
}) {
  return (
    <div className="rounded-md border border-black/10 bg-white px-3 py-2 text-xs shadow-sm">
      <p className="font-medium text-[#3D421F]">{title}</p>
      {rows.map((row) => (
        <p key={row.label} className="mt-0.5 tabular-nums text-black/70">
          {row.label}: {row.value}
        </p>
      ))}
    </div>
  );
}
