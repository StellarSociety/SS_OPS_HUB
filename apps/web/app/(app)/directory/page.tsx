import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import { DirectoryStaffBrowser } from "@/components/directory/directory-staff-browser";
import { ModulePageTitle } from "@/components/layout/module-page-title";
import {
  canAccessDirectoryStaff,
  firstAccessibleDirectoryPath,
} from "@/lib/directory/permissions";
import { getDirectoryPage } from "@/lib/directory/page-context";
import { scopedPath } from "@/lib/venue/active-venue";
import { redirect } from "next/navigation";

export default async function DirectoryStaffPage() {
  const { venue, permissions, staff } = await getDirectoryPage();

  if (!canAccessDirectoryStaff(permissions, venue.id)) {
    const fallback = firstAccessibleDirectoryPath(permissions, venue.id);
    if (fallback && fallback !== "/directory") {
      redirect(await scopedPath(fallback));
    }
    return <AccessDeniedBounce />;
  }

  return (
    <div className="mx-auto w-full max-w-none space-y-6">
      <div>
        <ModulePageTitle>Staff</ModulePageTitle>
        <p className="mt-1 text-sm text-black/60">
          Venue directory — tap a card for nationality, birthday, and contact
          details.
        </p>
        <hr className="mt-4 border-black/10" />
      </div>
      <DirectoryStaffBrowser staff={staff} />
    </div>
  );
}
