import { GroupsRail } from "@/components/connect/groups-rail";
import type { ConnectGroup } from "@/lib/connect/types";

/** Three-column social layout: groups rail · feed · right rail. */
export function ConnectFrame({
  groups,
  canOpenSettings,
  right,
  children,
}: {
  groups: ConnectGroup[];
  canOpenSettings: boolean;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto grid w-full max-w-[1280px] gap-6 lg:grid-cols-[200px_minmax(0,1fr)] xl:grid-cols-[200px_minmax(0,680px)_300px] xl:justify-center">
      <aside className="hidden lg:block">
        <div className="sticky top-4">
          <GroupsRail groups={groups} canOpenSettings={canOpenSettings} />
        </div>
      </aside>
      <main className="min-w-0 space-y-4">{children}</main>
      {right ? (
        <aside className="hidden xl:block">
          <div className="sticky top-4 space-y-4">{right}</div>
        </aside>
      ) : null}
    </div>
  );
}
