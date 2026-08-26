import { describe, expect, it } from "vitest";
import {
  floorPayoutToAed5,
  payrollBenefitPayoutAmount,
} from "../rounding";

describe("payrollBenefitPayoutAmount", () => {
  it("floors tips and service charge to AED 5", () => {
    expect(payrollBenefitPayoutAmount("tips", 256.48)).toBe(255);
    expect(payrollBenefitPayoutAmount("tips", 425.89)).toBe(425);
    expect(payrollBenefitPayoutAmount("service_charge", 259.99)).toBe(255);
    expect(floorPayoutToAed5(256.48)).toBe(255);
  });

  it("leaves other benefits exact", () => {
    expect(payrollBenefitPayoutAmount("flight_ticket", 256.48)).toBe(256.48);
    expect(payrollBenefitPayoutAmount("payback", 256.48)).toBe(256.48);
  });
});
