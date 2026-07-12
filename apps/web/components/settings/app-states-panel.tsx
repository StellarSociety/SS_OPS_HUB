"use client";

import { useMemo, useState, useTransition } from "react";
import { setAppModuleState } from "@/lib/actions/app-modules";
import type { AppModuleStateItem } from "@/lib/actions/app-modules";
import {
  APP_MODULE_STATES,
  moduleCategories,
  type AppModuleState,
} from "@/lib/modules-registry";
import { Card } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type AppStatesPanelProps = {
  items: AppModuleStateItem[];
};

function StateSwitch({
  active,
  disabled,
  onToggle,
}: {
  active: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50",
        active ? "bg-[var(--venue-primary,#818a40)]" : "bg-black/20",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
          active ? "left-[22px]" : "left-0.5",
        )}
      />
    </button>
  );
}

export function AppStatesPanel({ items }: AppStatesPanelProps) {
  const [states, setStates] = useState<Record<string, AppModuleState>>(() =>
    Object.fromEntries(items.map((i) => [i.key, i.state])),
  );
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const grouped = useMemo(
    () =>
      moduleCategories.map((category) => ({
        category,
        items: items.filter((i) => i.category === category.key),
      })),
    [items],
  );

  function handleToggle(moduleKey: string, target: AppModuleState) {
    const current = states[moduleKey] ?? "live";
    // Columns act as a single mutually-exclusive selection. Turning off the
    // active column returns the app to its live/default state.
    const next: AppModuleState = current === target ? "live" : target;

    const previous = current;
    setStates((prev) => ({ ...prev, [moduleKey]: next }));
    setPendingKey(moduleKey);

    startTransition(async () => {
      const result = await setAppModuleState(moduleKey, next);
      setPendingKey(null);
      if (result.error) {
        setStates((prev) => ({ ...prev, [moduleKey]: previous }));
        toast.error(result.error);
        return;
      }
      toast.saved(result.success ?? "Saved.");
    });
  }

  return (
    <div className="space-y-8">
      <p className="text-sm text-black/60">
        Control how each app appears in the Apps Hub across every venue. Leave
        all switches off to keep an app fully live.
      </p>

      {grouped.map(({ category, items: categoryItems }) =>
        categoryItems.length === 0 ? null : (
          <section key={category.key} className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-black/45">
              {category.label}
            </h2>

            <Card className="overflow-hidden p-0">
              <div className="hidden grid-cols-[1fr_repeat(3,7.5rem)] gap-2 border-b border-black/10 bg-black/[0.02] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-black/45 sm:grid">
                <span>App</span>
                {APP_MODULE_STATES.map((s) => (
                  <span key={s.key} className="text-center">
                    {s.label}
                  </span>
                ))}
              </div>

              <ul className="divide-y divide-black/[0.06]">
                {categoryItems.map((item) => {
                  const current = states[item.key] ?? "live";
                  const rowPending = pendingKey === item.key;
                  return (
                    <li
                      key={item.key}
                      className="grid grid-cols-2 items-center gap-y-3 px-4 py-3 sm:grid-cols-[1fr_repeat(3,7.5rem)] sm:gap-2"
                    >
                      <div className="col-span-2 sm:col-span-1">
                        <p className="text-sm font-medium text-[#3D421F]">
                          {item.label}
                        </p>
                        {current === "live" ? (
                          <p className="text-[11px] text-black/40">Live</p>
                        ) : null}
                      </div>

                      {APP_MODULE_STATES.map((s) => (
                        <div
                          key={s.key}
                          className="flex items-center gap-2 sm:justify-center"
                        >
                          <span className="text-xs text-black/50 sm:hidden">
                            {s.label}
                          </span>
                          <StateSwitch
                            active={current === s.key}
                            disabled={rowPending}
                            onToggle={() => handleToggle(item.key, s.key)}
                          />
                        </div>
                      ))}
                    </li>
                  );
                })}
              </ul>
            </Card>
          </section>
        ),
      )}
    </div>
  );
}
