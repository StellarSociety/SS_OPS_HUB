"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { ApInvoiceDialog } from "@/components/accounting/ap-invoice-dialog";
import { ApDuplicateDocsTable } from "@/components/accounting/ap-duplicate-dialog";
import { useVenueScope } from "@/components/providers/venue-scope-provider";
import type { ApDuplicateGroup } from "@/lib/accounting/ap-duplicates";
import { toScopedHref } from "@/lib/venue/scope-routing";

const FIELD_LABEL: Record<ApDuplicateGroup["field"], string> = {
  invoice_no: "Invoice no",
  credit_note_no: "Credit note no",
  delivery_note_no: "Delivery note no",
};

/** Expenses → Alerts: supplier references used on more than one document. */
export function ApAlertsList({ groups }: { groups: ApDuplicateGroup[] }) {
  const { scope, slug } = useVenueScope();
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const hrefFor = (id: string) =>
    toScopedHref(`/accounting/invoices/${id}`, scope, slug);

  if (groups.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-lg border border-black/10 bg-white p-10 text-sm text-black/50">
        <CheckCircle2 className="size-4 text-emerald-600" />
        No duplicated invoice, delivery note or credit note numbers.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="flex items-center gap-2 text-sm text-amber-800">
        <AlertTriangle className="size-4" />
        {groups.length} supplier reference{groups.length === 1 ? " is" : "s are"}{" "}
        used on more than one document. Check each is genuine, or void the extra
        copy.
      </p>
      {groups.map((g) => (
        <section
          key={g.key}
          className="space-y-2 rounded-lg border border-black/10 bg-white p-4"
        >
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="font-semibold text-[#3D421F]">{g.supplierName}</h3>
            <span className="text-sm text-black/60">
              {FIELD_LABEL[g.field]}{" "}
              <span className="font-medium text-[#3D421F]">{g.number}</span>
            </span>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
              {g.docs.length} documents
            </span>
          </div>
          <ApDuplicateDocsTable docs={g.docs} hrefFor={hrefFor} onOpen={setOpenId} />
        </section>
      ))}
      <ApInvoiceDialog
        invoiceId={openId}
        onClose={() => setOpenId(null)}
        onChanged={() => router.refresh()}
      />
    </div>
  );
}
