"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  formatIssueStatus,
  formatMonthDay,
  guestDisplayName,
  type GuestsIntelGuestRow,
} from "@/lib/guests-intel/types";
import { cn } from "@/lib/utils";

type GuestsTableProps = {
  guests: GuestsIntelGuestRow[];
};

export function GuestsTable({ guests }: GuestsTableProps) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return guests;
    return guests.filter((guest) => {
      const hay = [
        guest.first_name,
        guest.last_name,
        guest.email,
        guest.phone,
        formatMonthDay(guest.birth_anniversary),
        ...(guest.allergens ?? []),
        ...(guest.other_diets ?? []),
        guest.latest_issue?.code,
        guest.reward_title,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [guests, query]);

  return (
    <div className="space-y-4">
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search name, email, diet, code…"
        className="max-w-sm"
      />

      {filtered.length === 0 ? (
        <Card className="p-6 text-sm text-black/55">
          {guests.length === 0
            ? "No guests collected yet."
            : "No guests match that search."}
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-black/10 text-xs uppercase tracking-wide text-black/45">
              <tr>
                <th className="px-4 py-3 font-semibold">Guest</th>
                <th className="px-4 py-3 font-semibold">Contact</th>
                <th className="px-4 py-3 font-semibold">Birth / anniversary</th>
                <th className="px-4 py-3 font-semibold">Diet</th>
                <th className="px-4 py-3 font-semibold">Pass</th>
                <th className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((guest) => {
                const status = guest.latest_issue?.status;
                const diet = [
                  ...(guest.allergens ?? []),
                  ...(guest.other_diets ?? []),
                ];
                return (
                  <tr key={guest.id} className="border-b border-black/5 last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium text-[#3D421F]">
                        {guestDisplayName(guest)}
                      </p>
                      <p className="text-xs text-black/45">
                        {guest.source === "hub" ? "Hub" : "Guest form"}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-black/70">
                      <p>{guest.email}</p>
                      {guest.phone ? (
                        <p className="text-xs text-black/45">{guest.phone}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-black/70">
                      {formatMonthDay(guest.birth_anniversary) || "—"}
                    </td>
                    <td className="px-4 py-3 text-black/70">
                      {diet.length > 0 ? (
                        <p className="max-w-[16rem] text-xs leading-5">{diet.join(", ")}</p>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-mono tracking-wide text-[#3D421F]">
                        {guest.latest_issue?.code ?? "—"}
                      </p>
                      <p className="text-xs text-black/45">
                        {guest.reward_title ?? ""}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      {status ? (
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2 py-0.5 text-xs font-semibold",
                            status === "issued" &&
                              "bg-[var(--venue-primary,#818a40)]/15 text-[var(--venue-primary,#818a40)]",
                            status === "redeemed" && "bg-black/8 text-black/55",
                            (status === "expired" || status === "void") &&
                              "bg-red-50 text-red-800",
                          )}
                        >
                          {formatIssueStatus(status)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
