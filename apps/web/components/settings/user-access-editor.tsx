"use client";

import { useMemo, useState, useTransition } from "react";
import { ChevronDown, Layers, Lock, ShieldAlert } from "lucide-react";
import { saveUserAccess } from "@/lib/actions/users";
import {
  ACCOUNT_ROLE_OPTIONS,
  APP_ROLE_OPTIONS,
  type AccessEditorState,
  type AppRole,
  type ModuleAccessConfig,
} from "@/lib/access/roles";
import { moduleOverviewRegistry } from "@/lib/modules-registry";
import {
  getAssignableModules,
  getModuleLabel,
  getSensitiveFeaturesForModule,
  getSettingsFeatureForModule,
  getSubPagesForModule,
} from "@/lib/modules-catalog";
import type { Venue } from "@/lib/types/database";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";

type UserAccessEditorProps = {
  userId: string;
  initialState: AccessEditorState;
  venues: Venue[];
};

const MODULE_STATUS = new Map(
  moduleOverviewRegistry.map((m) => [m.key, m.status]),
);

export function UserAccessEditor({
  userId,
  initialState,
  venues,
}: UserAccessEditorProps) {
  const [state, setState] = useState<AccessEditorState>(initialState);
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(initialState.modules.filter((m) => m.enabled).map((m) => m.moduleKey)),
  );
  const [isPending, startTransition] = useTransition();

  const modules = useMemo(() => getAssignableModules(), []);
  const realVenues = useMemo(() => venues.filter((v) => !v.is_global), [venues]);

  function patchModule(moduleKey: string, patch: Partial<ModuleAccessConfig>) {
    setState((prev) => ({
      ...prev,
      modules: prev.modules.map((m) =>
        m.moduleKey === moduleKey ? { ...m, ...patch } : m,
      ),
    }));
  }

  function toggleExpanded(moduleKey: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(moduleKey)) next.delete(moduleKey);
      else next.add(moduleKey);
      return next;
    });
  }

  function toggleModule(moduleKey: string, enabled: boolean) {
    patchModule(moduleKey, { enabled });
    if (enabled) {
      setExpanded((prev) => new Set(prev).add(moduleKey));
    }
  }

  function setAllModules(enabled: boolean) {
    setState((prev) => ({
      ...prev,
      modules: prev.modules.map((m) => ({ ...m, enabled })),
    }));
    if (enabled) {
      setExpanded(new Set(modules.map((m) => m.key)));
    } else {
      setExpanded(new Set());
    }
  }

  function toggleSubPage(moduleKey: string, key: string) {
    setState((prev) => ({
      ...prev,
      modules: prev.modules.map((m) => {
        if (m.moduleKey !== moduleKey) return m;
        const has = m.subPages.includes(key);
        return {
          ...m,
          subPages: has
            ? m.subPages.filter((k) => k !== key)
            : [...m.subPages, key],
        };
      }),
    }));
  }

  function setAllSubPages(moduleKey: string, keys: string[], enabled: boolean) {
    setState((prev) => ({
      ...prev,
      modules: prev.modules.map((m) =>
        m.moduleKey === moduleKey
          ? { ...m, subPages: enabled ? [...keys] : [] }
          : m,
      ),
    }));
  }

  function toggleSensitive(moduleKey: string, key: string) {
    setState((prev) => ({
      ...prev,
      modules: prev.modules.map((m) => {
        if (m.moduleKey !== moduleKey) return m;
        const has = m.sensitive.includes(key);
        return {
          ...m,
          sensitive: has
            ? m.sensitive.filter((k) => k !== key)
            : [...m.sensitive, key],
        };
      }),
    }));
  }

  function handleSave() {
    startTransition(async () => {
      const result = await saveUserAccess(userId, state);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.saved(result.success ?? "Saved.");
    });
  }

  const enabledCount = state.modules.filter((m) => m.enabled).length;

  return (
    <div className="space-y-4">
      {/* Account role — Layer 2 (top tier) */}
      <Card className="space-y-4 p-4 sm:p-6">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 text-[#818a40]" />
          <div>
            <h2 className="font-serif text-xl text-[#3D421F]">Account role</h2>
            <p className="mt-1 text-sm text-black/60">
              Hub-wide privileges for user management. App access is set per app
              below.
            </p>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          {ACCOUNT_ROLE_OPTIONS.map((opt) => {
            const active = state.accountRole === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() =>
                  setState((prev) => ({ ...prev, accountRole: opt.value }))
                }
                className={`rounded-lg border p-3 text-left transition-colors ${
                  active
                    ? "border-[#818a40] bg-[var(--venue-secondary)]/50 ring-1 ring-[#818a40]"
                    : "border-black/10 bg-white hover:border-black/20"
                }`}
              >
                <p className="text-sm font-medium text-[#3D421F]">{opt.label}</p>
                <p className="mt-1 text-xs text-black/50">{opt.description}</p>
              </button>
            );
          })}
        </div>

        {state.accountRole === "venue_admin" ? (
          <label className="block space-y-1 text-xs">
            <span className="text-black/50">Venue Admin scope</span>
            <select
              value={state.accountVenueId ?? ""}
              onChange={(e) =>
                setState((prev) => ({
                  ...prev,
                  accountVenueId: e.target.value || null,
                }))
              }
              className="h-10 w-full max-w-xs rounded-md border border-black/10 px-2 text-sm"
            >
              <option value="">All venues (group-wide)</option>
              {realVenues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </Card>

      {/* App access — Layers 1, 3, 4 + per-app role */}
      <Card className="space-y-4 p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Layers className="mt-0.5 h-5 w-5 text-[#818a40]" />
            <div>
              <h2 className="font-serif text-xl text-[#3D421F]">App access</h2>
              <p className="mt-1 text-sm text-black/60">
                Enable apps, set a role, pick sub-pages, and control sensitive
                content per app.
              </p>
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-black/5 px-3 py-1 text-xs text-black/60">
            {enabledCount} enabled
          </span>
        </div>

        {modules.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-black/10 bg-black/[0.015] px-3 py-2">
            <span className="text-xs text-black/50">
              Quickly turn every app on or off for this user.
            </span>
            <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-black/70">
              <input
                type="checkbox"
                checked={enabledCount === modules.length}
                ref={(el) => {
                  if (el) {
                    el.indeterminate =
                      enabledCount > 0 && enabledCount < modules.length;
                  }
                }}
                onChange={(e) => setAllModules(e.target.checked)}
                className="h-4 w-4 rounded border-black/20 accent-[#818a40]"
              />
              {enabledCount === modules.length
                ? "Deactivate all apps"
                : "Activate all apps"}
            </label>
          </div>
        ) : null}

        <div className="space-y-3">
          {modules.map((mod) => {
            const config = state.modules.find((m) => m.moduleKey === mod.key);
            if (!config) return null;
            const isOpen = expanded.has(mod.key);
            const subPages = getSubPagesForModule(mod.key);
            const sensitive = getSensitiveFeaturesForModule(mod.key);
            const settingsFeature = getSettingsFeatureForModule(mod.key);
            const status = MODULE_STATUS.get(mod.key);
            const comingSoon = status && status !== "live";

            return (
              <div
                key={mod.key}
                className={`rounded-lg border transition-colors ${
                  config.enabled
                    ? "border-[#818a40]/40 bg-white"
                    : "border-black/10 bg-black/[0.015]"
                }`}
              >
                <div className="flex items-center gap-3 p-3">
                  <label className="relative inline-flex cursor-pointer items-center">
                    <input
                      type="checkbox"
                      checked={config.enabled}
                      onChange={(e) => toggleModule(mod.key, e.target.checked)}
                      className="peer sr-only"
                    />
                    <span className="h-5 w-9 rounded-full bg-black/20 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all peer-checked:bg-[#818a40] peer-checked:after:translate-x-4" />
                  </label>

                  <button
                    type="button"
                    onClick={() => config.enabled && toggleExpanded(mod.key)}
                    className="flex flex-1 items-center gap-2 text-left"
                  >
                    <span className="font-medium text-[#3D421F]">
                      {getModuleLabel(mod.key)}
                    </span>
                    {comingSoon ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700">
                        Coming soon
                      </span>
                    ) : null}
                    {config.enabled && config.suspended ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-red-700">
                        <Lock className="h-3 w-3" /> Suspended
                      </span>
                    ) : null}
                  </button>

                  {config.enabled ? (
                    <ChevronDown
                      className={`h-4 w-4 text-black/40 transition-transform ${
                        isOpen ? "rotate-180" : ""
                      }`}
                    />
                  ) : null}
                </div>

                {config.enabled && isOpen ? (
                  <div className="space-y-4 border-t border-black/10 p-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="space-y-1 text-xs">
                        <span className="text-black/50">Role</span>
                        <select
                          value={config.role}
                          onChange={(e) =>
                            patchModule(mod.key, {
                              role: e.target.value as AppRole,
                            })
                          }
                          className="h-10 w-full rounded-md border border-black/10 px-2 text-sm"
                        >
                          {APP_ROLE_OPTIONS.map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                        <span className="text-[11px] text-black/40">
                          {
                            APP_ROLE_OPTIONS.find((r) => r.value === config.role)
                              ?.description
                          }
                        </span>
                      </label>

                      <label className="space-y-1 text-xs">
                        <span className="text-black/50">Venue scope</span>
                        <select
                          value={config.venueId ?? ""}
                          onChange={(e) =>
                            patchModule(mod.key, {
                              venueId: e.target.value || null,
                            })
                          }
                          className="h-10 w-full rounded-md border border-black/10 px-2 text-sm"
                        >
                          <option value="">All venues (group-wide)</option>
                          {realVenues.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    {subPages.length > 0 ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-medium uppercase tracking-wide text-black/40">
                            Sub-pages
                          </p>
                          {(() => {
                            const allChecked = subPages.every((f) =>
                              config.subPages.includes(f.key),
                            );
                            return (
                              <label className="flex cursor-pointer items-center gap-2 text-xs text-black/60">
                                <input
                                  type="checkbox"
                                  checked={allChecked}
                                  onChange={(e) =>
                                    setAllSubPages(
                                      mod.key,
                                      subPages.map((f) => f.key),
                                      e.target.checked,
                                    )
                                  }
                                  className="h-4 w-4 rounded border-black/20 accent-[#818a40]"
                                />
                                {allChecked ? "Deselect all" : "Select all"}
                              </label>
                            );
                          })()}
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {subPages.map((f) => (
                            <label
                              key={f.key}
                              className="flex items-center gap-2 rounded-md border border-black/10 bg-white px-3 py-2 text-sm"
                            >
                              <input
                                type="checkbox"
                                checked={config.subPages.includes(f.key)}
                                onChange={() => toggleSubPage(mod.key, f.key)}
                                className="h-4 w-4 rounded border-black/20 accent-[#818a40]"
                              />
                              <span className="text-[#3D421F]">{f.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {sensitive.length > 0 ? (
                      <div className="space-y-2">
                        <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-black/40">
                          <ShieldAlert className="h-3.5 w-3.5" /> Sensitive content
                        </p>
                        <p className="text-[11px] leading-relaxed text-black/50">
                          Restricted data is hidden by default. Check an item to{" "}
                          <span className="font-medium text-[#3D421F]">
                            grant access
                          </span>{" "}
                          — the user will be able to view and manage it. Leave it
                          unchecked to{" "}
                          <span className="font-medium text-[#3D421F]">
                            deny access
                          </span>{" "}
                          — the user won&apos;t see it anywhere in this app.
                        </p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {sensitive.map((f) => {
                            const granted = config.sensitive.includes(f.key);
                            return (
                              <label
                                key={f.key}
                                className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50/50 px-3 py-2 text-sm"
                              >
                                <input
                                  type="checkbox"
                                  checked={granted}
                                  onChange={() => toggleSensitive(mod.key, f.key)}
                                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-black/20 accent-[#818a40]"
                                />
                                <span className="min-w-0">
                                  <span className="block text-[#3D421F]">
                                    {f.label}
                                  </span>
                                  {f.description ? (
                                    <span className="mt-0.5 block text-[11px] leading-snug text-black/50">
                                      {f.description}
                                    </span>
                                  ) : null}
                                  <span
                                    className={`mt-0.5 block text-[11px] font-medium ${
                                      granted ? "text-[#818a40]" : "text-black/40"
                                    }`}
                                  >
                                    {granted
                                      ? "Access granted — visible to this user"
                                      : "No access — hidden from this user"}
                                  </span>
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/5 pt-3">
                      {settingsFeature ? (
                        <p className="text-[11px] text-black/40">
                          {config.role === "app_admin"
                            ? "Includes app settings access."
                            : "Settings access requires the App Admin role."}
                        </p>
                      ) : (
                        <span />
                      )}
                      <label className="flex items-center gap-2 text-xs text-black/60">
                        <input
                          type="checkbox"
                          checked={config.suspended}
                          onChange={(e) =>
                            patchModule(mod.key, { suspended: e.target.checked })
                          }
                          className="h-4 w-4 rounded border-black/20 accent-red-500"
                        />
                        Temporarily block this app
                      </label>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-2 border-t border-black/10 pt-4">
          <Button type="button" disabled={isPending} onClick={handleSave}>
            {isPending ? "Saving…" : "Save access"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
