"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { EyeOff, Search } from "lucide-react";
import { ModuleIcon } from "@/components/modules/module-icon";
import { AccessLevelSwitch } from "@/components/ui/access-level-switch";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { StatusBadge } from "@/components/hr/status-badge";
import type { AccessMatrixLevel } from "@/lib/access/matrix";
import { setPhoneAccess, setShortcutVisibility } from "@/lib/actions/phone-access";
import type { MobileAccessMatrixRow } from "@/lib/actions/mobile-user-access";
import { isShortcutOpen, type PhoneShortcut } from "@/lib/mobile/shortcuts";
import { getUserInitials } from "@/lib/user/display";
import { resolveAvatarUrl } from "@/lib/user/resolve-avatar-url";
import { cn } from "@/lib/utils";

type Props = {
  shortcuts: PhoneShortcut[];
  initialVisibility: Record<string, boolean>;
  rows: MobileAccessMatrixRow[];
  venueId: string;
  canEdit: boolean;
};

type AccessFilter = "all" | "open" | "closed";

const ACCESS_FILTERS: { value: AccessFilter; label: string }[] = [
  { value: "all", label: "Everyone" },
  { value: "open", label: "Has access" },
  { value: "closed", label: "No access" },
];

/** Critically damped: the knob and selection settle without bouncing. */
const SETTLE_SPRING = { type: "spring", bounce: 0, duration: 0.3 } as const;

/**
 * Pick a shortcut on the left, then choose who can open that one shortcut.
 * Every change saves straight away, one person and one shortcut at a time.
 */
export function MobileShortcutsClient({
  shortcuts,
  initialVisibility,
  rows: initialRows,
  venueId,
  canEdit,
}: Props) {
  const [selectedKey, setSelectedKey] = useState(shortcuts[0]?.key ?? "");
  const [visibility, setVisibility] = useState(initialVisibility);
  const [rows, setRows] = useState(initialRows);
  const [query, setQuery] = useState("");
  const [accessFilter, setAccessFilter] = useState<AccessFilter>("all");
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selected = shortcuts.find((shortcut) => shortcut.key === selectedKey) ?? null;
  const selectedVisible = selected ? visibility[selected.key] !== false : false;

  const filtered = useMemo(() => {
    if (!selected) return [];
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      const open = isShortcutOpen(row.levels[selected.key]);
      if (accessFilter === "open" && !open) return false;
      if (accessFilter === "closed" && open) return false;
      if (!q) return true;
      return (
        row.name.toLowerCase().includes(q) ||
        (row.empNo?.toLowerCase().includes(q) ?? false) ||
        (row.position?.toLowerCase().includes(q) ?? false) ||
        row.department.toLowerCase().includes(q)
      );
    });
  }, [rows, query, accessFilter, selected]);
  const staff = filtered.filter((row) => row.kind === "staff");
  const external = filtered.filter((row) => row.kind === "external");

  function openCount(shortcutKey: string) {
    return rows.filter((row) => isShortcutOpen(row.levels[shortcutKey])).length;
  }

  function patchLevels(rowKey: string, levels: Record<string, AccessMatrixLevel>) {
    setRows((current) =>
      current.map((row) => (row.key === rowKey ? { ...row, levels } : row)),
    );
  }

  function onLevel(row: MobileAccessMatrixRow, shortcutKey: string, level: AccessMatrixLevel) {
    if (!row.userId) {
      toast.alert("Invite this person first (Mobile App → Users Access).");
      return;
    }
    const previous = row.levels;
    patchLevels(row.key, { ...previous, [shortcutKey]: level });
    setPendingKey(row.key);
    startTransition(async () => {
      const result = await setPhoneAccess({
        userId: row.userId!,
        venueId,
        appKey: shortcutKey,
        level,
      });
      setPendingKey(null);
      if (result.error) {
        patchLevels(row.key, previous);
        toast.error(result.error);
        return;
      }
      if (result.switchedOn) {
        patchLevels(row.key, { ...previous, [shortcutKey]: level, mobile_app: "viewer" });
      }
      if (result.success) toast.saved(result.success);
    });
  }

  function onVisibility(shortcutKey: string, visible: boolean) {
    const previous = visibility[shortcutKey] ?? true;
    setVisibility((current) => ({ ...current, [shortcutKey]: visible }));
    startTransition(async () => {
      const result = await setShortcutVisibility({ venueId, shortcutKey, visible });
      if (result.error) {
        setVisibility((current) => ({ ...current, [shortcutKey]: previous }));
        toast.error(result.error);
        return;
      }
      if (result.success) toast.saved(result.success);
    });
  }

  function renderPerson(row: MobileAccessMatrixRow, shortcut: PhoneShortcut) {
    const busy = isPending && pendingKey === row.key;
    const photo = resolveAvatarUrl({
      staffPhotoUrl: row.photoUrl,
      preferStaffPhoto: row.kind === "staff",
    });
    const phoneOn = row.levels.mobile_app === "viewer" || row.levels.mobile_app === "editor";
    return (
      <tr key={row.key} className="border-t border-black/5 hover:bg-black/[0.015]">
        <td className="px-3 py-2">
          <div className="flex items-center gap-2.5">
            {photo ? (
              <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full border border-black/10">
                <Image src={photo} alt="" fill className="object-cover" unoptimized />
              </div>
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#3D421F] text-[10px] font-medium text-white">
                {getUserInitials(row.name, "")}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-[#3D421F]">{row.name}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-black/45">
                {row.empNo ? (
                  <span className="font-mono text-black/55">{row.empNo}</span>
                ) : (
                  <span>{row.kind === "external" ? "External" : "No emp no"}</span>
                )}
                {row.position ? <span className="truncate">{row.position}</span> : null}
                {row.employmentStatus ? <StatusBadge status={row.employmentStatus} /> : null}
              </p>
            </div>
          </div>
        </td>
        <td className="px-2 py-2 text-[11px]">
          {!row.userId ? (
            <span className="text-black/40">Not invited</span>
          ) : phoneOn ? (
            <span className="text-[var(--venue-primary,#818a40)]">On</span>
          ) : (
            <span className="text-rose-600">Off</span>
          )}
        </td>
        <td className="px-3 py-2 text-right">
          <AccessLevelSwitch
            name={`${shortcut.label} for ${row.name}`}
            value={row.levels[shortcut.key] ?? "none"}
            onChange={(level) => onLevel(row, shortcut.key, level)}
            disabled={!canEdit || busy || !row.userId}
          />
        </td>
      </tr>
    );
  }

  function renderGroup(title: string, list: MobileAccessMatrixRow[], shortcut: PhoneShortcut) {
    if (list.length === 0) return null;
    return (
      <>
        <tr>
          <td
            colSpan={3}
            className="bg-black/[0.03] px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-black/50"
          >
            {title} · {list.length}
          </td>
        </tr>
        {list.map((row) => renderPerson(row, shortcut))}
      </>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 gap-4 overflow-hidden">
      <aside className="flex w-64 shrink-0 flex-col gap-2 overflow-y-auto">
        <p className="px-1 text-[11px] font-medium uppercase tracking-wide text-black/50">
          1 · Choose a shortcut
        </p>
        <div role="listbox" aria-label="Shortcuts" className="flex flex-col gap-1.5">
          {shortcuts.map((shortcut) => {
            const active = shortcut.key === selectedKey;
            const visible = visibility[shortcut.key] !== false;
            const count = openCount(shortcut.key);
            return (
              <button
                key={shortcut.key}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => setSelectedKey(shortcut.key)}
                className="relative flex items-center gap-3 rounded-xl border border-black/10 bg-white p-3 text-left transition-transform active:scale-[0.98]"
              >
                {active ? (
                  <motion.span
                    layoutId="shortcut-selection"
                    transition={SETTLE_SPRING}
                    className="absolute inset-0 rounded-xl border-2 border-[var(--venue-primary,#818a40)] bg-[var(--venue-secondary,#F0F3DD)]/60"
                    aria-hidden
                  />
                ) : null}
                <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--venue-secondary,#F0F3DD)]">
                  <ModuleIcon iconKey={shortcut.iconKey} className="h-5 w-5 text-[#3D421F]" />
                </span>
                <span className="relative min-w-0 flex-1">
                  <span className="block truncate font-serif text-sm font-semibold text-[#3D421F]">
                    {shortcut.label}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1 text-[11px] text-black/50">
                    {visible ? (
                      `${count} with access`
                    ) : (
                      <>
                        <EyeOff className="h-3 w-3" aria-hidden />
                        Hidden on phones
                      </>
                    )}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      {selected ? (
        <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden">
          <p className="px-1 text-[11px] font-medium uppercase tracking-wide text-black/50">
            2 · Give employees access to {selected.label}
          </p>
          <div className="flex shrink-0 items-start gap-3 rounded-xl border border-black/10 bg-white p-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--venue-secondary,#F0F3DD)]">
              <ModuleIcon iconKey={selected.iconKey} className="h-6 w-6 text-[#3D421F]" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-serif text-lg font-semibold leading-tight text-[#3D421F]">
                {selected.label}
              </p>
              <p className="mt-1 text-xs leading-snug text-black/55">{selected.description}</p>
              <p className="mt-2 text-[11px] text-black/50">
                {selectedVisible
                  ? `Shown on phones at this venue · ${openCount(selected.key)} can open it`
                  : "Hidden on every phone at this venue, whatever each person's access."}
              </p>
            </div>
            <label className="flex shrink-0 items-center gap-2 text-xs text-black/60">
              Shown on phones
              <VisibilitySwitch
                label={`Show ${selected.label} on phones`}
                checked={selectedVisible}
                disabled={!canEdit}
                onChange={(next) => onVisibility(selected.key, next)}
              />
            </label>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-3">
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/35" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search employees"
                className="h-9 pl-9"
              />
            </div>
            <div
              role="radiogroup"
              aria-label="Filter by access"
              className="inline-flex rounded-full border border-black/10 bg-white p-0.5"
            >
              {ACCESS_FILTERS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={accessFilter === option.value}
                  onClick={() => setAccessFilter(option.value)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs transition-colors",
                    accessFilter === option.value
                      ? "bg-[#3D421F] text-white"
                      : "text-black/60 hover:text-[#3D421F]",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-black/50">
              Hidden: no tile · No access: tile locked · Viewer: opens · Editor: opens and can make
              changes
            </p>
          </div>

          <div
            className={cn(
              "min-h-0 flex-1 overflow-auto rounded-xl border border-black/10 bg-white",
              !selectedVisible && "opacity-60",
            )}
          >
            <table className="w-full border-collapse">
              <thead className="sticky top-0 z-10 bg-[var(--venue-secondary,#F0F3DD)]">
                <tr className="text-left text-[11px] font-medium uppercase tracking-wide text-black/50">
                  <th className="min-w-[240px] border-b border-black/10 px-3 py-2">Employee</th>
                  <th className="min-w-[90px] border-b border-black/10 px-2 py-2">Mobile app</th>
                  <th className="border-b border-black/10 px-3 py-2 text-right">
                    {selected.label} access
                  </th>
                </tr>
              </thead>
              <tbody>
                {renderGroup("Staff", staff, selected)}
                {renderGroup("External users", external, selected)}
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-8 text-center text-sm text-black/50">
                      {query.trim() ? `No one matches “${query}”.` : "No one in this list."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <p className="text-sm text-black/50">No shortcuts yet.</p>
      )}
    </div>
  );
}

function VisibilitySwitch({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200 active:scale-95",
        checked ? "justify-end bg-[var(--venue-primary,#818a40)]" : "justify-start bg-black/15",
        disabled && "opacity-40",
      )}
    >
      <motion.span
        layout
        transition={SETTLE_SPRING}
        className="h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25)]"
      />
    </button>
  );
}
