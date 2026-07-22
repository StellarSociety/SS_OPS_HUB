"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { LayoutGrid } from "lucide-react";
import { ModuleTile } from "@/components/modules/module-tile";
import { SubpageTile } from "@/components/modules/subpage-tile";
import type { ModuleGridItem } from "@/components/modules/modules-overview";
import { useVenueScope } from "@/components/providers/venue-scope-provider";
import {
  getModuleSidebarByKey,
  type ModuleSidebarItem,
} from "@/lib/module-sidebar";
import {
  getModuleDef,
  getSettingsFeatureForModule,
  getSubPagesForModule,
} from "@/lib/modules-catalog";
import { getOverviewModuleByKey } from "@/lib/modules-registry";
import { cn } from "@/lib/utils";
import { toScopedHref } from "@/lib/venue/scope-routing";

type ExpandableModuleGridProps = {
  modules: ModuleGridItem[];
  centered?: boolean;
};

type SubpageGroup = {
  key: string;
  label: string;
  icon: LucideIcon;
  items: ModuleSidebarItem[];
};

type SubpageDisplayRow =
  | { type: "single"; group: SubpageGroup }
  | { type: "multi"; groups: SubpageGroup[] }
  | { type: "paired"; left: SubpageGroup; right: SubpageGroup };

function buildDisplayRows(groups: SubpageGroup[]): SubpageDisplayRow[] {
  const rows: SubpageDisplayRow[] = [];
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    const attendance = groups[i + 1];
    const pay = groups[i + 2];
    if (
      group.key === "staff-details" &&
      attendance?.key === "attendance" &&
      pay?.key === "pay"
    ) {
      rows.push({ type: "multi", groups: [group, attendance, pay] });
      i += 2;
      continue;
    }
    const hub = groups[i + 1];
    if (group.key === "boarding" && hub?.key === "hub") {
      rows.push({ type: "paired", left: group, right: hub });
      i += 1;
      continue;
    }
    rows.push({ type: "single", group });
  }
  return rows;
}

function SubpageTileDivider() {
  return (
    <span
      aria-hidden
      className="mx-0.5 w-px shrink-0 self-stretch bg-black/25"
    />
  );
}

function PairedSubpageGroupsRow({
  left,
  right,
  forceComingSoon,
}: {
  left: SubpageGroup;
  right: SubpageGroup;
  forceComingSoon?: boolean;
}) {
  return (
    <div className="space-y-2">
      {left.label ? (
        <p className="text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-black/40">
          {left.label}
        </p>
      ) : null}
      <div className="flex flex-nowrap items-stretch justify-center gap-x-6 overflow-x-auto pb-1">
        {left.items.map((item) => {
          const Icon = item.icon ?? left.icon;
          return (
            <div key={item.href} className="w-[5.75rem] shrink-0">
              <SubpageTile
                label={item.label}
                href={item.href}
                icon={Icon}
                comingSoon={item.comingSoon || forceComingSoon}
              />
            </div>
          );
        })}
        <SubpageTileDivider />
        {right.items.map((item) => {
          const Icon = item.icon ?? right.icon;
          return (
            <div key={item.href} className="w-[5.75rem] shrink-0">
              <SubpageTile
                label={item.label}
                href={item.href}
                icon={Icon}
                comingSoon={item.comingSoon || forceComingSoon}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MultiGroupRow({
  groups,
  forceComingSoon,
}: {
  groups: SubpageGroup[];
  forceComingSoon?: boolean;
}) {
  return (
    <div className="flex flex-nowrap items-stretch justify-center gap-x-5 overflow-x-auto pb-1">
      {groups.map((group) => (
        <GroupBlock
          key={group.key}
          group={group}
          forceComingSoon={forceComingSoon}
          nowrap
        />
      ))}
    </div>
  );
}

type ResolvedSubpages = {
  label: string;
  icon: LucideIcon;
  /** Flat list when the module has no sidebar categories. */
  items: ModuleSidebarItem[];
  /** Grouped rows (e.g. HR sidebar categories). */
  groups?: SubpageGroup[];
};

function resolveSubpages(moduleKey: string): ResolvedSubpages | null {
  const sidebar = getModuleSidebarByKey(moduleKey);
  if (sidebar && sidebar.items.length > 0) {
    const itemByHref = new Map(
      sidebar.items.map((item) => [item.href, item] as const),
    );
    const categorizedHrefs = new Set(
      (sidebar.categories ?? []).flatMap((category) => category.itemHrefs),
    );

    const groups: SubpageGroup[] = [];

    const uncategorized = sidebar.items.filter(
      (item) => !categorizedHrefs.has(item.href),
    );

    const hasCategories = (sidebar.categories?.length ?? 0) > 0;

    if (hasCategories) {
      for (const category of sidebar.categories ?? []) {
        const items = category.itemHrefs
          .map((href) => itemByHref.get(href))
          .filter((item): item is ModuleSidebarItem => Boolean(item));
        if (items.length === 0) continue;
        groups.push({
          key: category.key,
          label: category.label,
          icon: category.icon,
          items,
        });
      }

      const hubItems = [
        ...uncategorized,
        ...(sidebar.bottomItems ?? []),
      ];
      if (hubItems.length > 0) {
        groups.push({
          key: "hub",
          label: "",
          icon: sidebar.icon,
          items: hubItems,
        });
      }
    }

    const flatItems = [...sidebar.items, ...(sidebar.bottomItems ?? [])];
    return {
      label: sidebar.label,
      icon: sidebar.icon,
      items: flatItems,
      groups: hasCategories && groups.length > 0 ? groups : undefined,
    };
  }

  const features = getSubPagesForModule(moduleKey);
  const settings = getSettingsFeatureForModule(moduleKey);
  const overview = getOverviewModuleByKey(moduleKey);
  const mod = getModuleDef(moduleKey);

  const items: ModuleSidebarItem[] = features.map((feature) => ({
    label: feature.label,
    href: feature.href ?? `#${moduleKey}-${feature.key}`,
    comingSoon: !feature.href,
  }));

  if (settings) {
    items.push({
      label: settings.label,
      href: settings.href ?? `#${moduleKey}-settings`,
      comingSoon: !settings.href,
    });
  }

  if (items.length === 0) return null;

  return {
    label: overview?.label ?? mod?.label ?? moduleKey,
    icon: LayoutGrid,
    items,
  };
}

function canExpandModule(mod: ModuleGridItem): boolean {
  if (mod.blockedReason === "access") return false;
  if (mod.status === "visible_locked" || mod.status === "hidden") return false;
  if (mod.status === "coming_soon") return Boolean(resolveSubpages(mod.key));
  return (
    mod.status === "live" &&
    mod.clickable &&
    Boolean(resolveSubpages(mod.key))
  );
}

function SubpageRow({
  items,
  fallbackIcon,
  forceComingSoon,
  nowrap,
}: {
  items: ModuleSidebarItem[];
  fallbackIcon: LucideIcon;
  forceComingSoon?: boolean;
  /** Keep tiles on one scrollable line (does not change tile size). */
  nowrap?: boolean;
}) {
  const hasDividers = items.some((item) => item.dividerAfter);

  return (
    <div
      className={cn(
        "flex justify-center gap-x-6",
        hasDividers && "items-stretch",
        nowrap ? "flex-nowrap overflow-x-auto pb-1" : "flex-wrap gap-y-5",
      )}
    >
      {items.map((item) => {
        const Icon = item.icon ?? fallbackIcon;
        return (
          <Fragment key={item.href}>
            <div className="w-[5.75rem] shrink-0">
              <SubpageTile
                label={item.label}
                href={item.href}
                icon={Icon}
                comingSoon={item.comingSoon || forceComingSoon}
              />
            </div>
            {item.dividerAfter ? (
              <SubpageTileDivider />
            ) : null}
          </Fragment>
        );
      })}
    </div>
  );
}

function GroupBlock({
  group,
  forceComingSoon,
  nowrap,
}: {
  group: SubpageGroup;
  forceComingSoon?: boolean;
  nowrap?: boolean;
}) {
  return (
    <div className="shrink-0 space-y-2">
      {group.label ? (
        <p className="text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-black/40">
          {group.label}
        </p>
      ) : null}
      <SubpageRow
        items={group.items}
        fallbackIcon={group.icon}
        forceComingSoon={forceComingSoon}
        nowrap={nowrap}
      />
    </div>
  );
}

export function ExpandableModuleGrid({
  modules,
  centered = false,
}: ExpandableModuleGridProps) {
  const router = useRouter();
  const { scope, slug } = useVenueScope();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const selected = modules.find((mod) => mod.key === selectedKey) ?? null;
  const expanded = selectedKey ? resolveSubpages(selectedKey) : null;
  const useGroups = Boolean(expanded?.groups && expanded.groups.length > 0);

  useEffect(() => {
    if (!expanded || !panelRef.current) return;
    panelRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [expanded, selectedKey]);

  const handleSelectModule = (mod: ModuleGridItem) => {
    if (!canExpandModule(mod)) {
      if (mod.status === "live" && mod.clickable && mod.href) {
        router.push(toScopedHref(mod.href, scope, slug));
      }
      return;
    }
    setSelectedKey((current) => (current === mod.key ? null : mod.key));
  };

  return (
    <div className="space-y-5">
      <div
        className={cn(
          centered
            ? "flex flex-wrap justify-center gap-x-8 gap-y-5"
            : "grid grid-cols-4 gap-x-1 gap-y-5 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8",
        )}
      >
        {modules.map((mod) => (
          <div key={mod.key} className={cn(centered && "w-[5.75rem]")}>
            <ModuleTile
              label={mod.label}
              iconKey={mod.iconKey}
              status={mod.status}
              href={mod.href}
              clickable={mod.clickable}
              blockedReason={mod.blockedReason}
              selected={selectedKey === mod.key}
              onSelect={
                canExpandModule(mod)
                  ? () => handleSelectModule(mod)
                  : undefined
              }
            />
          </div>
        ))}
      </div>

      {selected && expanded && expanded.items.length > 0 ? (
        <div
          ref={panelRef}
          className="space-y-4 rounded-2xl border border-[var(--venue-primary)]/20 bg-[var(--venue-primary)]/10 px-4 py-5 shadow-inner"
        >
          {useGroups ? (
            <div className="space-y-4">
              {buildDisplayRows(expanded.groups!).map((row) =>
                row.type === "multi" ? (
                  <MultiGroupRow
                    key={row.groups.map((g) => g.key).join("-")}
                    groups={row.groups}
                    forceComingSoon={selected.status === "coming_soon"}
                  />
                ) : row.type === "paired" ? (
                  <PairedSubpageGroupsRow
                    key={`${row.left.key}-${row.right.key}`}
                    left={row.left}
                    right={row.right}
                    forceComingSoon={selected.status === "coming_soon"}
                  />
                ) : (
                  <GroupBlock
                    key={row.group.key}
                    group={row.group}
                    forceComingSoon={selected.status === "coming_soon"}
                  />
                ),
              )}
            </div>
          ) : (
            <SubpageRow
              items={expanded.items}
              fallbackIcon={expanded.icon}
              forceComingSoon={selected.status === "coming_soon"}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}
