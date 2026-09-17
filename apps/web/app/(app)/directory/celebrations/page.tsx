import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import { DirectoryCelebrationsList } from "@/components/directory/directory-celebrations-list";
import { ModulePageTitle } from "@/components/layout/module-page-title";
import { canAccessDirectoryCelebrations } from "@/lib/directory/permissions";
import { getDirectoryPage } from "@/lib/directory/page-context";

export default async function DirectoryCelebrationsPage() {
  const { venue, permissions, staff } = await getDirectoryPage();

  if (!canAccessDirectoryCelebrations(permissions, venue.id)) {
    return <AccessDeniedBounce />;
  }

  return (
    <div className="mx-auto w-full max-w-none space-y-6">
      <div>
        <ModulePageTitle>Celebrations</ModulePageTitle>
        <p className="mt-1 text-sm text-black/60">
          Birthdays and work anniversaries from one month before today through
          one month after.
        </p>
        <hr className="mt-4 border-black/10" />
      </div>
      <DirectoryCelebrationsList staff={staff} />
    </div>
  );
}
