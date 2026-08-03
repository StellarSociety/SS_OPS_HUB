import { SettingsSubNav } from "@/components/settings/settings-sub-nav";
import { EmailConfigPanel } from "@/components/settings/email-config-panel";
import { getEmailTransportConnections } from "@/lib/actions/hr-email-transport";

export default async function SettingsEmailConfigPage() {
  const connections = await getEmailTransportConnections();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-serif text-3xl text-[#3D421F]">Email config</h1>
        <p className="mt-1 text-sm text-black/60">
          Venue email connection and delivery settings.
        </p>
      </div>

      <SettingsSubNav />

      <EmailConfigPanel connections={connections} />
    </div>
  );
}
