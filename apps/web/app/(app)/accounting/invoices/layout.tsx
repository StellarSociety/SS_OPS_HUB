import { InvoicesSectionFrame } from "@/components/accounting/invoices-section-frame";

export default function InvoicesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <InvoicesSectionFrame>{children}</InvoicesSectionFrame>;
}
