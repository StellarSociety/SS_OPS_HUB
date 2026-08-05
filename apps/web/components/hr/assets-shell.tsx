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
  if (
    pathname === "/hr/assets/uniform" ||
    pathname.startsWith("/hr/assets/uniform/")
  ) {
    return true;
  }
  if (
    pathname === "/hr/assets/insurance" ||
    pathname.startsWith("/hr/assets/insurance/")
  ) {
    return true;
  }
  if (
    pathname === "/hr/assets/certifications" ||
    pathname.startsWith("/hr/assets/certifications/")
  ) {
    return true;
  }
  return (
    pathname === "/hr/assets/visa" || pathname.startsWith("/hr/assets/visa/")
  );
}

export function AssetsShell({ children }: AssetsShellProps) {
  const pathname = useRelativePathname();
  const showContent = hasSelectedSection(pathname);

  return (
    <div className="space-y-6">
      <div>
        <ModulePageTitle>Staff Compliance</ModulePageTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Uniforms, assets, certifications, insurance & visa
        </p>
        <hr className="mt-4 border-black/10" />
      </div>
      <AssetsSubNav />
      <hr className="border-black/10" />
      {showContent ? (
        <div className="space-y-4">{children}</div>
      ) : (
        <p className="py-10 text-center text-sm text-black/45">
          Select a section to continue.
        </p>
      )}
    </div>
  );
}
