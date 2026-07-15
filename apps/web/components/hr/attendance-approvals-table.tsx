"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { updateAttendanceApproval } from "@/lib/actions/hr-attendance";

export type AttendanceApprovalRow = {
  id: string;
  workDate: string;
  empNo: string;
  fullName: string;
  rosterLabel: string | null;
  clockIn: string | null;
  clockOut: string | null;
  totalHours: number | null;
  attendanceStatus: string;
  approvalStatus: "pending" | "approved" | "rejected" | "flagged";
  issue: string | null;
};

type Props = {
  rows: AttendanceApprovalRow[];
  canEdit: boolean;
};

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function AttendanceApprovalsTable({ rows, canEdit }: Props) {
  const [pending, startTransition] = useTransition();
  const [local, setLocal] = useState(rows);

  function setStatus(
    id: string,
    approvalStatus: AttendanceApprovalRow["approvalStatus"],
  ) {
    startTransition(async () => {
      const result = await updateAttendanceApproval({ id, approvalStatus });
      if ("ok" in result && result.ok) {
        setLocal((prev) =>
          prev.map((r) => (r.id === id ? { ...r, approvalStatus } : r)),
        );
      }
    });
  }

  if (!local.length) {
    return (
      <div className="rounded-xl border border-dashed border-black/15 bg-white/40 px-5 py-10 text-center">
        <p className="text-sm text-black/55">
          No attendance days in this range to compare with the roster. Import
          punches first, and ensure schedules are filled.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-black/10 bg-white/70">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-black/10 bg-black/[0.03] text-xs uppercase tracking-wide text-black/45">
          <tr>
            <th className="px-3 py-2.5 font-medium">Date</th>
            <th className="px-3 py-2.5 font-medium">Employee</th>
            <th className="px-3 py-2.5 font-medium">Roster</th>
            <th className="px-3 py-2.5 font-medium">Clock in</th>
            <th className="px-3 py-2.5 font-medium">Clock out</th>
            <th className="px-3 py-2.5 font-medium">Hours</th>
            <th className="px-3 py-2.5 font-medium">Issue</th>
            <th className="px-3 py-2.5 font-medium">Approval</th>
          </tr>
        </thead>
        <tbody>
          {local.map((row) => (
            <tr
              key={row.id}
              className="border-b border-black/5 last:border-0 hover:bg-black/[0.02]"
            >
              <td className="whitespace-nowrap px-3 py-2">{row.workDate}</td>
              <td className="px-3 py-2">
                <div className="font-medium text-[#3D421F]">{row.fullName}</div>
                <div className="font-mono text-xs text-black/45">{row.empNo}</div>
              </td>
              <td className="px-3 py-2">{row.rosterLabel ?? "—"}</td>
              <td className="whitespace-nowrap px-3 py-2">
                {formatTime(row.clockIn)}
              </td>
              <td className="whitespace-nowrap px-3 py-2">
                {formatTime(row.clockOut)}
              </td>
              <td className="whitespace-nowrap px-3 py-2">
                {row.totalHours == null ? "—" : Number(row.totalHours).toFixed(2)}
              </td>
              <td className="max-w-[14rem] px-3 py-2 text-xs text-amber-900">
                {row.issue ?? (row.attendanceStatus !== "complete" ? row.attendanceStatus : "—")}
              </td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs capitalize text-black/55">
                    {row.approvalStatus}
                  </span>
                  {canEdit ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        disabled={pending}
                        onClick={() => setStatus(row.id, "approved")}
                      >
                        Approve
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        disabled={pending}
                        onClick={() => setStatus(row.id, "flagged")}
                      >
                        Flag
                      </Button>
                    </>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
