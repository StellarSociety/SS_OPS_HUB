"use client";

import { ModuleShortcuts } from "@/components/layout/module-shortcuts";

export function SalesModuleShortcuts({
  navigate = true,
}: {
  navigate?: boolean;
}) {
  return (
    <ModuleShortcuts
      basePath="/sales"
      ariaLabel="Sales apps"
      navigate={navigate}
    />
  );
}
