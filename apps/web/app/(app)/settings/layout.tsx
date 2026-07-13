import { redirect } from "next/navigation";
import { requireAppAdmin } from "@/lib/access/permissions";
import { getActiveScope } from "@/lib/venue/active-venue";
import { GLOBAL_BASE } from "@/lib/venue/scope-routing";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAppAdmin();
  // Venue settings never apply to the global view — send global to its own
  // settings surface so a "global Venue Settings" page can't render.
  const active = await getActiveScope();
  if (active?.scope === "global") {
    redirect(`${GLOBAL_BASE}/settings`);
  }
  return children;
}
