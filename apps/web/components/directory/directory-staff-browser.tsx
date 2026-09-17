"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Mail, Search, X } from "lucide-react";
import {
  directoryWhatsappUrl,
  mailtoUrl,
  phoneTelUrl,
} from "@/lib/directory/links";
import { formatOrdinalDayMonth } from "@/lib/directory/celebrations";
import type { DirectoryStaffMember } from "@/lib/directory/types";
import { formatDisplayDate } from "@/lib/dates/display";
import { nationalityDisplay } from "@/lib/hr/nationality-flag";
import { getUserInitials } from "@/lib/user/display";
import { cn } from "@/lib/utils";

function dash(value: string | null | undefined): string {
  return value?.trim() || "—";
}

const UNASSIGNED_DEPARTMENT = "Unassigned";

function groupStaffByDepartment(staff: DirectoryStaffMember[]) {
  const groups = new Map<
    string,
    { name: string; sortOrder: number; members: DirectoryStaffMember[] }
  >();

  for (const member of staff) {
    const name = member.departmentName?.trim() || UNASSIGNED_DEPARTMENT;
    const sortOrder =
      name === UNASSIGNED_DEPARTMENT
        ? Number.MAX_SAFE_INTEGER
        : (member.departmentSortOrder ?? Number.MAX_SAFE_INTEGER - 1);
    const existing = groups.get(name);
    if (existing) {
      existing.members.push(member);
    } else {
      groups.set(name, { name, sortOrder, members: [member] });
    }
  }

  return [...groups.values()].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
  );
}

function formatIsoDate(value: string | null | undefined): string {
  const iso = value?.trim().slice(0, 10) ?? "";
  if (!iso) return "—";
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? formatDisplayDate(iso) : iso;
}

export function DirectoryStaffBrowser({
  staff,
}: {
  staff: DirectoryStaffMember[];
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = staff.find((member) => member.id === selectedId) ?? null;

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

  useEffect(() => {
    if (!selected) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/35" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search name, department, position…"
          className="h-10 w-full rounded-md border border-black/10 bg-white pl-9 pr-3 text-sm outline-none focus:border-[var(--venue-primary,#6B7B3A)]"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-black/50">No staff match that search.</p>
      ) : (
        <div className="space-y-8">
          {groupStaffByDepartment(filtered).map((group) => (
            <section key={group.name}>
              <h2 className="flex items-center gap-2 font-serif text-xl text-[#3D421F]">
                {group.name}
                <span className="text-sm font-normal text-black/40">
                  {group.members.length}
                </span>
              </h2>
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {group.members.map((member) => (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => setSelectedId(member.id)}
                    className="flex items-center gap-3 rounded-2xl border border-black/10 bg-white px-3 py-2.5 text-left transition hover:border-[var(--venue-primary,#6B7B3A)]/40 hover:bg-[var(--venue-secondary,#F0F3DD)]/50"
                  >
                    <StaffAvatar member={member} />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-[#3D421F]">
                        {member.fullName}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-black/45">
                        {dash(member.positionName)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {selected ? (
        <StaffDetailDialog
          member={selected}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
    </div>
  );
}

function StaffDetailDialog({
  member,
  onClose,
}: {
  member: DirectoryStaffMember;
  onClose: () => void;
}) {
  const nationality = nationalityDisplay(member.nationalityName);
  const phoneUrl = phoneTelUrl(member.contactPhone);
  const whatsappUrl = directoryWhatsappUrl(member.whatsapp);
  const personalMailto = mailtoUrl(member.personalEmail);
  const workMailto = mailtoUrl(member.workEmail);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="directory-staff-detail-title"
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <StaffAvatar member={member} large />
            <div>
              <h2
                id="directory-staff-detail-title"
                className="font-serif text-xl text-[#3D421F]"
              >
                {member.fullName}
              </h2>
              <p className="text-sm text-black/50">{dash(member.positionName)}</p>
              <p className="text-xs text-black/40">{dash(member.departmentName)}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-black/45 hover:bg-black/5 hover:text-black/70"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <dl className="mt-5 space-y-3">
          <Detail
            label="Nationality"
            value={
              nationality
                ? [nationality.flag, nationality.label].filter(Boolean).join(" ")
                : "—"
            }
          />
          <Detail label="Birthday" value={formatOrdinalDayMonth(member.dob)} />
          <Detail label="Joining date" value={formatIsoDate(member.joiningDate)} />
          <Detail
            label="Contact phone"
            value={dash(member.contactPhone)}
            href={phoneUrl}
          />
          <Detail
            label="WhatsApp"
            value={dash(member.whatsapp)}
            href={whatsappUrl}
            external
          />
          <Detail
            label="Personal email"
            value={dash(member.personalEmail)}
            href={personalMailto}
            mail
          />
          <Detail
            label="Work email"
            value={dash(member.workEmail)}
            href={workMailto}
            mail
          />
        </dl>
      </div>
    </div>
  );
}

function Detail({
  label,
  value,
  href,
  external,
  mail,
}: {
  label: string;
  value: string;
  href?: string | null;
  external?: boolean;
  mail?: boolean;
}) {
  const body = (
    <>
      <dt className="text-[11px] uppercase tracking-wide text-black/40">{label}</dt>
      <dd className="mt-0.5 flex items-center gap-1.5 text-sm text-[#3D421F]">
        {mail && href ? <Mail className="h-3.5 w-3.5 shrink-0" /> : null}
        <span className="break-all">{value}</span>
      </dd>
    </>
  );

  if (!href) return <div>{body}</div>;

  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      className="block rounded-lg hover:underline"
    >
      {body}
    </a>
  );
}

function StaffAvatar({
  member,
  large,
}: {
  member: DirectoryStaffMember;
  large?: boolean;
}) {
  const initials = getUserInitials(member.fullName, member.empNo);
  const size = large ? "h-16 w-16 text-lg" : "h-12 w-12 text-sm";

  if (member.photoUrl) {
    return (
      <div
        className={cn(
          "relative shrink-0 overflow-hidden rounded-2xl border border-black/10",
          large ? "h-16 w-16" : "h-12 w-12",
        )}
      >
        <Image src={member.photoUrl} alt="" fill className="object-cover" unoptimized />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-2xl bg-[#3D421F] font-medium text-white",
        size,
      )}
    >
      {initials}
    </div>
  );
}
