"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Info, Loader2, MessageCircle, X } from "lucide-react";
import { loadPersonDirectoryDetails } from "@/lib/actions/directory-chat";
import { formatDateDmy } from "@/lib/accounting/money";
import type { ConnectPerson } from "@/lib/connect/types";
import { formatOrdinalDayMonth } from "@/lib/directory/celebrations";
import { directoryWhatsappUrl, mailtoUrl, phoneTelUrl } from "@/lib/directory/links";
import type { DirectoryStaffMember } from "@/lib/directory/types";
import { nationalityDisplay } from "@/lib/hr/nationality-flag";
import { firstLastName } from "@/lib/user/display";
import { cn } from "@/lib/utils";

/**
 * Directory tile (web and phone): a square card, everything centred on its
 * own line — photo, first + last name, position, then Info | Message.
 */
export function PersonTile({
  person,
  avatar,
  opening = false,
  disabled = false,
  compact = false,
  onInfo,
  onMessage,
}: {
  person: ConnectPerson;
  /** Photo element (the web adds a presence ring). */
  avatar: ReactNode;
  opening?: boolean;
  disabled?: boolean;
  /** Phone: three across, so the tile runs a little taller than wide. */
  compact?: boolean;
  onInfo: () => void;
  onMessage: () => void;
}) {
  const iconButton = compact ? "h-8 w-8" : "h-9 w-9";
  return (
    <li
      className={cn(
        "ios-card flex min-w-0 flex-col items-center justify-center rounded-2xl border border-black/5 bg-white text-center shadow-sm",
        compact ? "px-1.5 pb-2.5 pt-3" : "aspect-square px-3 py-3",
      )}
    >
      {avatar}
      <p className={cn("mt-2 w-full truncate font-semibold leading-tight text-[#2B2F16]", compact ? "text-[13px]" : "text-sm")}>
        {firstLastName(person.name)}
      </p>
      <p className={cn("mt-0.5 w-full truncate text-black/60", compact ? "text-[11px]" : "text-xs")}>
        {person.positionName ?? " "}
      </p>
      <div className={cn("flex items-center", compact ? "mt-2 gap-1.5" : "mt-2.5 gap-2")}>
        <button
          type="button"
          onClick={onInfo}
          aria-label={`About ${person.name}`}
          title={`About ${person.name}`}
          className={cn(iconButton, "inline-flex items-center justify-center rounded-full bg-[#F0F2E8] text-[#3D421F] transition-transform hover:bg-[#E6E9D8] active:scale-90")}
        >
          <Info className="h-[18px] w-[18px]" />
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={onMessage}
          aria-label={`Message ${person.name}`}
          title={`Message ${person.name}`}
          className={cn(iconButton, "inline-flex items-center justify-center rounded-full bg-[var(--venue-primary,#818a40)] text-white shadow-sm transition-transform hover:opacity-90 active:scale-90 disabled:opacity-50")}
        >
          {opening ? (
            <Loader2 className="h-[18px] w-[18px] animate-spin" />
          ) : (
            <MessageCircle className="h-[18px] w-[18px]" />
          )}
        </button>
      </div>
    </li>
  );
}

/** Tiles in a grid: three across on a phone; on the web, as many ~9rem tiles as fit. */
export function PersonTileGrid({
  children,
  compact = false,
  className,
}: {
  children: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <ul
      className={cn(
        "grid",
        compact ? "grid-cols-3 gap-2" : "grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-3",
        className,
      )}
    >
      {children}
    </ul>
  );
}

/**
 * "About" card for a person, over the screen: the same details as the
 * Directory app (for viewers allowed to see them). `contained` keeps it inside
 * the nearest positioned parent (the phone screen) instead of the window.
 */
export function PersonInfoCard({
  person,
  avatar,
  contained = false,
  opening = false,
  onMessage,
  onClose,
}: {
  person: ConnectPerson;
  avatar: ReactNode;
  contained?: boolean;
  opening?: boolean;
  onMessage: () => void;
  onClose: () => void;
}) {
  const [details, setDetails] = useState<{ userId: string; member: DirectoryStaffMember | null } | null>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let alive = true;
    void loadPersonDirectoryDetails(person.userId).then((result) => {
      if (alive) setDetails({ userId: person.userId, member: result.ok ? result.member : null });
    });
    return () => {
      alive = false;
    };
  }, [person.userId]);

  const loaded = details?.userId === person.userId;
  const member = loaded ? details.member : null;
  const nationality = member ? nationalityDisplay(member.nationalityName) : null;
  const rows: Array<{ label: string; value: string | null; href?: string | null; external?: boolean }> = [
    { label: "Position", value: member?.positionName ?? person.positionName },
    { label: "Department", value: member?.departmentName ?? person.departmentName },
  ];
  if (member) {
    rows.push(
      {
        label: "Nationality",
        value: nationality ? [nationality.flag, nationality.label].filter(Boolean).join(" ") : null,
      },
      { label: "Birthday", value: member.dob ? formatOrdinalDayMonth(member.dob) : null },
      { label: "Joining date", value: member.joiningDate ? formatDateDmy(member.joiningDate) : null },
      { label: "Contact phone", value: member.contactPhone, href: phoneTelUrl(member.contactPhone) },
      { label: "WhatsApp", value: member.whatsapp, href: directoryWhatsappUrl(member.whatsapp), external: true },
      { label: "Personal email", value: member.personalEmail, href: mailtoUrl(member.personalEmail) },
      { label: "Work email", value: member.workEmail, href: mailtoUrl(member.workEmail) },
    );
  }

  return (
    <div
      className={cn(
        "z-[160] flex items-center justify-center bg-black/30 p-5 backdrop-blur-[2px]",
        contained ? "absolute inset-0" : "fixed inset-0",
      )}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={person.name}
        className="ios-card relative flex max-h-full w-full max-w-[20rem] flex-col rounded-3xl bg-white p-5 text-center shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#F0F2E8] text-black/60 hover:bg-[#E6E9D8]"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="flex justify-center">{avatar}</div>
        <p className="mt-3 text-base font-semibold leading-tight text-[#2B2F16]">{person.name}</p>
        {member?.empNo ? <p className="mt-0.5 text-xs text-black/60">Emp. no. {member.empNo}</p> : null}
        <dl className="mt-3 min-h-0 flex-1 space-y-1.5 overflow-y-auto text-left text-sm">
          {rows.map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-3 border-t border-black/5 pt-1.5">
              <dt className="shrink-0 text-xs text-black/60">{row.label}</dt>
              <dd className="min-w-0 truncate text-right text-[#2B2F16]">
                {row.value && row.href ? (
                  <a
                    href={row.href}
                    target={row.external ? "_blank" : undefined}
                    rel={row.external ? "noreferrer" : undefined}
                    className="text-[var(--venue-primary,#818a40)] underline-offset-2 hover:underline"
                  >
                    {row.value}
                  </a>
                ) : (
                  row.value || "—"
                )}
              </dd>
            </div>
          ))}
          {!loaded ? (
            <div className="flex justify-center border-t border-black/5 pt-2 text-black/40">
              <Loader2 className="h-4 w-4 animate-spin" aria-label="Loading details" />
            </div>
          ) : null}
        </dl>
        <button
          type="button"
          onClick={onMessage}
          disabled={opening}
          className="mt-4 inline-flex h-11 w-full shrink-0 items-center justify-center gap-2 rounded-full bg-[var(--venue-primary,#818a40)] text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
        >
          {opening ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
          Message
        </button>
      </div>
    </div>
  );
}
