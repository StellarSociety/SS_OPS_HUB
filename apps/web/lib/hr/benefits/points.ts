import type { BenefitPointTier } from "./types";
import { inferPointTierKey } from "./match";

export function resolveBenefitPointsForStaff(
  staff: {
    position_id?: string | null;
    position_name?: string | null;
    department_name?: string | null;
  },
  pointTiers: BenefitPointTier[],
  fallbackPoints = 1.5,
): number {
  const positionId = staff.position_id?.trim();
  if (positionId) {
    const matched = pointTiers.find((tier) =>
      (tier.positionIds ?? []).includes(positionId),
    );
    if (matched) return matched.points;
  }

  const key = inferPointTierKey(staff.position_name, staff.department_name);
  const tier = pointTiers.find((t) => t.key === key);
  return tier?.points ?? fallbackPoints;
}
