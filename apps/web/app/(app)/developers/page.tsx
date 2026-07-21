import { PersistenceDiagnosticPanel } from "@/components/developers/persistence-diagnostic-panel";
import { ModulePageTitle } from "@/components/layout/module-page-title";

export default function DevelopersPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <ModulePageTitle>Developers</ModulePageTitle>
      <PersistenceDiagnosticPanel />
    </div>
  );
}
