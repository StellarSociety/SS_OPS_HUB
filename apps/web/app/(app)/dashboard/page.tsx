import { Card } from "@/components/ui/card";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ venue?: string }>;
}) {
  const { venue } = await searchParams;
  const isGlobal = venue === "global";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-serif text-3xl text-[#3D421F]">Dashboards</h1>
        <p className="mt-1 text-sm text-black/60">
          {isGlobal
            ? "Consolidated view across all venues — modules will plug in here."
            : "Venue overview — module widgets will appear here."}
        </p>
      </div>
      <Card className="p-8 text-center">
        <p className="font-serif text-xl text-[#3D421F]">No dashboards yet</p>
        <p className="mt-2 text-sm text-black/50">
          Operational modules will register dashboard widgets via the modules
          registry.
        </p>
      </Card>
    </div>
  );
}
