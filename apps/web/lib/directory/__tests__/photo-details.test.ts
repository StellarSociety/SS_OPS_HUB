import { describe, expect, it } from "vitest";
import { staffPhotoDetailsFromDirectoryMember } from "@/components/hr/staff-photo-thumbnail";
import {
  directoryWhatsappUrl,
  mailtoUrl,
  phoneTelUrl,
} from "@/lib/directory/links";

describe("staff photo lightbox details", () => {
  it("maps directory contact fields onto the photo dialog", () => {
    expect(
      staffPhotoDetailsFromDirectoryMember({
        empNo: "ORL0005",
        departmentName: "Culinary",
        positionName: "Sr. Chef de Partie",
        employmentStatusName: "ON Board",
        workingStatusName: "Full Time",
        nationalityName: "Nepal",
        dob: "1993-01-01",
        joiningDate: "2025-08-15",
        contactPhone: "+971501234567",
        whatsapp: "+971501234567",
        personalEmail: "prabesh@example.com",
        workEmail: "prabesh@orillarestaurant.com",
      }),
    ).toMatchObject({
      empNo: "ORL0005",
      department: "Culinary",
      position: "Sr. Chef de Partie",
      employeeStatus: "ON Board",
      workingStatus: "Full Time",
      nationality: "Nepal",
      contactPhone: "+971501234567",
      personalEmail: "prabesh@example.com",
      workEmail: "prabesh@orillarestaurant.com",
    });
  });

  it("turns phone and email values into tappable links", () => {
    expect(phoneTelUrl("+971 50 123 4567")).toBe("tel:+971501234567");
    expect(directoryWhatsappUrl("+971501234567")).toContain("wa.me");
    expect(mailtoUrl("chef@orillarestaurant.com")).toBe(
      "mailto:chef@orillarestaurant.com",
    );
    expect(mailtoUrl("not-an-email")).toBeNull();
  });
});
