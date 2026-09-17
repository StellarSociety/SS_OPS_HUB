import { MobileAccessDenied } from "@/components/mobile/mobile-access-denied";
import { MobileDirectoryScreen } from "@/components/mobile/mobile-directory-screen";
import {
  canAccessDirectory,
  canAccessDirectoryHierarchy,
  firstAccessibleMobileDirectoryPath,
} from "@/lib/directory/permissions";
import {
  loadDirectoryHierarchy,
  loadDirectoryStaff,
} from "@/lib/directory/store";
import { getMobileAppContext } from "@/lib/mobile/page-context";
import { canAccessMobileApp } from "@/lib/mobile/permissions";
import { MOBILE_APP_BASE } from "@/lib/mobile/app-path";
import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ venueSlug: string }>;
};

export default async function MobileDirectoryHierarchyPage({
  params,
}: PageProps) {
  const { venueSlug } = await params;
  const { venue, permissions, supabase } = await getMobileAppContext(venueSlug);

  if (!canAccessMobileApp(permissions, venue.id)) {
    return <MobileAccessDenied />;
  }

  if (!canAccessDirectoryHierarchy(permissions, venue.id)) {
    if (!canAccessDirectory(permissions, venue.id)) {
      return <MobileAccessDenied />;
    }
    const fallback = firstAccessibleMobileDirectoryPath(permissions, venue.id);
    if (fallback && fallback !== "/directory/hierarchy") {
      redirect(`${MOBILE_APP_BASE}/${venue.slug}${fallback}`);
    }
    return <MobileAccessDenied />;
  }

  const staff = await loadDirectoryStaff(supabase, venue);
  const hierarchy = await loadDirectoryHierarchy(supabase, venue, staff);

  return (
    <div className="h-full min-h-0 overflow-hidden mobile-app-canvas">
      <MobileDirectoryScreen
        tab="hierarchy"
        venue={venue}
        staff={staff}
        hierarchy={hierarchy}
      />
    </div>
  );
}
