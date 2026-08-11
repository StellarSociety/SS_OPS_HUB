import { ModulePageTitle } from "@/components/layout/module-page-title";
import { getHrPageContext } from "@/lib/hr/page-context";

/**
 * Placeholder page — the sidebar already linked here with no route behind it,
 * so requests fell through to /hr/[id].
 */
export default async function HrCommunicationsPage() {
  await getHrPageContext();

  return (
    <div className="space-y-6">
      <div>
        <ModulePageTitle>Communications</ModulePageTitle>
      </div>
    </div>
  );
}
