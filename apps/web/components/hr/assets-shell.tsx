"use client";

import { ModulePageTitle } from "@/components/layout/module-page-title";
import { AssetsSubNav } from "@/components/hr/assets-sub-nav";

type AssetsShellProps = {
  children: React.ReactNode;
};

export function AssetsShell({ children }: AssetsShellProps) {
  return (
    <div className="space-y-6">
      <div>
        <ModulePageTitle>Assets</ModulePageTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Company property catalog
        </p>
        <hr className="mt-4 border-black/10" />
      </div>
      <AssetsSubNav />
      {children}
    </div>
  );
}
