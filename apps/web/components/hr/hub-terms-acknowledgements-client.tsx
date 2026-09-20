"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { StaffDirectoryLink } from "@/components/hr/staff-directory-link";
import { StaffPhotoThumbnail } from "@/components/hr/staff-photo-thumbnail";
import { Input } from "@/components/ui/input";
import {
  hubTermsClientLabel,
  type HubTermsUserRecord,
} from "@/lib/hub-terms";
import { HUB_TERMS_EFFECTIVE_DATE, HUB_TERMS_VERSION } from "@/lib/mobile/terms-content";
import { cn } from "@/lib/utils";

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Dubai",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function HubTermsAcknowledgementsClient({
  records,
}: {
  records: HubTermsUserRecord[];
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "pending" | "acknowledged">(
    "all",
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return records.filter((row) => {
      if (status !== "all" && row.status !== status) return false;
      if (!needle) return true;
      const hay = [row.name, row.email, row.empNo ?? ""]
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [query, records, status]);

  const pendingCount = records.filter((row) => row.status === "pending").length;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden">
      <p className="shrink-0 text-sm text-black/60">
        Hub users for this venue must read and accept SS OPS HUB Terms &amp;
        Conditions (effective {HUB_TERMS_EFFECTIVE_DATE}). Pending users see a
        blocking dialog on web and mobile until they accept.{" "}
        <span className="font-medium text-[#3D421F]">
          {pendingCount} pending
        </span>{" "}
        of {records.length}. Version {HUB_TERMS_VERSION}.
      </p>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-black/35" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email, emp no…"
            className="h-10 pl-9"
          />
        </div>
        <select
          value={status}
          onChange={(e) =>
            setStatus(e.target.value as "all" | "pending" | "acknowledged")
          }
          className="h-10 rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F] outline-none focus:border-[var(--venue-primary,#818a40)]/50 focus:ring-2 focus:ring-[var(--venue-primary,#818a40)]/20"
        >
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="acknowledged">Acknowledged</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-dashed border-black/15 bg-white/60 px-4 py-10 text-center text-sm text-black/50">
          {records.length === 0
            ? "No hub users found for this venue."
            : "No users match this search."}
        </p>
      ) : (
        <div className="min-h-0 min-w-0 flex-1 overflow-auto rounded-xl border border-black/10 bg-white">
          <table className="w-max min-w-full text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-black/10 bg-[var(--venue-secondary,#F0F3DD)] text-xs uppercase tracking-wide text-black/50">
              <tr>
                <th className="px-3 py-2.5 font-medium">User</th>
                <th className="px-3 py-2.5 font-medium">Email</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 font-medium">Accepted</th>
                <th className="px-3 py-2.5 font-medium">App</th>
                <th className="px-3 py-2.5 font-medium">Last login</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr
                  key={row.userId}
                  className="border-b border-black/5 last:border-0"
                >
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <StaffPhotoThumbnail
                        photoUrl={row.photoUrl}
                        fullName={row.name}
                        empNo={row.empNo}
                      />
                      <div className="min-w-0">
                        <p className="font-medium text-[#3D421F]">{row.name}</p>
                        <p className="text-xs text-black/45">
                          {row.staffId && row.empNo ? (
                            <StaffDirectoryLink
                              staffId={row.staffId}
                              empNo={row.empNo}
                            />
                          ) : (
                            row.empNo || "Hub user"
                          )}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-black/70">{row.email}</td>
                  <td className="px-3 py-2.5">
                    <span
                      className={cn(
                        "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium",
                        row.status === "acknowledged"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                          : "border-amber-200 bg-amber-50 text-amber-900",
                      )}
                    >
                      {row.status === "acknowledged"
                        ? "Acknowledged"
                        : "Pending"}
                    </span>
                    {row.accountStatus === "disabled" ? (
                      <span className="ml-1.5 text-[11px] text-black/40">
                        Disabled
                      </span>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-black/60">
                    {formatWhen(row.acceptedAt)}
                  </td>
                  <td className="px-3 py-2.5 text-black/60">
                    {hubTermsClientLabel(row.client)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-black/60">
                    {formatWhen(row.lastLoginAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
