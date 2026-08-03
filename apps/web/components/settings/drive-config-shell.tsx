import { SettingsSubNav } from "@/components/settings/settings-sub-nav";
import {
  DriveConfigInnerNav,
  DriveConfigProviderNav,
} from "@/components/settings/drive-config-nav";
import type { HrWorkDriveConnectionPublic } from "@/lib/hr/types";

export function DriveConfigShell({
  connections,
  activeConnectionId,
  children,
}: {
  connections: HrWorkDriveConnectionPublic[];
  activeConnectionId?: string | null;
  children: React.ReactNode;
}) {
  const active =
    (activeConnectionId
      ? connections.find((c) => c.id === activeConnectionId)
      : null) ?? null;

  return (
    <div className="mx-auto w-full max-w-[83.333%] space-y-6">
      <div>
        <h1 className="font-serif text-3xl text-[#3D421F]">Drive config</h1>
        <p className="mt-1 text-sm text-black/60">
          Venue drive connection and folder settings.
        </p>
      </div>

      <SettingsSubNav />

      <div className="space-y-3">
        <DriveConfigProviderNav connections={connections} />
        {active ? <DriveConfigInnerNav connection={active} /> : null}
      </div>

      {children}
    </div>
  );
}
