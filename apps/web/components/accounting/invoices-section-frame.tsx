"use client";

import { useRelativePathname } from "@/components/providers/venue-scope-provider";
import {
  InvoicesSubNav,
  InvoicesTypeBanner,
} from "@/components/accounting/invoices-sub-nav";

function isSuppliersPath(pathname: string) {
  return (
    pathname === "/accounting/invoices/suppliers" ||
    pathname.startsWith("/accounting/invoices/suppliers/")
  );
}

/** Expenses chrome, or a standalone Suppliers heading when that sidebar page is open. */
export function InvoicesSectionFrame({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = useRelativePathname();
  const suppliers = isSuppliersPath(pathname);

  return (
    <div className="mx-auto w-full max-w-none space-y-5">
      <div className="space-y-1">
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-[#3D421F] md:text-3xl">
          {suppliers ? "Suppliers" : "Expenses"}
        </h1>
        {suppliers ? (
          <p className="text-sm text-black/55">
            F&B suppliers (COS), general suppliers, and contractors (OPEX) used on purchase invoices.
          </p>
        ) : (
          <InvoicesTypeBanner />
        )}
      </div>
      {suppliers ? null : <InvoicesSubNav />}
      {children}
    </div>
  );
}
