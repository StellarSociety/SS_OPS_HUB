import { GlobalSettingsSubNav } from "@/components/settings/global-settings-sub-nav";
import { requireGlobalSettingsAccess } from "@/lib/access/global-settings";

export default async function GlobalSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireGlobalSettingsAccess();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-black/45">
          Global
        </p>
        <h1 className="font-serif text-3xl text-[#3D421F]">Global settings</h1>
        <p className="mt-1 text-sm text-black/60">
          Cross-venue configuration — branding, defaults, and organisation-wide
          options.
        </p>
      </div>

      <GlobalSettingsSubNav />

      {children}
    </div>
  );
}
