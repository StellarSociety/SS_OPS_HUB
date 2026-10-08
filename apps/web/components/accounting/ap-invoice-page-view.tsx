"use client";

import { useRouter } from "next/navigation";
import { ApInvoiceView } from "@/components/accounting/ap-invoice-view";
import type { ApInvoice } from "@/lib/accounting/ap-types";

/** Full-page fallback for direct links to a document. */
export function ApInvoicePageView(props: {
  invoice: ApInvoice;
  canEdit: boolean;
  canAdmin: boolean;
}) {
  const router = useRouter();
  return (
    <div className="rounded-2xl border border-black/10 bg-[#fbfbf7] p-5 sm:p-6">
      <ApInvoiceView {...props} onChanged={() => router.refresh()} />
    </div>
  );
}
