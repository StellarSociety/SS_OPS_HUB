"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { HiringDialog } from "@/components/hr/hiring-dialog";
import {
  HIRING_CATEGORY_LABELS,
  HIRING_STATUS_LABELS,
  type HiringApplication,
} from "@/lib/hr/hiring/types";

export function HiringShortlistClient({
  applications,
}: {
  applications: Array<HiringApplication & { form_name: string }>;
}) {
  const [detail, setDetail] = useState<
    (HiringApplication & { form_name: string }) | null
  >(null);

  if (applications.length === 0) {
    return (
      <Card className="px-6 py-16 text-center text-sm text-muted-foreground">
        Candidates tagged Final Assessment or To be Hired will appear here.
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border border-black/10 bg-white/70">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-black/[0.03] text-xs uppercase tracking-wide text-black/50">
            <tr>
              <th className="px-3 py-2 font-medium">Candidate</th>
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Form</th>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {applications.map((application) => (
              <tr
                key={application.id}
                className="cursor-pointer border-t border-black/5 hover:bg-[var(--venue-primary,#818a40)]/8"
                onClick={() => setDetail(application)}
              >
                <td className="px-3 py-2 text-[#3D421F]">
                  {application.applicant_name || "Unnamed"}
                </td>
                <td className="px-3 py-2 text-black/65">
                  {application.applicant_email || "—"}
                </td>
                <td className="px-3 py-2">{application.form_name}</td>
                <td className="px-3 py-2">
                  {application.category
                    ? HIRING_CATEGORY_LABELS[application.category]
                    : "—"}
                </td>
                <td className="px-3 py-2">
                  {HIRING_STATUS_LABELS[application.status]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <HiringDialog
        open={Boolean(detail)}
        title={detail?.applicant_name || "Candidate"}
        description={detail?.form_name}
        onClose={() => setDetail(null)}
        wide
      >
        {detail ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {Object.entries(detail.answers).map(([id, answer]) => (
              <div key={id} className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-black/40">
                  {answer.label}
                </p>
                <p className="text-sm text-[#3D421F]">
                  {Array.isArray(answer.value)
                    ? answer.value.join(", ")
                    : answer.value == null
                      ? "—"
                      : String(answer.value)}
                </p>
              </div>
            ))}
            {detail.files.map((file) => (
              <a
                key={file.id}
                href={file.public_url}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-[var(--venue-primary,#818a40)] underline"
              >
                {file.file_name}
              </a>
            ))}
          </div>
        ) : null}
      </HiringDialog>
    </div>
  );
}
