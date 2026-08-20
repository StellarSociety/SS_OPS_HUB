import { InvoicesSubNav, InvoicesTypeBanner } from "@/components/accounting/invoices-sub-nav";

export default function InvoicesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-none space-y-5">
      <div className="space-y-1">
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-[#3D421F] md:text-3xl">
          Invoice Issue
        </h1>
        <InvoicesTypeBanner />
      </div>
      <InvoicesSubNav />
      {children}
    </div>
  );
}
