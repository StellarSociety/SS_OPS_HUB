import { Card } from "@/components/ui/card";

type Metric = {
  label: string;
  value: string;
  hint: string;
};

export function SentimentDashboardMetrics({ metrics }: { metrics: Metric[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {metrics.map((metric) => (
        <Card key={metric.label} className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-black/45">
            {metric.label}
          </p>
          <p className="mt-2 font-serif text-3xl text-[#3D421F]">{metric.value}</p>
          <p className="mt-1 text-sm text-black/50">{metric.hint}</p>
        </Card>
      ))}
    </div>
  );
}
