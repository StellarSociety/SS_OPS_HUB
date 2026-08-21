"use client";

import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { LayoutGrid } from "lucide-react";
import { ModuleTile } from "@/components/modules/module-tile";
import { SubpageTile } from "@/components/modules/subpage-tile";
import type { ModuleGridItem } from "@/components/modules/modules-overview";
import { MaybeSettingsNavMenu } from "@/components/layout/settings-nav-context-menu";
import { useVenueScope } from "@/components/providers/venue-scope-provider";
import {
  guardAppNavigation,
  usePageAccess,
} from "@/components/providers/page-access-provider";
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

function isOverviewItem(item: ModuleSidebarItem): boolean {
  return item.exact === true && item.label === "Overview";
}

function buildDisplayRows(groups: SubpageGroup[]): SubpageDisplayRow[] {
  const hubGroup = groups.find((group) => group.key === "hub");
  const overviewItems =
    hubGroup?.items.filter((item) => isOverviewItem(item)) ?? [];
  const hubWithoutOverview = hubGroup
    ? {
        ...hubGroup,
        items: hubGroup.items.filter((item) => !isOverviewItem(item)),
      }
    : null;

  const rows: SubpageDisplayRow[] = [];
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    if (group.key === "hub") {
      if (hubWithoutOverview && hubWithoutOverview.items.length > 0) {
        rows.push({ type: "single", group: hubWithoutOverview });
      }
      continue;
    }
    const attendance = groups[i + 1];
    const pay = groups[i + 2];
    if (
      group.key === "staff-details" &&
      attendance?.key === "attendance" &&
      pay?.key === "pay"
    ) {
      const overviewGroup: SubpageGroup | null =
        overviewItems.length > 0
          ? {
              key: "overview",
              label: "",
              icon: group.icon,
              items: overviewItems.map((item) => ({
                ...item,
                dividerAfter: true,
              })),
            }
          : null;
      rows.push({
        type: "multi",
        groups: overviewGroup
          ? [overviewGroup, group, attendance, pay]
          : [group, attendance, pay],
      });
      i += 2;
      continue;
    }
    const next = groups[i + 1];
    if (group.key === "boarding" && next?.key === "hub") {
      const right =
        hubWithoutOverview && hubWithoutOverview.items.length > 0
          ? hubWithoutOverview
          : null;
      if (right) {
        rows.push({ type: "paired", left: group, right });
      } else {
        rows.push({ type: "single", group });
      }
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

/**
 * Scales children down uniformly when they would overflow the container width.
 * Avoids scrollbars — the panel shrinks to fit the available space.
 */
function FitToWidth({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const outerRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState<number | undefined>(undefined);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    const measure = () => {
      const available = outer.clientWidth;
      if (available <= 0) return;

      const prev = inner.style.transform;
      inner.style.transform = "translateX(-50%) scale(1)";
      const needed = Math.max(inner.scrollWidth, inner.offsetWidth);
      const naturalHeight = inner.offsetHeight;
      inner.style.transform = prev;

      if (needed <= 0) return;

      const next = Math.min(1, available / needed);
      const nextHeight = Math.ceil(naturalHeight * next);
      setScale((prevScale) => (Math.abs(prevScale - next) < 0.002 ? prevScale : next));
      setHeight((prevHeight) => (prevHeight === nextHeight ? prevHeight : nextHeight));
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(outer);
    ro.observe(inner);
    return () => ro.disconnect();
  }, [children]);

  return (
    <div
      ref={outerRef}
      className={cn("relative w-full overflow-hidden", className)}
      style={height != null ? { height } : undefined}
    >
      <div
        ref={innerRef}
        className="absolute left-1/2 top-0 w-max"
        style={{
          transform: `translateX(-50%) scale(${scale})`,
          transformOrigin: "top center",
        }}
      >
        {children}
      </div>
    </div>
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
  const last = left.items.length - 1;
  const leftWithDivider: SubpageGroup = {
    ...left,
    items: left.items.map((item, index) =>
      index === last ? { ...item, dividerAfter: true } : item,
    ),
  };

  return (
    <div className="flex flex-nowrap items-stretch justify-center gap-x-3">
      <GroupBlock group={leftWithDivider} forceComingSoon={forceComingSoon} nowrap />
      <GroupBlock
        group={right}
        forceComingSoon={forceComingSoon}
        nowrap
        reserveLabel
      />
    </div>
  );
}

function MultiGroupRow({
  groups,
  forceComingSoon,
  wrap = false,
}: {
  groups: SubpageGroup[];
  forceComingSoon?: boolean;
  wrap?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-stretch justify-center gap-x-3",
        wrap ? "flex-wrap gap-y-4" : "flex-nowrap",
      )}
    >
      {groups.map((group) => (
        <GroupBlock
          key={group.key}
          group={group}
          forceComingSoon={forceComingSoon}
          nowrap={!wrap}
          reserveLabel={!group.label && groups.some((g) => g.label)}
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
  /** Keep tiles on one line (parent FitToWidth scales if needed). */
  nowrap?: boolean;
}) {
  const hasDividers = items.some((item) => item.dividerAfter);

  return (
    <div
      className={cn(
        "flex justify-center gap-x-3",
        hasDividers && "items-stretch",
        nowrap ? "flex-nowrap" : "flex-wrap gap-y-2",
      )}
    >
      {items.map((item) => {
        const Icon = item.icon ?? fallbackIcon;
        return (
          <Fragment key={item.href}>
            <div className="w-[4rem] shrink-0">
              <MaybeSettingsNavMenu href={item.comingSoon ? undefined : item.href}>
                <SubpageTile
                  label={item.label}
                  href={item.href}
                  icon={Icon}
                  size="sm"
                  comingSoon={item.comingSoon || forceComingSoon}
                />
              </MaybeSettingsNavMenu>
            </div>
            {item.dividerAfter ? <SubpageTileDivider /> : null}
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
  reserveLabel = false,
}: {
  group: SubpageGroup;
  forceComingSoon?: boolean;
  nowrap?: boolean;
  /** Keep tiles aligned with labeled groups in the same row. */
  reserveLabel?: boolean;
}) {
  const showLabel = Boolean(group.label);
  const showLabelSlot = showLabel || reserveLabel;

  return (
    <div className="shrink-0 space-y-1">
      {showLabelSlot ? (
        <p
          className={cn(
            "text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-black/40",
            !showLabel && "invisible",
          )}
          aria-hidden={!showLabel}
        >
          {group.label || "\u00a0"}
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

export function ModuleSubpagesExpand({
  moduleKey,
  forceComingSoon = false,
  wrap = false,
}: {
  moduleKey: string;
  forceComingSoon?: boolean;
  /** Wrap groups onto new lines at full size before scaling. */
  wrap?: boolean;
}) {
  const expanded = resolveSubpages(moduleKey);
  if (!expanded || expanded.items.length === 0) return null;
  const useGroups = Boolean(expanded.groups && expanded.groups.length > 0);

  const body = useGroups ? (
    <div
      className={cn(
        wrap ? "w-full space-y-2.5" : "w-max max-w-none space-y-2.5",
      )}
    >
      {buildDisplayRows(expanded.groups!).map((row) =>
        row.type === "multi" ? (
          <MultiGroupRow
            key={row.groups.map((g) => g.key).join("-")}
            groups={row.groups}
            forceComingSoon={forceComingSoon}
            wrap={wrap}
          />
        ) : row.type === "paired" ? (
          <PairedSubpageGroupsRow
            key={`${row.left.key}-${row.right.key}`}
            left={row.left}
            right={row.right}
            forceComingSoon={forceComingSoon}
          />
        ) : (
          <GroupBlock
            key={row.group.key}
            group={row.group}
            forceComingSoon={forceComingSoon}
            nowrap={!wrap}
          />
        ),
      )}
    </div>
  ) : (
    <SubpageRow
      items={expanded.items}
      fallbackIcon={expanded.icon}
      forceComingSoon={forceComingSoon}
      nowrap={!wrap}
    />
  );

  if (wrap) {
    return <div className="w-full min-w-0">{body}</div>;
  }

  return <FitToWidth>{body}</FitToWidth>;
}

export function ExpandableModuleGrid({
  modules,
  centered = false,
}: ExpandableModuleGridProps) {
  const router = useRouter();
  const { scope, slug } = useVenueScope();
  const access = usePageAccess();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const selected = modules.find((mod) => mod.key === selectedKey) ?? null;
  const expanded = selectedKey ? resolveSubpages(selectedKey) : null;

  useEffect(() => {
    if (!expanded || !panelRef.current) return;
    panelRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [expanded, selectedKey]);

  const handleSelectModule = (mod: ModuleGridItem) => {
    if (!canExpandModule(mod)) {
      if (mod.status === "live" && mod.clickable && mod.href) {
        if (!guardAppNavigation(access, mod.href)) return;
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
            <MaybeSettingsNavMenu href={mod.href}>
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
            </MaybeSettingsNavMenu>
          </div>
        ))}
      </div>

      {selected && expanded && expanded.items.length > 0 ? (
        <div
          ref={panelRef}
          className="overflow-hidden rounded-2xl border border-[var(--venue-primary)]/20 bg-[var(--venue-primary)]/10 px-3 py-3 shadow-inner"
        >
          <ModuleSubpagesExpand
            moduleKey={selected.key}
            forceComingSoon={selected.status === "coming_soon"}
          />
        </div>
      ) : null}
    </div>
  );
}
