import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import { DirectoryHierarchyBoard } from "@/components/directory/directory-hierarchy-board";
import { canAccessDirectoryHierarchy } from "@/lib/directory/permissions";
import { getDirectoryPage } from "@/lib/directory/page-context";
import { loadDirectoryHierarchy } from "@/lib/directory/store";

export default async function DirectoryHierarchyPage() {
  const { venue, permissions, staff, supabase } = await getDirectoryPage();

  if (!canAccessDirectoryHierarchy(permissions, venue.id)) {
    return <AccessDeniedBounce />;
  }

  const roots = await loadDirectoryHierarchy(supabase, venue, staff);

  return (
    <DirectoryHierarchyBoard
      staff={staff}
      roots={roots}
      canEdit={false}
    />
  );
}
