import { ScopedLink as Link } from "@/components/layout/scoped-link";
import { Card } from "@/components/ui/card";
import { SettingsSubNav } from "@/components/settings/settings-sub-nav";

export default async function SettingsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-serif text-3xl text-[#3D421F]">Venue Settings</h1>
        <p className="mt-1 text-sm text-black/60">
          Configuration for this venue — users, access, and enabled modules.
        </p>
      </div>

      <SettingsSubNav />

      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/settings/users">
          <Card className="h-full p-6 transition-colors hover:bg-[var(--venue-secondary)]/30">
            <h2 className="font-serif text-xl text-[#3D421F]">
              Users & access
            </h2>
            <p className="mt-2 text-sm text-black/60">
              Invite staff, assign permissions, activate or deactivate accounts.
            </p>
          </Card>
        </Link>
        <Link href="/settings/venue-modules">
          <Card className="h-full p-6 transition-colors hover:bg-[var(--venue-secondary)]/30">
            <h2 className="font-serif text-xl text-[#3D421F]">
              Venue modules
            </h2>
            <p className="mt-2 text-sm text-black/60">
              Enable or disable modules per venue for phased rollouts.
            </p>
          </Card>
        </Link>
      </div>
    </div>
  );
}
