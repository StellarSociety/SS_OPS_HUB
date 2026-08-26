import type { BenefitPointTier } from "./types";
import { inferPointTierKey } from "./match";

/** Pay → Benefits mapping only: HR position assigned to a points tier. */
export function findMappedBenefitPointTierForStaff(
  staff: {
    position_id?: string | null;
  },
  pointTiers: BenefitPointTier[],
): BenefitPointTier | null {
  const positionId = staff.position_id?.trim();
  if (!positionId) return null;
  return (
    pointTiers.find((tier) => (tier.positionIds ?? []).includes(positionId)) ??
    null
  );
}

/** Tier from Pay → Benefits position mapping, then name heuristics. */
export function findBenefitPointTierForStaff(
  staff: {
    position_id?: string | null;
    position_name?: string | null;
    department_name?: string | null;
  },
  pointTiers: BenefitPointTier[],
): BenefitPointTier | null {
  const mapped = findMappedBenefitPointTierForStaff(staff, pointTiers);
  if (mapped) return mapped;

  const key = inferPointTierKey(staff.position_name, staff.department_name);
  return pointTiers.find((t) => t.key === key) ?? null;
}

export function resolveBenefitPointsForStaff(
  staff: {
    position_id?: string | null;
    position_name?: string | null;
    department_name?: string | null;
  },
  pointTiers: BenefitPointTier[],
  fallbackPoints = 1.5,
): number {
  return (
    findBenefitPointTierForStaff(staff, pointTiers)?.points ?? fallbackPoints
  );
}
