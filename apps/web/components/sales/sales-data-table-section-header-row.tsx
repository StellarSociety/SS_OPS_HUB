"use client";

import {
  SALES_TABLE_HEADER_SECTION_BG,
  SALES_TABLE_STICKY_BORDER,
  type SalesTableStickyColumn,
} from "@/lib/sales/sales-data-table-ui";
import { SalesDataTableActionSectionHeader } from "@/components/sales/sales-data-table-actions-cell";
import { cn } from "@/lib/utils";

type SalesDataTableSectionHeaderRowProps<TSection extends string> = {
  sections: readonly TSection[];
  fixedSectionKey: TSection;
  sectionLabels: Record<TSection, string>;
  sectionColSpan: (section: TSection) => number;
  fixedStickyColumns: readonly SalesTableStickyColumn[];
  includeActions?: boolean;
};

export function SalesDataTableSectionHeaderRow<TSection extends string>({
  sections,
  fixedSectionKey,
  sectionLabels,
  sectionColSpan,
  fixedStickyColumns,
  includeActions = true,
}: SalesDataTableSectionHeaderRowProps<TSection>) {
  return (
    <tr
      className={cn(
        "border-b border-black/15 text-sm font-bold uppercase tracking-wide text-black",
        SALES_TABLE_HEADER_SECTION_BG,
      )}
    >
      {sections.map((section) => {
        if (section === fixedSectionKey) {
          return fixedStickyColumns.map((col) => (
            <th
              key={col.key}
              className={cn(
                "sticky z-30 border-r px-3 py-2.5 text-left",
                SALES_TABLE_STICKY_BORDER,
                SALES_TABLE_HEADER_SECTION_BG,
              )}
              style={{
                left: col.left,
                minWidth: col.width,
                width: col.width,
              }}
            />
          ));
        }

        const span = sectionColSpan(section);
        if (span === 0) return null;

        return (
          <th
            key={section}
            colSpan={span}
            className={cn(
              "border-r px-3 py-2.5 text-left",
              SALES_TABLE_STICKY_BORDER,
              SALES_TABLE_HEADER_SECTION_BG,
            )}
          >
            {sectionLabels[section]}
          </th>
        );
      })}
      {includeActions ? <SalesDataTableActionSectionHeader /> : null}
    </tr>
  );
}
