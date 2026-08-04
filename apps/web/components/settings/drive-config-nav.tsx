"use client";

import Image from "next/image";
import { Folder, FolderPlus, HardDrive, Link2, Plus } from "lucide-react";
import { useRelativePathname } from "@/components/providers/venue-scope-provider";
import { SubNavTab } from "@/components/layout/sub-nav-tab";
import { ScopedLink } from "@/components/layout/scoped-link";
import {
  pillSubNavLinkClass,
  segmentedSubNavLinkClass,
} from "@/lib/sub-nav-ui";
import { NavigationPendingIndicator } from "@/components/layout/navigation-pending-indicator";
import type { HrWorkDriveConnectionPublic } from "@/lib/hr/types";
import { cn } from "@/lib/utils";
import { driveConnectionHomePath } from "@/lib/settings/drive-config-paths";

function folderTabLabel(label: string): string {
  return label.trim() || "Drive folder";
}

function isZohoWorkDriveConnection(connection: HrWorkDriveConnectionPublic): boolean {
  const label = connection.label.trim().toLowerCase();
  return (
    connection.id === "zoho" ||
    label === "zoho workdrive" ||
    label.includes("workdrive")
  );
}

/** Display casing for the Zoho WorkDrive product name. */
function zohoWorkDriveTabLabel(label: string): string {
  const trimmed = label.trim();
  if (!trimmed || /^zoho\s*workdrive$/i.test(trimmed)) {
    return "ZOHO WorkDrive";
  }
  return trimmed;
}

export function DriveConfigProviderNav({
  connections,
}: {
  connections: HrWorkDriveConnectionPublic[];
}) {
  const pathname = useRelativePathname();

  return (
    <nav
      aria-label="Drive providers"
      className="flex flex-wrap items-center gap-1 rounded-lg border border-black/10 bg-white/50 p-1.5"
    >
      {connections.map((connection) => {
        const href = driveConnectionHomePath(connection);
        const active =
          pathname.startsWith(`/settings/drive-config/${connection.id}/`) ||
          pathname === `/settings/drive-config/${connection.id}`;
        const label = connection.label || "ZOHO WorkDrive";

        if (isZohoWorkDriveConnection(connection)) {
          return (
            <ScopedLink
              key={connection.id}
              href={href}
              className={cn(segmentedSubNavLinkClass(active), "normal-case")}
            >
              <Image
                src="/brand/zoho-workdrive-mark.svg"
                alt=""
                width={16}
                height={14}
                className="h-3.5 w-auto shrink-0"
                unoptimized
              />
              <span className="min-w-0 truncate text-center tracking-[0.04em]">
                {zohoWorkDriveTabLabel(label)}
              </span>
              <NavigationPendingIndicator />
            </ScopedLink>
          );
        }

        return (
          <SubNavTab
            key={connection.id}
            href={href}
            label={label}
            icon={HardDrive}
            active={active}
            variant="segmented"
          />
        );
      })}
      <ScopedLink
        href="/settings/drive-config/new"
        className={cn(
          segmentedSubNavLinkClass(
            pathname === "/settings/drive-config/new" ||
              pathname.startsWith("/settings/drive-config/new/"),
          ),
          "gap-1",
        )}
      >
        <Plus className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
        <span className="min-w-0 truncate text-center">Add connection</span>
        <NavigationPendingIndicator />
      </ScopedLink>
    </nav>
  );
}

/**
 * Inner section pills. Panels only show while a tab is selected; clicking the
 * active tab again returns to the connection home (deselected).
 */
export function DriveConfigInnerNav({
  connection,
}: {
  connection: HrWorkDriveConnectionPublic;
}) {
  const pathname = useRelativePathname();
  const homeHref = driveConnectionHomePath(connection);
  const connectionHref = `${homeHref}/connection`;
  const addFolderHref = `${homeHref}/folders/new`;
  const connectionActive = pathname === connectionHref;
  const addFolderActive = pathname.startsWith(addFolderHref);

  return (
    <nav
      aria-label="Drive connection sections"
      className="flex flex-wrap items-center gap-2"
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <ScopedLink
          href={connectionActive ? homeHref : connectionHref}
          aria-pressed={connectionActive}
          className={pillSubNavLinkClass(connectionActive)}
        >
          <Link2 className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
          <span>Connection</span>
          <NavigationPendingIndicator />
        </ScopedLink>
        {connection.folders.map((folder) => {
          const href = `${homeHref}/folders/${folder.id}`;
          const active = pathname.startsWith(href);
          return (
            <ScopedLink
              key={folder.id}
              href={active ? homeHref : href}
              aria-pressed={active}
              className={pillSubNavLinkClass(active)}
            >
              <Folder className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
              <span>{folderTabLabel(folder.label)}</span>
              <NavigationPendingIndicator />
            </ScopedLink>
          );
        })}
      </div>
      <ScopedLink
        href={addFolderActive ? homeHref : addFolderHref}
        aria-pressed={addFolderActive}
        className={cn(
          "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-emerald-700 px-2.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-800",
          addFolderActive && "ring-2 ring-emerald-700/30 ring-offset-1",
        )}
      >
        <FolderPlus className="size-3.5 shrink-0" aria-hidden />
        Add folder
        <NavigationPendingIndicator />
      </ScopedLink>
    </nav>
  );
}
