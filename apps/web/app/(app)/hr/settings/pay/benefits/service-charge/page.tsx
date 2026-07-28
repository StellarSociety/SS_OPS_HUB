import { ServiceChargeSettingsForm } from "@/components/hr/service-charge-settings-form";
import type { BenefitsPositionOption } from "@/components/hr/benefits-point-tiers-editor";
import {
  mergeServiceChargeSettings,
  type HrServiceChargeSettings,
} from "@/lib/hr/benefits";
import { getHrPageContext } from "@/lib/hr/page-context";
import { canAdminLookups, canEditBenefits } from "@/lib/hr/permissions";
import { getHrVenueSetting, listDepartments, listPositions } from "@/lib/hr/store";
import { HR_SETTINGS_KEYS } from "@/lib/hr/types";

export default async function HrPayBenefitsServiceChargeSettingsPage() {
  const { supabase, venue, permissions } = await getHrPageContext();

  const canConfigure =
    canEditBenefits(permissions, venue.id) ||
    canAdminLookups(permissions, venue.id);

  const [stored, departments, positionsRaw] = await Promise.all([
    getHrVenueSetting<Partial<HrServiceChargeSettings>>(
      supabase,
      venue.id,
      HR_SETTINGS_KEYS.benefitsServiceCharge,
      {},
    ),
    listDepartments(supabase, venue.id),
    listPositions(supabase, venue.id),
  ]);
  const settings = mergeServiceChargeSettings(stored);

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
        <ServiceChargeSettingsForm settings={settings} positions={positions} />
      ) : (
        <p className="text-sm text-black/55">
          You need benefits or payroll edit access to change these settings.
        </p>
      )}
    </div>
  );
}
