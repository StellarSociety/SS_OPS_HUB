"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, Lock, X } from "lucide-react";
import { ScopedLink as Link } from "@/components/layout/scoped-link";
import { MaybeSettingsNavMenu } from "@/components/layout/settings-nav-context-menu";
import { LiquidGlassPanel, LiquidGlassScrim } from "@/components/ui/liquid-glass";
import { ModuleSubpagesExpand } from "@/components/modules/expandable-module-grid";
import { ModuleIcon } from "@/components/modules/module-icon";
import { ModuleTile } from "@/components/modules/module-tile";
import { AnimatedSymbol } from "@/components/ui/animated-symbol";
import type { ModuleGridItem } from "@/components/modules/modules-overview";
import { usePageAccess } from "@/components/providers/page-access-provider";
import { HUB_MODULE_ROWS, hubModuleSortIndex, type ModuleCategory } from "@/lib/modules-registry";
import { cn } from "@/lib/utils";

export type AppsHubStageSection = {
  category: ModuleCategory;
  modules: ModuleGridItem[];
};

type AppsHubStageProps = {
  sections: AppsHubStageSection[];
  trailingItem?: ModuleGridItem | null;
};

function statusCopy(mod: ModuleGridItem): string {
  if (mod.status === "live" && mod.blockedReason === "access") return "Restricted";
  if (mod.status === "live") return "Live";
  if (mod.status === "coming_soon") return "Coming soon";
  return "Locked";
}

export function AppsHubStage({ sections, trailingItem }: AppsHubStageProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [portalReady, setPortalReady] = useState(false);

  const groupedSections = sections
    .map((section) => ({
      ...section,
      modules: [...section.modules].sort(
        (a, b) => hubModuleSortIndex(a.key) - hubModuleSortIndex(b.key),
      ),
    }))
    .filter((section) => section.modules.length > 0);

  const allModules = [
    ...groupedSections.flatMap((section) => section.modules),
    ...(trailingItem ? [trailingItem] : []),
  ];
  const selected = allModules.find((mod) => mod.key === selectedKey) ?? null;
  const isHubOverview = groupedSections.length > 1;

  const hubRows = isHubOverview
    ? buildHubRows(allModules, trailingItem?.key ?? null)
    : null;

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!selected) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedKey(null);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [selected]);

  const toggle = (mod: ModuleGridItem) => {
    setSelectedKey((current) => (current === mod.key ? null : mod.key));
  };

  return (
    <div className="space-y-4">
      {hubRows ? (
        <div className="space-y-4">
          {hubRows.map((row, index) => (
            <ModuleIconRow
              key={row.map((mod) => mod.key).join("-") || `row-${index}`}
              modules={row}
              selectedKey={selectedKey}
              onToggle={toggle}
            />
          ))}
        </div>
      ) : (
        groupedSections.map((section) => (
          <ModuleIconRow
            key={section.category.key}
            modules={section.modules}
            selectedKey={selectedKey}
            onToggle={toggle}
          />
        ))
      )}

      {portalReady
        ? createPortal(
            <AnimatePresence>
              {selected ? (
                <motion.div
                  key="details"
                  className="fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-8"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                >
                  <LiquidGlassScrim onClose={() => setSelectedKey(null)} />
                  <motion.div
                    className="relative z-10 w-full max-w-5xl"
                    initial={{ opacity: 0, y: 16, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 12, scale: 0.98 }}
                    transition={{ type: "spring", stiffness: 380, damping: 28 }}
                  >
                    <AppDetailsPanel
                      key={selected.key}
                      module={selected}
                      onClose={() => setSelectedKey(null)}
                    />
                  </motion.div>
                </motion.div>
              ) : null}
            </AnimatePresence>,
            document.body,
          )
        : null}
    </div>
  );
}

function buildHubRows(
  modules: ModuleGridItem[],
  trailingKey: string | null,
): ModuleGridItem[][] {
  const byKey = new Map(modules.map((mod) => [mod.key, mod]));
  const used = new Set<string>();
  const rows = HUB_MODULE_ROWS.map((keys) => {
    const row: ModuleGridItem[] = [];
    for (const key of keys) {
      if (key === trailingKey) continue;
      const mod = byKey.get(key);
      if (!mod) continue;
      used.add(key);
      row.push(mod);
    }
    return row;
  }).filter((row) => row.length > 0);

  const leftovers = modules.filter(
    (mod) => !used.has(mod.key) && mod.key !== trailingKey,
  );
  if (leftovers.length > 0) {
    const last = rows[rows.length - 1];
    if (last) last.push(...leftovers);
    else rows.push(leftovers);
  }

  const trailing = trailingKey ? byKey.get(trailingKey) : null;
  if (trailing) rows.push([trailing]);

  return rows;
}

function ModuleIconRow({
  modules,
  selectedKey,
  onToggle,
}: {
  modules: ModuleGridItem[];
  selectedKey: string | null;
  onToggle: (mod: ModuleGridItem) => void;
}) {
  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-4 md:flex-nowrap">
      {modules.map((mod) => (
        <div
          key={mod.key}
          className={cn(
            "w-[5.5rem] transition-[opacity,filter,transform] duration-300",
            selectedKey &&
              selectedKey !== mod.key &&
              "opacity-40 grayscale-[0.35]",
          )}
        >
          <ModuleTile
            label={mod.label}
            iconKey={mod.iconKey}
            status={mod.status}
            href={mod.href}
            clickable={mod.clickable}
            blockedReason={mod.blockedReason}
            selected={selectedKey === mod.key}
            onSelect={() => onToggle(mod)}
            comingSoonStyle="none"
            selectNoun="details"
            iconWell
          />
        </div>
      ))}
    </div>
  );
}

function AppDetailsPanel({
  module: mod,
  onClose,
}: {
  module: ModuleGridItem;
  onClose: () => void;
}) {
  const { notifyAccessDenied } = usePageAccess();
  const isLive = mod.status === "live" && mod.clickable && Boolean(mod.href);
  const isComingSoon = mod.status === "coming_soon";
  const isLocked = mod.status === "visible_locked";
  const isAccessBlocked = mod.status === "live" && mod.blockedReason === "access";
  const titleId = `apps-hub-details-${mod.key}`;

  return (
    <LiquidGlassPanel
      labelledBy={titleId}
      modal
      className="max-h-[min(90vh,44rem)] overflow-y-auto rounded-3xl"
    >
      <div>
        <div className="relative border-b border-white/35 bg-[var(--venue-primary)]/12">
          <div className="relative flex flex-col gap-5 p-5 sm:flex-row sm:items-start sm:p-7 sm:pb-6">
            <div className="flex h-[5.5rem] w-[5.5rem] shrink-0 items-center justify-center rounded-3xl border border-white/45 bg-white/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] backdrop-blur-md">
              <AnimatedSymbol>
                <ModuleIcon
                  iconKey={mod.iconKey}
                  className={cn(
                    "module-icon-relief h-14 w-14",
                    (isLocked || isAccessBlocked) && "opacity-45 grayscale",
                  )}
                />
              </AnimatedSymbol>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2
                      id={titleId}
                      className="font-serif text-2xl tracking-tight text-[#3D421F] md:text-[1.85rem]"
                    >
                      {mod.label}
                    </h2>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] backdrop-blur-md",
                        isLive &&
                          "border-white/50 bg-[var(--venue-primary)]/18 text-[var(--venue-primary,#818a40)]",
                        (isComingSoon || isLocked || isAccessBlocked) &&
                          "border-white/40 bg-white/30 text-black/45",
                      )}
                    >
                      {isAccessBlocked || isLocked ? (
                        <Lock className="h-2.5 w-2.5" aria-hidden />
                      ) : null}
                      {statusCopy(mod)}
                    </span>
                  </div>
                  <p className="max-w-2xl text-sm leading-relaxed text-black/55">
                    {mod.description}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {isLive && mod.href ? (
                    <MaybeSettingsNavMenu href={mod.href}>
                      <Link
                        href={mod.href}
                        className="inline-flex h-10 items-center gap-1.5 rounded-md bg-[var(--venue-primary,#818a40)] px-4 text-sm font-medium text-white hover:opacity-90"
                      >
                        {mod.key === "global_settings"
                          ? "Open settings"
                          : "Open app"}
                        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                      </Link>
                    </MaybeSettingsNavMenu>
                  ) : isAccessBlocked ? (
                    <button
                      type="button"
                      onClick={() => notifyAccessDenied()}
                      className="inline-flex h-10 items-center gap-1.5 rounded-md border border-white/50 bg-white/35 px-4 text-sm font-medium text-[#3D421F] backdrop-blur-md"
                    >
                      <Lock className="h-3.5 w-3.5" aria-hidden />
                      Access restricted
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close details"
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-black/40 transition-colors hover:bg-white/40 hover:text-[#3D421F]"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="min-w-0 w-full px-3 py-3 empty:hidden sm:px-5 sm:py-4">
          <ModuleSubpagesExpand
            moduleKey={mod.key}
            forceComingSoon={mod.status === "coming_soon"}
            wrap
          />
        </div>
      </div>
    </LiquidGlassPanel>
  );
}
