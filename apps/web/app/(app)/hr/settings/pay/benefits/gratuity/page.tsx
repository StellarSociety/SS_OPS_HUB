import { GratuitySettingsForm } from "@/components/hr/gratuity-settings-form";
import type { BenefitsPositionOption } from "@/components/hr/benefits-point-tiers-editor";
import {
  mergeGratuitySettings,
  type HrGratuitySettings,
} from "@/lib/hr/benefits";
import { getHrPageContext } from "@/lib/hr/page-context";
import { canAdminLookups, canEditBenefits } from "@/lib/hr/permissions";
import { getHrVenueSetting, listDepartments, listPositions } from "@/lib/hr/store";
import { HR_SETTINGS_KEYS } from "@/lib/hr/types";

export default async function HrPayBenefitsGratuitySettingsPage() {
  const { supabase, venue, permissions } = await getHrPageContext();

  const canConfigure =
    canEditBenefits(permissions, venue.id) ||
    canAdminLookups(permissions, venue.id);

  const [stored, departments, positionsRaw] = await Promise.all([
    getHrVenueSetting<Partial<HrGratuitySettings>>(
      supabase,
      venue.id,
      HR_SETTINGS_KEYS.benefitsGratuity,
      {},
    ),
    listDepartments(supabase, venue.id),
    listPositions(supabase, venue.id),
  ]);
  const settings = mergeGratuitySettings(stored);

  const deptNameById = new Map(
    departments.map((d) => [d.id as string, d.name as string]),
  );
  const positions: BenefitsPositionOption[] = positionsRaw.map((p) => {
    const dept = deptNameById.get(p.department_id as string);
    const name = String(p.name ?? "");
    return {
      id: p.id as string,
      label: dept ? `${dept} · ${name}` : name,
    };
  });

  return (
    <div className="space-y-4">
      {canConfigure ? (
        <GratuitySettingsForm settings={settings} positions={positions} />
      ) : (
        <p className="text-sm text-black/55">
          You need benefits or payroll edit access to change these settings.
        </p>
      )}
    </div>
  );
}
