import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { getDashboardWidgets } from "@/lib/modules-registry";
import { hasPermission, isAppAdmin } from "@/lib/role-permissions";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_VENUE_COOKIE } from "@/lib/constants";
export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const cookieStore = await cookies();
  const slug = cookieStore.get(ACTIVE_VENUE_COOKIE)?.value;
  if (!slug) redirect("/select-venue");

  const { data: venue } = await supabase
    .from("venues")
    .select("*")
    .eq("slug", slug)
    .single();
  if (!venue) redirect("/select-venue");

  const { data: permissions } = await supabase
    .from("user_permissions")
    .select("*")
    .eq("user_id", user.id);

  const perms = permissions ?? [];
  const isGlobal = venue.is_global;

  const widgets = getDashboardWidgets().filter((w) => {
    if (isGlobal && w.scope === "venue") return false;
    if (!isGlobal && w.scope === "global") return false;
    if (isAppAdmin(perms)) return true;
    return hasPermission(
      perms,
      w.requiredFeature.moduleKey,
      w.requiredFeature.featureKey,
      w.requiredFeature.minLevel ?? "view",
    );
  });

  const loaded = await Promise.all(
    widgets.map(async (w) => {
      const Component = await w.load();
      return { key: w.key, Component };
    }),
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-serif text-3xl text-[#3D421F]">Dashboards</h1>
        <p className="mt-1 text-sm text-black/60">
          {isGlobal
            ? "Consolidated view across all venues."
            : `${venue.name} — venue overview.`}
        </p>
      </div>

      {loaded.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="font-serif text-xl text-[#3D421F]">No widgets yet</p>
          <p className="mt-2 text-sm text-black/50">
            Modules you have access to will register dashboard widgets here.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {loaded.map(({ key, Component }) => (
            <Component
              key={key}
              venueId={venue.id}
              isGlobalVenue={isGlobal}
            />
          ))}
        </div>
      )}

      <Card className="p-5">
        <p className="text-sm text-black/60">
          Open{" "}
          <Link href="/modules" className="text-[#3D421F] underline">
            Modules
          </Link>{" "}
          to access operational workflows, or{" "}
          <Link href="/hr" className="text-[#3D421F] underline">
            Human Resources
          </Link>{" "}
          for the full staff directory and expiry list.
        </p>
      </Card>
    </div>
  );
}
