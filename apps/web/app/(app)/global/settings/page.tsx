import { ScopedLink as Link } from "@/components/layout/scoped-link";
import { AppIconPanel } from "@/components/settings/app-icon-panel";
import { GroupFaviconPanel } from "@/components/settings/group-favicon-panel";
import { GroupLogoPanel } from "@/components/settings/group-logo-panel";
import { Card } from "@/components/ui/card";
import { fetchGroupBrandingState } from "@/lib/group/branding";

export default async function GlobalSettingsPage() {
  const branding = await fetchGroupBrandingState();

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <GroupLogoPanel initial={branding} />
        <AppIconPanel initial={branding} />
        <GroupFaviconPanel initial={branding} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/global/settings/branding">
          <Card className="h-full p-6 transition-colors hover:bg-[var(--venue-secondary)]/30">
            <h2 className="font-serif text-xl text-[#3D421F]">Branding</h2>
            <p className="mt-2 text-sm text-black/60">
              Stellar Society Group logo, favicon, SS OPS HUB app icon, plus
              logo, icon, favicon, display name, and brand colors for each venue.
            </p>
          </Card>
        </Link>
        <Link href="/global/settings/apps">
          <Card className="h-full p-6 transition-colors hover:bg-[var(--venue-secondary)]/30">
            <h2 className="font-serif text-xl text-[#3D421F]">Apps</h2>
            <p className="mt-2 text-sm text-black/60">
              Control app availability in the Apps Hub — coming soon, visible but
              locked, or hidden.
            </p>
          </Card>
        </Link>
      </div>
    </div>
  );
}
