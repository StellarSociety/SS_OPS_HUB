import { MobileAccessDenied } from "@/components/mobile/mobile-access-denied";
import { MobileHiringScreen } from "@/components/mobile/mobile-hiring-screen";
import { getMobileAppContext } from "@/lib/mobile/page-context";
import { canAccessMobileApp } from "@/lib/mobile/permissions";
import { loadMobileHiringPage } from "@/lib/mobile/hiring-replies";
import { HIRING_SHORTCUT_KEY, isShortcutOpen } from "@/lib/mobile/shortcuts";

type PageProps = {
  params: Promise<{ venueSlug: string }>;
  searchParams: Promise<{ form?: string; application?: string }>;
};

export default async function MobileHiringPage({ params, searchParams }: PageProps) {
  const { venueSlug } = await params;
  const { form, application } = await searchParams;
  const { venue, permissions, phone } = await getMobileAppContext(venueSlug);

  if (!canAccessMobileApp(permissions, venue.id)) {
    return <MobileAccessDenied />;
  }
  const level = phone.shortcuts[HIRING_SHORTCUT_KEY];
  if (!isShortcutOpen(level)) {
    return <MobileAccessDenied />;
  }

  const initial = await loadMobileHiringPage(venue.id, form);

  return (
    <div className="h-full min-h-0 overflow-hidden mobile-app-canvas">
      <MobileHiringScreen
        tab="replies"
        venue={venue}
        initial={initial}
        canEdit={level === "editor"}
        openFormId={form}
        openApplicationId={application}
      />
    </div>
  );
}
