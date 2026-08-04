"use client";

import { ModulePageTitle } from "@/components/layout/module-page-title";
import { AssetsSubNav } from "@/components/hr/assets-sub-nav";
import { useRelativePathname } from "@/components/providers/venue-scope-provider";

type AssetsShellProps = {
  children: React.ReactNode;
};

function hasSelectedSection(pathname: string): boolean {
  if (
    pathname === "/hr/assets/catalog" ||
    pathname.startsWith("/hr/assets/catalog/")
  ) {
    return true;
  }
  return (
    pathname === "/hr/assets/uniform" ||
    pathname.startsWith("/hr/assets/uniform/")
  );
}

export function AssetsShell({ children }: AssetsShellProps) {
  const pathname = useRelativePathname();
  const showContent = hasSelectedSection(pathname);

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
      {showContent ? (
        <div className="space-y-4">{children}</div>
      ) : (
        <p className="py-10 text-center text-sm text-black/45">
          Select Assets or Uniform to continue.
        </p>
      )}
    </div>
  );
}
