import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { ModulesGrid } from "@/components/modules/modules-grid";
import { canAccessModule } from "@/lib/module-access";
import {
  getModuleOverviewItems,
  isModuleEnabledForVenue,
} from "@/lib/modules-registry";
import { isAppAdmin } from "@/lib/role-permissions";
import { ACTIVE_VENUE_COOKIE } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";

export default async function ModulesPage() {
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

  const [{ data: permissions }, { data: venueModules }] = await Promise.all([
    supabase.from("user_permissions").select("*").eq("user_id", user.id),
    supabase.from("venue_modules").select("*").eq("venue_id", venue.id),
  ]);

  const perms = permissions ?? [];
  const admin = isAppAdmin(perms);
  const venueModuleRows = venueModules ?? [];

  const visible = getModuleOverviewItems().filter((mod) => {
    if (admin) return true;
    if (!isModuleEnabledForVenue(venueModuleRows, mod.key)) return false;
    return canAccessModule(perms, mod.key, venue.id);
  });

  const gridItems = visible.map((mod) => {
    const venueEnabled = isModuleEnabledForVenue(venueModuleRows, mod.key);
    return {
      ...mod,
      clickable:
        mod.status === "live" &&
        Boolean(mod.href) &&
        venueEnabled &&
        (admin || canAccessModule(perms, mod.key, venue.id)),
    };
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="font-serif text-3xl text-[#3D421F]">Modules</h1>
        <p className="mt-1 text-sm text-black/60">
          {venue.is_global
            ? "Consolidated view — operational apps across all venues."
            : `${venue.name} — choose a workflow to open.`}
        </p>
        {venue.is_global ? (
          <p className="mt-2 inline-flex items-center rounded-full border border-[var(--venue-primary)]/25 bg-[var(--venue-primary)]/10 px-3 py-1 text-xs font-medium text-[#3D421F]">
            Consolidated
          </p>
        ) : null}
      </div>

      {gridItems.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="font-serif text-xl text-[#3D421F]">
            No modules available
          </p>
          <p className="mt-2 text-sm text-black/50">
            None of the operational modules are enabled for this venue, or you
            do not have access yet. Contact an administrator.
          </p>
        </Card>
      ) : (
        <ModulesGrid modules={gridItems} />
      )}
    </div>
  );
}
