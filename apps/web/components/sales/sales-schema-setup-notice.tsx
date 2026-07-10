import { Card } from "@/components/ui/card";

export function SalesSchemaSetupNotice() {
  return (
    <Card className="border-amber-200/80 bg-amber-50/80 p-6">
      <h2 className="font-serif text-xl text-[#3D421F]">
        Database setup required
      </h2>
      <p className="mt-2 text-sm text-black/70">
        The Daily Sales tables have not been applied to Supabase yet. Run this
        from the repo root:
      </p>
      <pre className="mt-4 overflow-x-auto rounded-lg border border-black/10 bg-white p-4 text-xs text-[#3D421F]">
        {`cd SS_OPS_APP_REPO\npnpm db:migrate`}
      </pre>
      <p className="mt-3 text-sm text-black/60">
        Migration file:{" "}
        <code className="text-xs">
          supabase/migrations/20260710200000_venue_daily_sales.sql
        </code>
      </p>
    </Card>
  );
}

function isMissingSalesTableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: string; message?: string };
  if (record.code === "PGRST205") return true;
  const message = record.message ?? "";
  return (
    message.includes("PGRST205") ||
    message.includes("Could not find the table")
  );
}

export function getSalesDataLoadErrorMessage(error: unknown): string | null {
  if (isMissingSalesTableError(error)) return "schema_missing";
  if (error instanceof Error && error.message.includes("PGRST205")) {
    return "schema_missing";
  }
  return null;
}
