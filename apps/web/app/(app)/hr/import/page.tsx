import { redirect } from "next/navigation";
import { ImportStaffForm } from "@/components/hr/import-staff";
import { ModulePageTitle } from "@/components/layout/module-page-title";
import { canEditStaff } from "@/lib/hr/permissions";
import { createClient } from "@/lib/supabase/server";
import { resolveActiveVenue } from "@/lib/venue/active-venue";

export default async function HrImportPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const venue = await resolveActiveVenue(supabase);
  if (!venue) redirect("/select-venue");

  const { data: permissions } = await supabase
    .from("user_permissions")
    .select("*")
    .eq("user_id", user.id);

  if (!canEditStaff(permissions ?? [], venue.id)) {
    return (
      <div className="mx-auto max-w-4xl">
        <p className="text-sm text-black/60">
          You need edit access to import staff.
        </p>
      </div>
    );
  }

  if (venue.is_global) {
    return (
      <div className="mx-auto max-w-4xl">
        <p className="text-sm text-black/60">
          Import venue staff at a specific venue, not Global.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <ModulePageTitle>Import staff</ModulePageTitle>
        <p className="mt-1 text-sm text-black/60">
          One-off import from the client HR workbook for {venue.name}.
        </p>
      </div>
      <ImportStaffForm />
    </div>
  );
}
