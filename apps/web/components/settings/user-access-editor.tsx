"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useUnsavedChangesGuard } from "@/components/use-unsaved-changes-guard";
import {
  BadgeCheck,
  Banknote,
  BookOpen,
  Boxes,
  Building2,
  CalendarCheck,
  CalendarDays,
  CalendarOff,
  Camera,
  ChartNoAxesCombined,
  ChevronDown,
  CircleCheckBig,
  ClipboardCheck,
  ClipboardList,
  Coins,
  CookingPot,
  DoorClosed,
  DoorOpen,
  FileBarChart,
  FileChartColumn,
  FileText,
  GitCompareArrows,
  Gift,
  GraduationCap,
  HandCoins,
  HardHat,
  IdCard,
  ListTodo,
  Landmark,
  Layers,
  LayoutDashboard,
  LineChart,
  Lock,
  Martini,
  Megaphone,
  MessagesSquare,
  MessageSquareQuote,
  PackageCheck,
  Percent,
  QrCode,
  Receipt,
  ReceiptText,
  Scale,
  ScanQrCode,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Shirt,
  Smartphone,
  Tag,
  Ticket,
  TrendingUp,
  UserMinus,
  UserPlus,
  UserRound,
  UserRoundSearch,
  Users,
  Utensils,
  Wallet,
  Wine,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { saveUserAccess } from "@/lib/actions/users";
import {
  ACCOUNT_ROLE_OPTIONS,
  APP_ROLE_OPTIONS,
  type AccessEditorState,
  type AppRole,
  type ModuleAccessConfig,
} from "@/lib/access/roles";
import { moduleOverviewRegistry } from "@/lib/modules-registry";
import { getModuleSidebarByKey } from "@/lib/module-sidebar";
import { ModuleIcon, VaultSafe, SafeLogHaccp } from "@/components/modules/module-icon";
import {
  getAssignableModules,
  featureHasEditorSwitch,
  getEditorSwitchKeysForModule,
  getFeatureDef,
  getGroupedSubPageKeys,
  getGroupedSubPagesForModule,
  getModuleLabel,
  getSensitiveFeaturesForModule,
  getSettingsFeatureForModule,
  getSubPagesForModule,
  type GroupedSubPageFeature,
  type ModuleFeatureEntry,
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

const MODULE_OVERVIEW = new Map(
  moduleOverviewRegistry.map((module) => [module.key, module]),
);

const FEATURE_ICONS: Partial<Record<string, LucideIcon>> = {
  "team_connect:messages": MessagesSquare,
  "team_connect:announcements": Megaphone,
  "operational_lists:shift_report": ClipboardList,
  "operational_lists:opening": DoorOpen,
  "operational_lists:closing": DoorClosed,
  "team_projects:projects": ListTodo,
  "events:events": CalendarDays,
  "cookbook:recipes": CookingPot,
  "poorbook:cocktails": Martini,
  "poorbook:wine": Wine,
  "poorbook:spirits": Wine,
  "maintenance:requests": Wrench,
  "maintenance:assets": Boxes,
  "sentiment:overview": LayoutDashboard,
  "sentiment:reviews": MessageSquareQuote,
  "sentiment:actions": ClipboardList,
  "guests_intel:overview": LayoutDashboard,
  "guests_intel:collect": QrCode,
  "guests_intel:guests": UserRound,
  "guests_intel:rewards": Gift,
  "guests_intel:redeem": ScanQrCode,
  "save_log:overview": LayoutDashboard,
  "save_log:logs": SafeLogHaccp,
  "sales:overview": LayoutDashboard,
  "sales:venue_daily": Coins,
  "sales:waiter_daily": UserRound,
  "sales:daily_vs_waiters": GitCompareArrows,
  "sales:cash_drawer": Tag,
  "sales:cash": Wallet,
  "sales:forecast": LineChart,
  "sales:vouchers": Ticket,
  "sales:cash_up": Camera,
  "sales:reports": FileBarChart,
  "sales:revenue_figures": TrendingUp,
  "gp_cos:invoices": FileText,
  "gp_cos:food_cost": Utensils,
  "gp_cos:beverages_cost": Wine,
  "gp_cos:margins": ChartNoAxesCombined,
  "accounting:overview": LayoutDashboard,
  "accounting:accounts": Landmark,
  "accounting:ledgers": BookOpen,
  "accounting:statements": FileChartColumn,
  "hr:overview": LayoutDashboard,
  "hr:staff": Users,
  "hr:staff_compliance": BadgeCheck,
  "hr:uniform": Shirt,
  "hr:assets": Boxes,
  "hr:certifications": GraduationCap,
  "hr:insurance": ShieldCheck,
  "hr:visa": IdCard,
  "hr:lookups": UserRoundSearch,
  "hr:schedules": CalendarDays,
  "hr:attendance_insights": LineChart,
  "hr:attendance": CalendarCheck,
  "hr:attendance_validation": ClipboardCheck,
  "hr:attendance_validator": CircleCheckBig,
  "hr:leave": CalendarOff,
  "hr:benefits": HandCoins,
  "hr:payroll": Wallet,
  "hr:payslips": ReceiptText,
  "hr:expenses": Receipt,
  "hr:communications": MessagesSquare,
  "hr:onboarding": UserPlus,
  "hr:offboarding": UserMinus,
  "hr:salary": Banknote,
  "hr:schedule_approval": PackageCheck,
  "learning:courses": BookOpen,
  "learning:progress": GraduationCap,
  "venue_governance:legal_docs": Scale,
  "venue_governance:contractors": HardHat,
  "venue_governance:compliance": BadgeCheck,
  "vault:documents": VaultSafe,
  "approvals:approvals": CircleCheckBig,
  "mobile_app:app": Smartphone,
};

const GROUP_ICONS: Record<string, LucideIcon> = {
  overview: LayoutDashboard,
  "staff-details": UserRound,
  attendance: CalendarCheck,
  pay: Wallet,
  boarding: UserPlus,
  "daily-figures": Coins,
  planning: LineChart,
  "close-of-day": Camera,
  reviews: MessageSquareQuote,
  actions: ClipboardList,
  collect: QrCode,
  guests: UserRound,
  rewards: Gift,
  logs: SafeLogHaccp,
  all: Layers,
  other: Layers,
};

function FeatureIcon({
  moduleKey,
  featureKey,
  className = "h-4 w-4",
}: {
  moduleKey: string;
  featureKey: string;
  className?: string;
}) {
  const mapped = FEATURE_ICONS[`${moduleKey}:${featureKey}`];
  const feature = mapped ? null : getFeatureDef(moduleKey, featureKey);
  const href = feature?.href;
  const sidebarItem = href
    ? getModuleSidebarByKey(moduleKey)?.items.find(
        (item) =>
          item.href === href ||
          (item.activePathPrefix
            ? href === item.activePathPrefix ||
              href.startsWith(`${item.activePathPrefix}/`)
            : false),
      )
    : undefined;
  const Icon =
    mapped ??
    sidebarItem?.icon ??
    (featureKey === "settings" ? Settings : Building2);
  return <Icon aria-hidden="true" className={className} />;
}

function EditorSwitch({
  checked,
  disabled,
  onToggle,
  label,
}: {
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={`Editor access for ${label}`}
      disabled={disabled}
      title={
        checked
          ? "Editor — can submit and change this page"
          : "View only — cannot submit or change this page"
      }
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onToggle();
      }}
      className={`relative inline-flex h-3.5 w-6 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        checked ? "bg-[#818a40]" : "bg-black/20"
      }`}
    >
      <span
        className={`absolute top-[1px] h-3 w-3 rounded-full bg-white shadow-sm transition-all ${
          checked ? "left-[11px]" : "left-[1px]"
        }`}
      />
    </button>
  );
}

function SubPageToggle({
  moduleKey,
  feature,
  checked,
  canEdit,
  editorEnabled,
  showEditor = true,
  onToggle,
  onEditorToggle,
}: {
  moduleKey: string;
  feature: ModuleFeatureEntry;
  checked: boolean;
  canEdit: boolean;
  editorEnabled: boolean;
  showEditor?: boolean;
  onToggle: () => void;
  onEditorToggle: () => void;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 rounded-md border border-black/10 bg-white px-2.5 py-2 text-sm">
      <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-1.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-black/20 accent-[#818a40]"
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-[#3D421F]">
            <FeatureIcon
              moduleKey={moduleKey}
              featureKey={feature.key}
              className="h-4 w-4 shrink-0 text-[#818a40]"
            />
            <span className="whitespace-normal break-words leading-snug">
              {feature.label}
            </span>
          </span>
          {feature.description ? (
            <span className="mt-0.5 block text-[11px] leading-snug text-black/45">
              {feature.description}
            </span>
          ) : null}
        </span>
      </label>
      {showEditor ? (
        <span className="flex shrink-0 items-center gap-1">
          {checked && canEdit ? (
            <span className="text-[9px] font-medium uppercase tracking-wide text-[#818a40]">
              Editor
            </span>
          ) : null}
          <EditorSwitch
            checked={checked && canEdit}
            disabled={!editorEnabled}
            onToggle={onEditorToggle}
            label={feature.label}
          />
        </span>
      ) : null}
    </div>
  );
}

function SubPageFeatureBlock({
  moduleKey,
  feature,
  selected,
  editPages,
  editorEnabled,
  onToggle,
  onEditorToggle,
}: {
  moduleKey: string;
  feature: GroupedSubPageFeature;
  selected: string[];
  editPages: string[];
  editorEnabled: boolean;
  onToggle: (key: string) => void;
  onEditorToggle: (key: string) => void;
}) {
  const hasChildren = feature.children.length > 0;
  return (
    <div className={hasChildren ? "sm:col-span-2 lg:col-span-3" : undefined}>
      <SubPageToggle
        moduleKey={moduleKey}
        feature={feature}
        checked={selected.includes(feature.key)}
        canEdit={editPages.includes(feature.key)}
        editorEnabled={editorEnabled}
        showEditor={!hasChildren && featureHasEditorSwitch(feature)}
        onToggle={() => onToggle(feature.key)}
        onEditorToggle={() => onEditorToggle(feature.key)}
      />
      {hasChildren ? (
        <div className="mt-2 ml-2 grid grid-cols-1 gap-2 border-l-2 border-[#818a40]/25 pl-3 sm:grid-cols-2 lg:grid-cols-3">
          {feature.children.map((child) => (
            <SubPageToggle
              key={child.key}
              moduleKey={moduleKey}
              feature={child}
              checked={selected.includes(child.key)}
              canEdit={editPages.includes(child.key)}
              editorEnabled={editorEnabled}
              showEditor={featureHasEditorSwitch(child)}
              onToggle={() => onToggle(child.key)}
              onEditorToggle={() => onEditorToggle(child.key)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function UserAccessEditor({
  userId,
  initialState,
  venues,
}: UserAccessEditorProps) {
  const [state, setState] = useState<AccessEditorState>(initialState);
  const [baseline, setBaseline] = useState(() => JSON.stringify(initialState));
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [isPending, startTransition] = useTransition();
  const onSaveRef = useRef<() => Promise<boolean>>(async () => false);

  const isDirty = JSON.stringify(state) !== baseline;

  onSaveRef.current = async () => {
    const result = await saveUserAccess(userId, state);
    if (result.error) {
      toast.error(result.error);
      return false;
    }
    setBaseline(JSON.stringify(state));
    toast.saved(result.success ?? "Saved.");
    return true;
  };

  const { unsavedDialog } = useUnsavedChangesGuard({
    isDirty,
    onSaveRef,
  });

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
    setExpanded(new Set());
  }

  function setModuleRole(moduleKey: string, role: AppRole) {
    const editorKeys = getEditorSwitchKeysForModule(moduleKey);
    setState((prev) => ({
      ...prev,
      modules: prev.modules.map((m) => {
        if (m.moduleKey !== moduleKey) return m;
        let editPages = m.editPages ?? [];
        if (m.role === "viewer" && role !== "viewer") {
          editPages = m.subPages.filter((key) => editorKeys.has(key));
        }
        return { ...m, role, editPages };
      }),
    }));
  }

  function toggleSubPage(moduleKey: string, key: string) {
    const editorKeys = getEditorSwitchKeysForModule(moduleKey);
    setState((prev) => ({
      ...prev,
      modules: prev.modules.map((m) => {
        if (m.moduleKey !== moduleKey) return m;
        const has = m.subPages.includes(key);
        const editPages = m.editPages ?? [];
        if (has) {
          return {
            ...m,
            subPages: m.subPages.filter((k) => k !== key),
            editPages: editPages.filter((k) => k !== key),
          };
        }
        return {
          ...m,
          subPages: [...m.subPages, key],
          editPages:
            m.role === "viewer" ||
            editPages.includes(key) ||
            !editorKeys.has(key)
              ? editPages
              : [...editPages, key],
        };
      }),
    }));
  }

  function togglePageEditor(moduleKey: string, key: string) {
    const editorKeys = getEditorSwitchKeysForModule(moduleKey);
    if (!editorKeys.has(key)) return;
    setState((prev) => ({
      ...prev,
      modules: prev.modules.map((m) => {
        if (m.moduleKey !== moduleKey) return m;
        const editPages = m.editPages ?? [];
        const hasEdit = editPages.includes(key);
        if (hasEdit) {
          return { ...m, editPages: editPages.filter((k) => k !== key) };
        }
        return {
          ...m,
          subPages: m.subPages.includes(key)
            ? m.subPages
            : [...m.subPages, key],
          editPages: [...editPages, key],
        };
      }),
    }));
  }

  function setSubPages(moduleKey: string, keys: string[], enabled: boolean) {
    const editorKeys = getEditorSwitchKeysForModule(moduleKey);
    setState((prev) => ({
      ...prev,
      modules: prev.modules.map((m) => {
        if (m.moduleKey !== moduleKey) return m;
        const keySet = new Set(keys);
        const editPages = m.editPages ?? [];
        if (enabled) {
          const next = new Set(m.subPages);
          const nextEdit = new Set(editPages);
          for (const key of keys) {
            next.add(key);
            if (m.role !== "viewer" && editorKeys.has(key)) nextEdit.add(key);
          }
          return { ...m, subPages: [...next], editPages: [...nextEdit] };
        }
        return {
          ...m,
          subPages: m.subPages.filter((k) => !keySet.has(k)),
          editPages: editPages.filter((k) => !keySet.has(k)),
        };
      }),
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
      await onSaveRef.current();
    });
  }

  const enabledCount = state.modules.filter((m) => m.enabled).length;

  return (
    <div className="space-y-4">
      {unsavedDialog}
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
                Enable apps, set a role, pick pages (grouped as they appear in
                the app), and control sensitive content per app.
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
            const subPageGroups = getGroupedSubPagesForModule(mod.key);
            const subPages = getSubPagesForModule(mod.key);
            const sensitive = getSensitiveFeaturesForModule(mod.key);
            const settingsFeature = getSettingsFeatureForModule(mod.key);
            const overview = MODULE_OVERVIEW.get(mod.key);
            const status = overview?.status;
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
                    {overview ? (
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--venue-secondary)]/60 text-[#3D421F]">
                        <ModuleIcon
                          iconKey={overview.iconKey}
                          className="h-5 w-5"
                        />
                      </span>
                    ) : null}
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
                    {config.enabled ? (
                      <ChevronDown
                        className={`ml-auto h-4 w-4 shrink-0 text-black/40 transition-transform ${
                          isOpen ? "rotate-180" : ""
                        }`}
                      />
                    ) : null}
                  </button>
                </div>

                {config.enabled && isOpen ? (
                  <div className="space-y-4 border-t border-black/10 p-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="space-y-1 text-xs">
                        <span className="text-black/50">Role</span>
                        <select
                          value={config.role}
                          onChange={(e) =>
                            setModuleRole(
                              mod.key,
                              e.target.value as AppRole,
                            )
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

                    {subPageGroups.length > 0 ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-black/40">
                              Pages this user can open
                            </p>
                            <p className="mt-0.5 text-[11px] text-black/40">
                              Editor lets them submit and change that page,
                              including on the Viewer role.
                            </p>
                          </div>
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
                                    setSubPages(
                                      mod.key,
                                      subPages.map((f) => f.key),
                                      e.target.checked,
                                    )
                                  }
                                  className="h-4 w-4 rounded border-black/20 accent-[#818a40]"
                                />
                                {allChecked
                                  ? "Deselect all pages"
                                  : "Select all pages"}
                              </label>
                            );
                          })()}
                        </div>
                        {subPageGroups.map((group) => {
                          const groupKeys = getGroupedSubPageKeys(group);
                          const selectedCount = groupKeys.filter((key) =>
                            config.subPages.includes(key),
                          ).length;
                          const allChecked =
                            groupKeys.length > 0 &&
                            selectedCount === groupKeys.length;
                          const GroupIcon = GROUP_ICONS[group.key] ?? Layers;
                          const groupedLikeNav =
                            group.key !== "all" && group.key !== "overview";
                          const grid = (
                            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                              {group.features.map((feature) => (
                                <SubPageFeatureBlock
                                  key={feature.key}
                                  moduleKey={mod.key}
                                  feature={feature}
                                  selected={config.subPages}
                                  editPages={config.editPages ?? []}
                                  editorEnabled
                                  onToggle={(key) =>
                                    toggleSubPage(mod.key, key)
                                  }
                                  onEditorToggle={(key) =>
                                    togglePageEditor(mod.key, key)
                                  }
                                />
                              ))}
                            </div>
                          );
                          if (!groupedLikeNav) {
                            return <div key={group.key}>{grid}</div>;
                          }
                          return (
                            <div
                              key={group.key}
                              className="space-y-2 rounded-lg border border-black/10 bg-black/[0.015] p-3"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-black/50">
                                  <GroupIcon className="h-3.5 w-3.5 text-[#818a40]" />
                                  {group.label}
                                  <span className="font-normal normal-case tracking-normal text-black/35">
                                    {selectedCount}/{groupKeys.length}
                                  </span>
                                </p>
                                <label className="flex cursor-pointer items-center gap-2 text-xs text-black/60">
                                  <input
                                    type="checkbox"
                                    checked={allChecked}
                                    ref={(el) => {
                                      if (el) {
                                        el.indeterminate =
                                          selectedCount > 0 &&
                                          selectedCount < groupKeys.length;
                                      }
                                    }}
                                    onChange={(e) =>
                                      setSubPages(
                                        mod.key,
                                        groupKeys,
                                        e.target.checked,
                                      )
                                    }
                                    className="h-4 w-4 rounded border-black/20 accent-[#818a40]"
                                  />
                                  {allChecked ? "Deselect" : "Select all"}
                                </label>
                              </div>
                              {grid}
                            </div>
                          );
                        })}
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
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
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
                                  <span className="flex items-center gap-2 text-[#3D421F]">
                                    <FeatureIcon
                                      moduleKey={mod.key}
                                      featureKey={f.key}
                                      className="h-4 w-4 shrink-0 text-amber-700"
                                    />
                                    <span>{f.label}</span>
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
