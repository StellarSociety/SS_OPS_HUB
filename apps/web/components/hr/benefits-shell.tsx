"use client";

import { ModulePageTitle } from "@/components/layout/module-page-title";
import { BenefitsSubNav } from "@/components/hr/benefits-sub-nav";

type BenefitsShellProps = {
  venueSubtitle: string;
  children: React.ReactNode;
};

export function BenefitsShell({
  venueSubtitle,
  children,
}: BenefitsShellProps) {
  return (
    <div className="mx-auto w-full max-w-none space-y-6">
      <div>
        <ModulePageTitle>Benefits</ModulePageTitle>
        <p className="mt-1 text-sm text-black/60">{venueSubtitle}</p>
        <hr className="mt-4 border-black/10" />
      </div>
      <BenefitsSubNav />
      {children}
    </div>
  );
}
