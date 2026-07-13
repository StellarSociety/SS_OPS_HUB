"use client";

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import {
  getModuleSidebarForPath,
  isModuleSidebarItemActive,
  type ModuleSidebarCategory,
  type ModuleSidebarDef,
  type ModuleSidebarItem,
} from "@/lib/module-sidebar";
import { NavigationPendingIndicator } from "@/components/layout/navigation-pending-indicator";
import { ScopedLink } from "@/components/layout/scoped-link";
import { useRelativePathname } from "@/components/providers/venue-scope-provider";
import {
  subNavLabelClass,
  moduleBrandedNavLinkClass,
  moduleBrandedNavIconClass,
} from "@/lib/sub-nav-ui";
import { cn } from "@/lib/utils";

type ModuleShortcutsProps = {
  /** Base path of the module whose sidebar shortcuts should be shown (e.g. "/sales"). */
  basePath: string;
  /** Accessible label for the nav landmark. Defaults to "<Module> apps". */
  ariaLabel?: string;
};

function shortcutBoxClass(active: boolean, branded = false, textOnly = false) {
  if (textOnly) {
    return cn(
      "inline-flex shrink-0 items-center gap-1.5 px-1 transition-colors",
      "font-serif text-[17px] capitalize tracking-wide",
      active ? "text-black" : "text-black hover:text-black/70",
    );
  }

  if (branded) {
    return moduleBrandedNavLinkClass(active);
  }

  return cn(
    "inline-flex h-[46px] shrink-0 items-center gap-1.5 rounded-lg border px-3 shadow-sm backdrop-blur-md transition-colors",
    subNavLabelClass,
    active
      ? "border-[var(--venue-primary)]/30 bg-[var(--venue-primary)]/15 text-[#3D421F]"
      : "border-black/10 bg-white/60 text-black/55 hover:bg-white/80 hover:text-[#3D421F]",
  );
}

function categoryTabClass(active: boolean) {
  return cn(
    "inline-flex h-[46px] shrink-0 items-center gap-1.5 rounded-lg border px-3 shadow-sm backdrop-blur-md transition-colors",
    subNavLabelClass,
    active
      ? "border-[var(--venue-primary)]/40 bg-[var(--venue-primary)]/20 text-[#3D421F] ring-1 ring-[var(--venue-primary)]/20"
      : "border-black/10 bg-white/60 text-black/55 hover:bg-white/80 hover:text-[#3D421F]",
  );
}

function ShortcutLink({
  item,
  active,
  sublabel,
  fallbackIcon,
  branded = false,
  textOnly = false,
}: {
  item: ModuleSidebarItem;
  active: boolean;
  sublabel?: string;
  fallbackIcon: LucideIcon;
  branded?: boolean;
  textOnly?: boolean;
}) {
  const Icon = item.icon ?? fallbackIcon;

  return (
    <ScopedLink href={item.href} className={shortcutBoxClass(active, branded, textOnly)}>
      <Icon
        className={cn(
          textOnly
            ? "h-4 w-4 shrink-0 text-black"
            : branded
              ? moduleBrandedNavIconClass(active)
              : "h-3.5 w-3.5 shrink-0 opacity-80",
        )}
        aria-hidden
      />
      {sublabel ? (
        <span className="min-w-0 leading-none">
          <span className="block text-[9px] font-medium uppercase tracking-wide text-black/45">
            {sublabel}
          </span>
          <span className="mt-0.5 block">{item.label}</span>
        </span>
      ) : (
        <span className="whitespace-nowrap">{item.label}</span>
      )}
      <NavigationPendingIndicator />
    </ScopedLink>
  );
}

/**
 * Categorised layout: compact category tabs (plus the branded settings pill)
 * that expand to reveal the apps belonging to the selected category. Mirrors
 * the dashboard module tabs so busy modules stay on a single line.
 */
function CategorizedShortcuts({
  moduleSidebar,
  categories,
  ariaLabel,
}: {
  moduleSidebar: ModuleSidebarDef;
  categories: ModuleSidebarCategory[];
  ariaLabel: string;
}) {
  const pathname = useRelativePathname();
  const itemByHref = new Map(
    moduleSidebar.items.map((item) => [item.href, item]),
  );

  const isCategoryActive = (category: ModuleSidebarCategory) =>
    category.itemHrefs.some((href) => {
      const item = itemByHref.get(href);
      return item ? isModuleSidebarItemActive(pathname, item) : false;
    });

  const initialKey =
    categories.find((category) => isCategoryActive(category))?.key ?? null;
  const [activeKey, setActiveKey] = useState<string | null>(initialKey);

  const activeCategory = categories.find(
    (category) => category.key === activeKey,
  );
  const activeItems =
    activeCategory?.itemHrefs
      .map((href) => itemByHref.get(href))
      .filter((item): item is ModuleSidebarItem => Boolean(item)) ?? [];

  return (
    <nav aria-label={ariaLabel}>
      <div className="flex w-full flex-wrap items-center justify-center gap-2">
        {categories.map((category) => {
          const Icon = category.icon;
          const active = category.key === activeKey;
          const hasActiveRoute = isCategoryActive(category);
          return (
            <button
              key={category.key}
              type="button"
              aria-pressed={active}
              onClick={() =>
                setActiveKey((current) =>
                  current === category.key ? null : category.key,
                )
              }
              className={cn(
                categoryTabClass(active),
                !active && hasActiveRoute && "text-[#3D421F]",
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
              <span className="whitespace-nowrap">{category.label}</span>
            </button>
          );
        })}
      </div>

      <AnimatePresence initial={false} mode="wait">
        {activeCategory ? (
          <motion.div
            key={activeCategory.key}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="mt-3 flex flex-wrap items-center justify-center gap-2 rounded-xl border border-[var(--venue-primary)]/15 bg-[var(--venue-primary)]/20 px-3 py-3 shadow-inner backdrop-blur-md"
          >
            {activeItems.map((item) => (
              <ShortcutLink
                key={item.href}
                item={item}
                active={isModuleSidebarItemActive(pathname, item)}
                fallbackIcon={activeCategory.icon}
                textOnly
              />
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </nav>
  );
}

export function ModuleShortcuts({
  basePath,
  ariaLabel,
}: ModuleShortcutsProps) {
  const pathname = useRelativePathname();
  const moduleSidebar = getModuleSidebarForPath(basePath);

  if (!moduleSidebar) {
    return null;
  }

  const resolvedAriaLabel = ariaLabel ?? `${moduleSidebar.label} apps`;

  if (moduleSidebar.categories && moduleSidebar.categories.length > 0) {
    return (
      <CategorizedShortcuts
        moduleSidebar={moduleSidebar}
        categories={moduleSidebar.categories}
        ariaLabel={resolvedAriaLabel}
      />
    );
  }

  const shortcuts = moduleSidebar.items.filter((item) => !item.exact);

  return (
    <nav
      aria-label={resolvedAriaLabel}
      className="flex w-full flex-wrap items-center justify-center gap-2"
    >
      {shortcuts.map((item) => (
        <ShortcutLink
          key={item.href}
          item={item}
          active={isModuleSidebarItemActive(pathname, item)}
          fallbackIcon={moduleSidebar.icon}
        />
      ))}
    </nav>
  );
}
