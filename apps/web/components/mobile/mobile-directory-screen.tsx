"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Image from "next/image";
import {
  ArrowLeft,
  Cake,
  ChevronDown,
  Mail,
  PartyPopper,
  Search,
} from "lucide-react";
import { MobileTabBar } from "@/components/mobile/mobile-tab-bar";
import { MobilePressTarget } from "@/components/mobile/mobile-press";
import {
  celebrationCaption,
  celebrationWindow,
  formatDayMonth,
  formatOrdinalDayMonth,
  listAnniversaryCelebrations,
  listBirthdayCelebrations,
} from "@/lib/directory/celebrations";
import {
  directoryWhatsappUrl,
  mailtoUrl,
  phoneTelUrl,
} from "@/lib/directory/links";
import type { DirectoryStaffMember } from "@/lib/directory/types";
import {
  stripHireNodes,
  type HierarchyNode,
} from "@/lib/directory/hierarchy-tree";
import { formatDisplayDate } from "@/lib/dates/display";
import {
  PhotoPlaceholderMark,
  StaffPhotoPreview,
} from "@/components/hr/staff-photo-thumbnail";
import { nationalityDisplay } from "@/lib/hr/nationality-flag";
import type { MobileTabItem } from "@/lib/mobile/tab-bars";
import { firstLastName } from "@/lib/user/display";
import type { Venue } from "@/lib/types/database";
import { cn } from "@/lib/utils";
import { useMobileInAppBack } from "@/components/mobile/use-mobile-in-app-back";
import { packOrgTreeLeaves } from "@/components/directory/pack-org-tree-leaves";
import "@/components/directory/directory-hierarchy-tree.css";

export type MobileDirectoryTab = "staff" | "celebrations" | "hierarchy";

type MobileDirectoryScreenProps = {
  venue: Venue;
  tab: MobileDirectoryTab;
  staff: DirectoryStaffMember[];
  hierarchy?: HierarchyNode[];
  onSelectTab?: (tab: MobileTabItem) => void;
};

function dash(value: string | null | undefined): string {
  return value?.trim() || "—";
}

function formatIsoDate(value: string | null | undefined): string {
  const iso = value?.trim().slice(0, 10) ?? "";
  if (!iso) return "—";
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? formatDisplayDate(iso) : iso;
}

export function MobileDirectoryScreen({
  venue,
  tab,
  staff,
  hierarchy = [],
  onSelectTab,
}: MobileDirectoryScreenProps) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hierarchyFocusId, setHierarchyFocusId] = useState<string | null>(null);
  const [hierarchyCollapsedIds, setHierarchyCollapsedIds] = useState<
    string[] | null
  >(null);
  const selected = staff.find((member) => member.id === selectedId) ?? null;

  useEffect(() => {
    setSelectedId(null);
    setQuery("");
    if (tab !== "hierarchy") {
      setHierarchyFocusId(null);
      setHierarchyCollapsedIds(null);
    }
  }, [tab]);

  useEffect(() => {
    if (!selected) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  const activeId =
    tab === "celebrations"
      ? "celebrations"
      : tab === "hierarchy"
        ? "hierarchy"
        : "staff";

  return (
    <div
      className="mobile-app-canvas relative flex h-full min-h-0 flex-col"
      style={
        {
          "--venue-primary": venue.primary_color,
          "--venue-secondary": venue.secondary_color,
        } as CSSProperties
      }
    >
      {selected ? (
        <StaffDetail
          member={selected}
          backLabel={
            tab === "hierarchy"
              ? "Hierarchy"
              : tab === "celebrations"
                ? "Celebrations"
                : "Staff"
          }
          onBack={() => setSelectedId(null)}
        />
      ) : tab === "celebrations" ? (
        <CelebrationsPane staff={staff} onOpen={setSelectedId} />
      ) : tab === "hierarchy" ? (
        <HierarchyPane
          venueName={venue.name}
          staff={staff}
          roots={hierarchy}
          focusedId={hierarchyFocusId}
          onFocus={setHierarchyFocusId}
          collapsedIds={hierarchyCollapsedIds}
          onCollapsedIdsChange={setHierarchyCollapsedIds}
          onOpen={setSelectedId}
        />
      ) : (
        <StaffPane
          venueName={venue.name}
          staff={staff}
          query={query}
          onQueryChange={setQuery}
          onOpen={setSelectedId}
        />
      )}

      {selected ? null : (
        <MobileTabBar
          app="directory"
          activeId={activeId}
          venueSlug={venue.slug}
          onSelectTab={onSelectTab}
        />
      )}
    </div>
  );
}

function ScreenTitle({ children }: { children: ReactNode }) {
  return (
    <h1 className="text-center font-serif text-2xl font-semibold text-[#3D421F] dark:text-[CanvasText]">
      {children}
    </h1>
  );
}

function StaffPane({
  venueName,
  staff,
  query,
  onQueryChange,
  onOpen,
}: {
  venueName: string;
  staff: DirectoryStaffMember[];
  query: string;
  onQueryChange: (value: string) => void;
  onOpen: (id: string) => void;
}) {
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return staff;
    return staff.filter((member) => {
      return (
        member.fullName.toLowerCase().includes(q) ||
        member.departmentName?.toLowerCase().includes(q) ||
        member.positionName?.toLowerCase().includes(q) ||
        member.empNo.toLowerCase().includes(q)
      );
    });
  }, [query, staff]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-32 pt-4">
      <ScreenTitle>{venueName} Directory</ScreenTitle>
      <p className="mt-1 text-center text-sm text-black/50 dark:text-white/50">
        {staff.length} people
      </p>
      <hr className="mt-3 border-black/10 dark:border-white/12" />

      <label className="relative mt-3 block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/35 dark:text-white/40" />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search name, department…"
          className="h-10 w-full rounded-xl border border-black/10 bg-white/70 pl-9 pr-3 text-sm text-[#3D421F] outline-none placeholder:text-black/35 focus:border-[var(--venue-primary,#6B7B3A)] dark:border-white/12 dark:bg-white/10 dark:text-[CanvasText] dark:placeholder:text-white/40"
        />
      </label>

      <div className="mt-3 space-y-2">
        {filtered.length === 0 ? (
          <p className="px-1 py-8 text-center text-sm text-black/45 dark:text-white/45">
            No staff match that search.
          </p>
        ) : (
          filtered.map((member) => (
            <StaffCard
              key={member.id}
              member={member}
              onOpen={() => onOpen(member.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function StaffCard({
  member,
  onOpen,
}: {
  member: DirectoryStaffMember;
  onOpen: () => void;
}) {
  return (
    <MobilePressTarget
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-2xl border border-black/10 bg-white/75 px-3 py-2.5 text-left dark:border-white/12 dark:bg-white/10"
    >
      <StaffAvatar member={member} size="md" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-[#3D421F] dark:text-[CanvasText]">
          {member.fullName}
        </p>
        <p className="mt-0.5 truncate text-xs text-black/50 dark:text-white/50">
          {dash(member.departmentName)}
        </p>
        <p className="truncate text-xs text-black/45 dark:text-white/45">
          {dash(member.positionName)}
        </p>
      </div>
    </MobilePressTarget>
  );
}

function StaffDetail({
  member,
  backLabel,
  onBack,
}: {
  member: DirectoryStaffMember;
  backLabel: string;
  onBack: () => void;
}) {
  const rootRef = useMobileInAppBack<HTMLDivElement>(onBack);
  const nationality = nationalityDisplay(member.nationalityName);
  const phoneUrl = phoneTelUrl(member.contactPhone);
  const whatsappUrl = directoryWhatsappUrl(member.whatsapp);
  const personalMailto = mailtoUrl(member.personalEmail);
  const workMailto = mailtoUrl(member.workEmail);

  return (
    <div ref={rootRef} className="min-h-0 flex-1 overflow-y-auto px-3 pb-8 pt-3">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 rounded-full px-1 py-1 text-sm font-medium text-[#3D421F] dark:text-[CanvasText]"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={2} />
        {backLabel}
      </button>

      <div className="mt-3 flex flex-col items-center gap-3">
        <StaffAvatar member={member} size="lg" />
        <div className="text-center">
          <p className="font-serif text-xl text-[#3D421F] dark:text-[CanvasText]">
            {member.fullName}
          </p>
          <p className="mt-0.5 text-sm text-black/50 dark:text-white/50">
            {dash(member.positionName)}
          </p>
          <p className="text-xs text-black/40 dark:text-white/40">
            {dash(member.departmentName)}
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-2 rounded-2xl border border-black/10 bg-white/75 p-3 dark:border-white/12 dark:bg-white/10">
        <DetailRow
          label="Nationality"
          value={
            nationality
              ? [nationality.flag, nationality.label].filter(Boolean).join(" ")
              : "—"
          }
        />
        <DetailRow label="Birthday" value={formatOrdinalDayMonth(member.dob)} />
        <DetailRow label="Joining date" value={formatIsoDate(member.joiningDate)} />
        <DetailRow
          label="Contact phone"
          value={dash(member.contactPhone)}
          href={phoneUrl}
        />
        <DetailRow
          label="WhatsApp"
          value={dash(member.whatsapp)}
          href={whatsappUrl}
          external
        />
        <DetailRow
          label="Personal email"
          value={dash(member.personalEmail)}
          href={personalMailto}
          icon="mail"
        />
        <DetailRow
          label="Work email"
          value={dash(member.workEmail)}
          href={workMailto}
          icon="mail"
        />
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  href,
  external,
  icon,
}: {
  label: string;
  value: string;
  href?: string | null;
  external?: boolean;
  icon?: "mail";
}) {
  const linked = Boolean(href);
  const content = (
    <>
      <p className="text-[11px] uppercase tracking-wide text-black/40 dark:text-white/40">
        {label}
      </p>
      <p className="mt-0.5 flex items-center gap-1.5 text-sm text-[#3D421F] dark:text-[CanvasText]">
        {icon === "mail" && linked ? (
          <Mail className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
        ) : null}
        <span className="min-w-0 break-all">{value}</span>
      </p>
    </>
  );

  if (!href) {
    return <div className="rounded-xl px-1 py-1.5">{content}</div>;
  }

  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      className="block rounded-xl px-1 py-1.5 underline-offset-2 hover:bg-black/[0.04] hover:underline dark:hover:bg-white/[0.06]"
    >
      {content}
    </a>
  );
}

function CelebrationsPane({
  staff,
  onOpen,
}: {
  staff: DirectoryStaffMember[];
  onOpen: (id: string) => void;
}) {
  const window = celebrationWindow();
  const birthdays = listBirthdayCelebrations(staff);
  const anniversaries = listAnniversaryCelebrations(staff);
  const rangeLabel = `${formatDisplayDate(window.startIso)} – ${formatDisplayDate(window.endIso)}`;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-32 pt-4">
      <ScreenTitle>Celebrations</ScreenTitle>
      <p className="mt-1 text-center text-sm text-black/50 dark:text-white/50">
        {rangeLabel}
      </p>
      <hr className="mt-3 border-black/10 dark:border-white/12" />

      <CelebrationSection
        title="Birthdays"
        icon={Cake}
        empty="No birthdays in this window."
        items={birthdays}
        onOpen={onOpen}
      />
      <CelebrationSection
        title="Work anniversaries"
        icon={PartyPopper}
        empty="No work anniversaries in this window."
        items={anniversaries}
        onOpen={onOpen}
      />
    </div>
  );
}

function CelebrationSection({
  title,
  icon: Icon,
  empty,
  items,
  onOpen,
}: {
  title: string;
  icon: typeof Cake;
  empty: string;
  items: ReturnType<typeof listBirthdayCelebrations>;
  onOpen: (id: string) => void;
}) {
  return (
    <section className="mt-4">
      <h2 className="flex items-center gap-1.5 px-1 font-serif text-sm font-semibold text-[#3D421F] dark:text-[CanvasText]">
        <Icon className="h-4 w-4" strokeWidth={2} />
        {title}
        <span className="ml-auto text-[11px] font-normal text-black/40 dark:text-white/40">
          {items.length}
        </span>
      </h2>
      {items.length === 0 ? (
        <p className="mt-2 px-1 text-sm text-black/45 dark:text-white/45">{empty}</p>
      ) : (
        <div className="mt-2 space-y-2">
          {items.map((item) => (
            <MobilePressTarget
              key={`${item.kind}-${item.staffId}`}
              onClick={() => onOpen(item.staffId)}
              className={cn(
                "flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left",
                item.daysFromToday === 0
                  ? "border-[var(--venue-primary,#6B7B3A)]/35 bg-[var(--venue-primary,#6B7B3A)]/12"
                  : "border-black/10 bg-white/75 dark:border-white/12 dark:bg-white/10",
              )}
            >
              <StaffAvatar member={item.member} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-[#3D421F] dark:text-[CanvasText]">
                  {item.member.fullName}
                </p>
                <p className="mt-0.5 truncate text-xs text-black/50 dark:text-white/50">
                  {item.kind === "anniversary" && item.years
                    ? `${item.years} year${item.years === 1 ? "" : "s"} · ${formatDayMonth(item.occurrenceDate)}`
                    : formatOrdinalDayMonth(item.occurrenceDate)}
                </p>
              </div>
              <span className="shrink-0 text-right text-[11px] font-medium text-black/45 dark:text-white/45">
                {celebrationCaption(item.daysFromToday)}
              </span>
            </MobilePressTarget>
          ))}
        </div>
      )}
    </section>
  );
}

function flattenHierarchyNodes(nodes: HierarchyNode[]): HierarchyNode[] {
  const out: HierarchyNode[] = [];
  function walk(list: HierarchyNode[]) {
    for (const node of list) {
      out.push(node);
      walk(node.children);
    }
  }
  walk(nodes);
  return out;
}

function pathToNode(roots: HierarchyNode[], staffId: string): HierarchyNode[] {
  for (const node of roots) {
    if (node.staffId === staffId) return [node];
    const nested = pathToNode(node.children, staffId);
    if (nested.length > 0) return [node, ...nested];
  }
  return [];
}

function labeledBranchStaffIds(nodes: HierarchyNode[]): string[] {
  const ids: string[] = [];
  function visit(list: HierarchyNode[]) {
    for (const node of list) {
      if (node.label?.trim() && node.children.length > 0) {
        ids.push(node.staffId);
      }
      visit(node.children);
    }
  }
  visit(nodes);
  return ids;
}

function rowHasLabel(nodes: HierarchyNode[]) {
  return nodes.some((node) => Boolean(node.label?.trim()));
}

function rowHasEmphasis(nodes: HierarchyNode[]) {
  return nodes.some((node) => node.highlighted);
}

function HierarchyPane({
  venueName,
  staff,
  roots,
  focusedId,
  onFocus,
  collapsedIds,
  onCollapsedIdsChange,
  onOpen,
}: {
  venueName: string;
  staff: DirectoryStaffMember[];
  roots: HierarchyNode[];
  focusedId: string | null;
  onFocus: (id: string | null) => void;
  collapsedIds: string[] | null;
  onCollapsedIdsChange: (ids: string[]) => void;
  onOpen: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const scrollerRef = useRef<HTMLDivElement>(null);
  const treeRef = useRef<HTMLUListElement>(null);
  const byId = useMemo(
    () => new Map(staff.map((member) => [member.id, member])),
    [staff],
  );
  const reportingRoots = useMemo(() => stripHireNodes(roots), [roots]);
  const chartPeople = useMemo(
    () => flattenHierarchyNodes(reportingRoots),
    [reportingRoots],
  );
  const collapsed = useMemo(() => {
    return new Set(collapsedIds ?? labeledBranchStaffIds(reportingRoots));
  }, [collapsedIds, reportingRoots]);

  const searching = search.trim().length > 0;
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return chartPeople.filter((node) => {
      const member = byId.get(node.staffId);
      return (
        member?.fullName.toLowerCase().includes(q) ||
        member?.positionName?.toLowerCase().includes(q) ||
        member?.departmentName?.toLowerCase().includes(q) ||
        member?.empNo.toLowerCase().includes(q) ||
        node.label?.toLowerCase().includes(q)
      );
    });
  }, [byId, chartPeople, search]);

  useLayoutEffect(() => {
    const tree = treeRef.current;
    const scroller = scrollerRef.current;
    if (!tree || !scroller || searching) return;
    packOrgTreeLeaves(tree);
  }, [reportingRoots, collapsed, searching]);

  useLayoutEffect(() => {
    const tree = treeRef.current;
    const scroller = scrollerRef.current;
    if (!tree || !scroller || searching) return;

    let cancelled = false;

    const centerCanvas = () => {
      if (cancelled) return;
      packOrgTreeLeaves(tree);
      const extra = scroller.scrollWidth - scroller.clientWidth;
      scroller.scrollLeft = extra > 0 ? extra / 2 : 0;
      scroller.scrollTop = 0;
    };

    centerCanvas();
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(centerCanvas);
    });

    const images = Array.from(tree.querySelectorAll("img"));
    for (const img of images) {
      if (!img.complete) {
        img.addEventListener("load", centerCanvas);
        img.addEventListener("error", centerCanvas);
      }
    }

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      for (const img of images) {
        img.removeEventListener("load", centerCanvas);
        img.removeEventListener("error", centerCanvas);
      }
    };
  }, [reportingRoots, searching]);

  useEffect(() => {
    if (!focusedId || searching) return;
    const el = scrollerRef.current?.querySelector(
      `[data-org-staff-id="${CSS.escape(focusedId)}"]`,
    );
    el?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
  }, [focusedId, searching]);

  function setCollapsed(next: Set<string>) {
    onCollapsedIdsChange([...next]);
  }

  function toggle(staffId: string) {
    const next = new Set(collapsed);
    if (next.has(staffId)) next.delete(staffId);
    else next.add(staffId);
    setCollapsed(next);
  }

  function jumpTo(staffId: string) {
    const next = new Set(collapsed);
    for (const node of pathToNode(reportingRoots, staffId)) {
      if (node.staffId !== staffId) next.delete(node.staffId);
    }
    setCollapsed(next);
    onFocus(staffId);
    setSearch("");
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-3 pt-4">
        <ScreenTitle>{venueName} Hierarchy</ScreenTitle>
        <p className="mt-1 text-center text-sm text-black/50 dark:text-white/50">
          Who reports to whom
        </p>
        <hr className="mt-3 border-black/10 dark:border-white/12" />
        {reportingRoots.length > 0 ? (
          <label className="relative mt-3 block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/35 dark:text-white/40" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Find someone on the chart…"
              className="h-10 w-full rounded-xl border border-black/10 bg-white/70 pl-9 pr-3 text-sm text-[#3D421F] outline-none placeholder:text-black/35 focus:border-[var(--venue-primary,#6B7B3A)] dark:border-white/12 dark:bg-white/10 dark:text-[CanvasText] dark:placeholder:text-white/40"
            />
          </label>
        ) : null}
      </div>

      {reportingRoots.length === 0 ? (
        <p className="mt-8 px-5 text-center text-sm leading-relaxed text-black/50 dark:text-white/50">
          The reporting tree has not been built yet.
        </p>
      ) : searching ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-32 pt-3">
          {matches.length === 0 ? (
            <p className="px-1 py-8 text-center text-sm text-black/45 dark:text-white/45">
              No one on the chart matches that search.
            </p>
          ) : (
            <div className="space-y-2">
              {matches.map((node) => {
                const member = byId.get(node.staffId);
                return (
                  <MobilePressTarget
                    key={node.staffId}
                    onClick={() => jumpTo(node.staffId)}
                    className="flex w-full items-center gap-3 rounded-2xl border border-black/10 bg-white/75 px-3 py-2.5 text-left dark:border-white/12 dark:bg-white/10"
                  >
                    {member ? (
                      <StaffAvatar member={member} size="md" />
                    ) : (
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-black/10 text-xs text-black/40">
                        ?
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-[#3D421F] dark:text-[CanvasText]">
                        {member ? firstLastName(member.fullName) : "Unknown"}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-black/50 dark:text-white/50">
                        {dash(member?.positionName)}
                      </p>
                      {node.label?.trim() ? (
                        <p className="mt-0.5 truncate text-[11px] font-semibold text-[var(--venue-primary,#6B7B3A)]">
                          {node.label}
                        </p>
                      ) : null}
                    </div>
                  </MobilePressTarget>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div
          ref={scrollerRef}
          className="min-h-0 flex-1 overflow-auto pb-32 pt-3"
        >
          <ul ref={treeRef} className="dir-org-tree dir-org-tree-mobile">
            {reportingRoots.map((node) => (
              <MobileHierarchyBranch
                key={node.staffId}
                node={node}
                byId={byId}
                collapsedIds={collapsed}
                focusedId={focusedId}
                onToggle={toggle}
                onOpen={onOpen}
                reserveLabel={rowHasLabel(reportingRoots)}
                reserveEmphasis={rowHasEmphasis(reportingRoots)}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function MobileHierarchyBranch({
  node,
  byId,
  collapsedIds,
  focusedId,
  onToggle,
  onOpen,
  reserveLabel,
  reserveEmphasis,
}: {
  node: HierarchyNode;
  byId: Map<string, DirectoryStaffMember>;
  collapsedIds: Set<string>;
  focusedId: string | null;
  onToggle: (staffId: string) => void;
  onOpen: (staffId: string) => void;
  reserveLabel: boolean;
  reserveEmphasis: boolean;
}) {
  const member = byId.get(node.staffId);
  const leftCollabs = (node.collabs ?? []).filter((collab) => collab.side === "left");
  const rightCollabs = (node.collabs ?? []).filter((collab) => collab.side === "right");
  const emphasized = Boolean(node.highlighted);
  const hasBranch = node.children.length > 0;
  const branchCollapsed = collapsedIds.has(node.staffId);
  const showChildren = hasBranch && !branchCollapsed;
  const name = firstLastName(member?.fullName) || "Unknown";

  return (
    <li
      className={cn(
        reserveLabel && "dir-org-row-labels",
        reserveEmphasis && "dir-org-row-emphasis",
        !showChildren && "dir-org-leaf",
      )}
    >
      <div className="dir-org-person">
        {leftCollabs.length > 0 ? (
          <div className="dir-org-collabs dir-org-collabs-left">
            {leftCollabs.map((collab) => (
              <MobileCollabChip
                key={collab.staffId}
                member={byId.get(collab.staffId)}
                onOpen={
                  byId.has(collab.staffId)
                    ? () => onOpen(collab.staffId)
                    : undefined
                }
              />
            ))}
            <span className="dir-org-collab-line" aria-hidden />
          </div>
        ) : null}
        <div className="dir-org-card-stack">
          {node.label ? (
            <div className="dir-org-label">
              <p className="dir-org-label-badge">{node.label}</p>
            </div>
          ) : null}
          <div className="relative inline-flex">
            <button
              type="button"
              data-org-staff-id={node.staffId}
              onClick={() => (member ? onOpen(node.staffId) : undefined)}
              className={cn(
                "dir-org-node relative flex select-none flex-col items-center rounded-2xl border px-2 py-2 text-center",
                emphasized
                  ? "dir-org-node-emphasis w-32 border-[#9A9A94] py-2.5"
                  : "w-28 border-black/10 bg-white/80 dark:border-white/12 dark:bg-white/10",
                focusedId === node.staffId &&
                  "ring-2 ring-[var(--venue-primary,#6B7B3A)]/40",
              )}
            >
              {member ? (
                <StaffAvatar
                  member={member}
                  size="md"
                  emphasized={emphasized}
                />
              ) : (
                <div
                  className={cn(
                    "flex shrink-0 items-center justify-center rounded-2xl bg-black/10 text-xs text-black/40",
                    emphasized ? "h-16 w-16" : "h-12 w-12",
                  )}
                >
                  ?
                </div>
              )}
              <p
                className={cn(
                  "mt-1.5 w-full truncate font-medium leading-tight",
                  emphasized
                    ? "text-sm text-[#3D421F]"
                    : "text-xs text-[#3D421F] dark:text-[CanvasText]",
                )}
              >
                {name}
              </p>
              <p
                className={cn(
                  "mt-0.5 w-full truncate leading-tight",
                  emphasized
                    ? "text-[10px] text-black/50"
                    : "text-[10px] text-black/45 dark:text-white/45",
                )}
              >
                {member?.positionName?.trim() || "—"}
              </p>
            </button>
            {hasBranch ? (
              <button
                type="button"
                aria-expanded={!branchCollapsed}
                aria-label={
                  branchCollapsed
                    ? `Show reports under ${name}`
                    : `Hide reports under ${name}`
                }
                onClick={(event) => {
                  event.stopPropagation();
                  onToggle(node.staffId);
                }}
                className={cn(
                  "absolute -bottom-1.5 -right-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-black/10 bg-white text-black/45 shadow-sm dark:border-white/15 dark:bg-[#2a2a2a] dark:text-white/55",
                  branchCollapsed && "text-[var(--venue-primary,#6B7B3A)]",
                )}
              >
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 transition-transform",
                    branchCollapsed && "-rotate-90",
                  )}
                  strokeWidth={2}
                />
              </button>
            ) : null}
          </div>
        </div>
        {rightCollabs.length > 0 ? (
          <div className="dir-org-collabs dir-org-collabs-right">
            <span className="dir-org-collab-line" aria-hidden />
            {rightCollabs.map((collab) => (
              <MobileCollabChip
                key={collab.staffId}
                member={byId.get(collab.staffId)}
                onOpen={
                  byId.has(collab.staffId)
                    ? () => onOpen(collab.staffId)
                    : undefined
                }
              />
            ))}
          </div>
        ) : null}
      </div>
      {showChildren ? (
        <ul>
          {node.children.map((child) => (
            <MobileHierarchyBranch
              key={child.staffId}
              node={child}
              byId={byId}
              collapsedIds={collapsedIds}
              focusedId={focusedId}
              onToggle={onToggle}
              onOpen={onOpen}
              reserveLabel={rowHasLabel(node.children)}
              reserveEmphasis={rowHasEmphasis(node.children)}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function MobileCollabChip({
  member,
  onOpen,
}: {
  member: DirectoryStaffMember | undefined;
  onOpen?: () => void;
}) {
  const inner = (
    <>
      {member ? (
        <StaffAvatar member={member} size="md" />
      ) : (
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-black/10 text-xs text-black/40">
          ?
        </div>
      )}
      <p className="mt-1.5 w-full truncate text-xs font-medium leading-tight text-[#3D421F] dark:text-[CanvasText]">
        {firstLastName(member?.fullName) || "Unknown"}
      </p>
      <p className="mt-0.5 w-full truncate text-[10px] leading-tight text-black/45 dark:text-white/45">
        {member?.positionName?.trim() || "—"}
      </p>
    </>
  );
  const className =
    "dir-org-node flex w-28 flex-col items-center rounded-2xl border border-dashed border-black/20 bg-white/80 px-2 py-2 text-center dark:border-white/20 dark:bg-white/10";
  if (!onOpen) {
    return <div className={className}>{inner}</div>;
  }
  return (
    <button type="button" onClick={onOpen} className={className}>
      {inner}
    </button>
  );
}

function StaffAvatar({
  member,
  size,
  preview = false,
  emphasized = false,
}: {
  member: DirectoryStaffMember;
  size: "md" | "lg";
  preview?: boolean;
  emphasized?: boolean;
}) {
  const box = size === "lg" ? "h-24 w-24" : "h-12 w-12";
  const frame = emphasized
    ? "border-[1.5px] border-white"
    : "border border-black/10";

  const media = member.photoUrl ? (
    <div
      className={cn(
        "dir-org-photo relative shrink-0 overflow-hidden rounded-2xl bg-black/5",
        frame,
        box,
      )}
    >
      <Image
        src={member.photoUrl}
        alt=""
        fill
        className="object-cover"
        unoptimized
      />
    </div>
  ) : (
    <div
      className={cn(
        "dir-org-photo flex shrink-0 items-center justify-center rounded-2xl bg-[#3D421F] font-medium text-white",
        frame,
        box,
      )}
    >
      <PhotoPlaceholderMark
        className={size === "lg" ? "h-[26%] w-[26%]" : "h-[24%] w-[24%]"}
        tone="bright"
      />
    </div>
  );

  if (!preview) return media;

  return (
    <StaffPhotoPreview
      fullName={member.fullName}
      photoUrl={member.photoUrl}
      details={{
        empNo: member.empNo,
        department: member.departmentName,
        position: member.positionName,
        employeeStatus: member.employmentStatusName,
        nationality: member.nationalityName,
        dob: member.dob,
        joiningDate: member.joiningDate,
      }}
    >
      {({ openPreview, isOpen }) => (
        <button
          type="button"
          className={cn(
            "cursor-zoom-in rounded-2xl p-0 transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--venue-primary,#818a40)]/50",
            isOpen && "invisible",
          )}
          aria-label={
            member.photoUrl
              ? `Enlarge photo of ${member.fullName}`
              : `View profile details for ${member.fullName}`
          }
          onClick={openPreview}
          onMouseDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {media}
        </button>
      )}
    </StaffPhotoPreview>
  );
}
