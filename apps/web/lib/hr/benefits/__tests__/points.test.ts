import { describe, expect, it } from "vitest";
import { inferPointTierKey } from "../match";
import {
  findBenefitPointTierForStaff,
  findMappedBenefitPointTierForStaff,
} from "../points";
import { DEFAULT_GRATUITY_POINT_TIERS } from "../types";

const COMMIS_CHEF_2 = "cd836c90-468d-4edf-bba9-5333e32cabb4";
const FB_RUNNER = "339cd51a-1c9c-4f15-b29f-5f235d00187c";

const orillaGratuityTiers = DEFAULT_GRATUITY_POINT_TIERS.map((tier) => {
  if (tier.key === "general") {
    return { ...tier, positionIds: [COMMIS_CHEF_2] };
  }
  if (tier.key === "commis_helper") {
    return { ...tier, positionIds: [FB_RUNNER] };
  }
  return { ...tier, positionIds: [] };
});

describe("inferPointTierKey", () => {
  it("treats Commis Chef ranks as general staff, not the 1.0 helper tier", () => {
    expect(inferPointTierKey("Commis Chef 2", "Culinary")).toBe("general");
    expect(inferPointTierKey("Commis Chef 1", "Culinary")).toBe("general");
  });

  it("keeps trainees, runners, and stewards on the helper tier", () => {
    expect(inferPointTierKey("Commis Trainee", "Culinary")).toBe(
      "commis_helper",
    );
    expect(inferPointTierKey("F&B Runner", "F&B Service")).toBe(
      "commis_helper",
    );
    expect(inferPointTierKey("Steward", "Culinary")).toBe("commis_helper");
  });
});

describe("findMappedBenefitPointTierForStaff", () => {
  it("uses Pay → Benefits position IDs, not stored points or job-title guesses", () => {
    expect(
      findMappedBenefitPointTierForStaff(
        { position_id: COMMIS_CHEF_2 },
        orillaGratuityTiers,
      )?.key,
    ).toBe("general");
    expect(
      findMappedBenefitPointTierForStaff(
        { position_id: FB_RUNNER },
        orillaGratuityTiers,
      )?.key,
    ).toBe("commis_helper");
  });
});

describe("findBenefitPointTierForStaff", () => {
  it("prefers the mapped General tier for Commis Chef 2 even if the title contains commis", () => {
    expect(
      findBenefitPointTierForStaff(
        {
          position_id: COMMIS_CHEF_2,
          position_name: "Commis Chef 2",
          department_name: "Culinary",
        },
        orillaGratuityTiers,
      )?.points,
    ).toBe(1.5);
  });
});
