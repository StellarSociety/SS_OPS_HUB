"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { ScopedLink as Link } from "@/components/layout/scoped-link";
import { GratuityReportExportDialog } from "@/components/sales/gratuity-report-export-dialog";
import type { VenueWaiterGratuityRow } from "@/lib/sales/waiter-sales-store";

type GratuityReportHubItemProps = {
  href: string;
  title: string;
  description: string;
  venueName: string;
  venueLogoUrl?: string | null;
  userDisplayName: string;
  waiterRecords: VenueWaiterGratuityRow[];
  canExport: boolean;
};

export function GratuityReportHubItem({
  href,
  title,
  description,
  venueName,
  venueLogoUrl,
  userDisplayName,
  waiterRecords,
  canExport,
}: GratuityReportHubItemProps) {
  const [exportOpen, setExportOpen] = useState(false);

  return (
    <>
      <div className="flex items-stretch overflow-hidden rounded-lg border border-black/10 bg-white/70 transition-colors hover:border-[var(--venue-primary,#818a40)]/30 hover:bg-[var(--venue-primary,#818a40)]/[0.04]">
        <Link
          href={href}
          className="min-w-0 flex-1 px-3.5 py-3 transition-colors"
        >
          <span className="block text-sm font-semibold text-[#3D421F]">
            {title}
          </span>
          <span className="mt-0.5 block text-xs leading-relaxed text-black/55">
            {description}
          </span>
        </Link>

        {canExport ? (
          <div className="flex shrink-0 items-center border-l border-black/10 px-2">
            <button
              type="button"
              onClick={() => setExportOpen(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-[#3D421F] transition-colors hover:bg-[var(--venue-primary,#818a40)]/10"
            >
              <Download className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              Export
            </button>
          </div>
        ) : null}
      </div>

      {canExport ? (
        <GratuityReportExportDialog
          open={exportOpen}
          venueName={venueName}
          venueLogoUrl={venueLogoUrl}
          userDisplayName={userDisplayName}
          waiterRecords={waiterRecords}
          allowMonthSelect
          onClose={() => setExportOpen(false)}
        />
      ) : null}
    </>
  );
}
