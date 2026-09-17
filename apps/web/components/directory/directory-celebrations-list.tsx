import Image from "next/image";
import { Cake, PartyPopper } from "lucide-react";
import {
  celebrationCaption,
  celebrationWindow,
  formatDayMonth,
  formatOrdinalDayMonth,
  listAnniversaryCelebrations,
  listBirthdayCelebrations,
} from "@/lib/directory/celebrations";
import type { DirectoryStaffMember } from "@/lib/directory/types";
import { formatDisplayDate } from "@/lib/dates/display";
import { getUserInitials } from "@/lib/user/display";
import { cn } from "@/lib/utils";

export function DirectoryCelebrationsList({
  staff,
}: {
  staff: DirectoryStaffMember[];
}) {
  const window = celebrationWindow();
  const birthdays = listBirthdayCelebrations(staff);
  const anniversaries = listAnniversaryCelebrations(staff);

  return (
    <div className="space-y-8">
      <p className="text-sm text-black/55">
        {formatDisplayDate(window.startIso)} – {formatDisplayDate(window.endIso)}
      </p>
      <CelebrationGroup
        title="Birthdays"
        icon={Cake}
        empty="No birthdays in this window."
        items={birthdays}
      />
      <CelebrationGroup
        title="Work anniversaries"
        icon={PartyPopper}
        empty="No work anniversaries in this window."
        items={anniversaries}
      />
    </div>
  );
}

function CelebrationGroup({
  title,
  icon: Icon,
  empty,
  items,
}: {
  title: string;
  icon: typeof Cake;
  empty: string;
  items: ReturnType<typeof listBirthdayCelebrations>;
}) {
  return (
    <section>
      <h2 className="flex items-center gap-2 font-serif text-xl text-[#3D421F]">
        <Icon className="h-5 w-5 text-[var(--venue-primary,#6B7B3A)]" />
        {title}
        <span className="text-sm font-normal text-black/40">{items.length}</span>
      </h2>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-black/50">{empty}</p>
      ) : (
        <ul className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
          {items.map((item) => (
            <li
              key={`${item.kind}-${item.staffId}`}
              className={cn(
                "flex items-center gap-3 rounded-2xl border px-3 py-2.5",
                item.daysFromToday === 0
                  ? "border-[var(--venue-primary,#6B7B3A)]/35 bg-[var(--venue-primary,#6B7B3A)]/10"
                  : "border-black/10 bg-white",
              )}
            >
              <MiniAvatar member={item.member} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-[#3D421F]">
                  {item.member.fullName}
                </p>
                <p className="mt-0.5 text-xs text-black/50">
                  {item.kind === "anniversary" && item.years
                    ? `${item.years} year${item.years === 1 ? "" : "s"} · ${formatDayMonth(item.occurrenceDate)}`
                    : formatOrdinalDayMonth(item.occurrenceDate)}
                </p>
              </div>
              <span className="shrink-0 text-xs font-medium text-black/45">
                {celebrationCaption(item.daysFromToday)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function MiniAvatar({ member }: { member: DirectoryStaffMember }) {
  if (member.photoUrl) {
    return (
      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-2xl border border-black/10">
        <Image src={member.photoUrl} alt="" fill className="object-cover" unoptimized />
      </div>
    );
  }
  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#3D421F] text-sm font-medium text-white">
      {getUserInitials(member.fullName, member.empNo)}
    </div>
  );
}
