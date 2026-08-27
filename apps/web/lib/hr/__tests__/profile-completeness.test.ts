import { describe, expect, it } from "vitest";
import { emptyStaffForm } from "@/lib/hr/staff-form";
import {
  listProfileMissingAttachments,
  listProfileMissingFields,
  listProfileMissingItems,
} from "@/lib/hr/profile-completeness";

describe("staff profile completeness", () => {
  it("lists empty form fields beyond the insights subset", () => {
    const form = emptyStaffForm("100");
    const hits = listProfileMissingFields(form, { photoUrl: null });
    const labels = hits.map((h) => h.label);
    expect(labels).toContain("Profile photo");
    expect(labels).toContain("Civil status");
    expect(labels).toContain("WhatsApp");
    expect(labels).toContain("Personal email");
    expect(labels).toContain("Work email");
    expect(labels).toContain("EID issue date");
    expect(labels).toContain("Swift code");
    expect(labels).toContain("Contract expiry");
    expect(labels).toContain("OHC date");
    expect(labels).not.toContain("Termination type");
  });

  it("requires termination type only after a termination date is set", () => {
    const form = emptyStaffForm("100");
    form.termination_date = "2026-01-15";
    const hits = listProfileMissingFields(form);
    expect(hits.some((h) => h.field === "termination_type")).toBe(true);
  });

  it("lists expected document files as missing until uploaded", () => {
    const form = emptyStaffForm("100");
    const hits = listProfileMissingAttachments(form, []);
    const labels = hits.map((h) => h.label);
    expect(labels).toContain("Passport file");
    expect(labels).toContain("Emirates ID file (Front)");
    expect(labels).toContain("Emirates ID file (Back)");
    expect(labels).toContain("Offer Letter file");
    expect(labels).toContain("Labour Contract file");
    expect(labels).toContain("Training Certificates file (PIC)");
    expect(labels).not.toContain("Visa Cancelation file");
    expect(hits.some((h) => h.kind === "attachment")).toBe(true);
  });

  it("drops an attachment once a matching file is present", () => {
    const form = emptyStaffForm("100");
    const hits = listProfileMissingAttachments(form, [
      { docKind: "passport", fileSlotId: "default", isMissing: false },
    ]);
    expect(hits.some((h) => h.field === "doc:passport:default")).toBe(false);
    expect(hits.some((h) => h.field === "doc:emirates_id:front")).toBe(true);
  });

  it("combines fields and attachments in the profile missing list", () => {
    const form = emptyStaffForm("100");
    form.full_name = "Ada Lovelace";
    form.first_name = "Ada";
    form.last_name = "Lovelace";
    const items = listProfileMissingItems(form, {
      photoUrl: "https://example.com/ada.webp",
      present: [],
    });
    expect(items.some((h) => h.field === "photo")).toBe(false);
    expect(items.some((h) => h.field === "full_name")).toBe(false);
    expect(items.some((h) => h.kind === "attachment")).toBe(true);
    expect(items.length).toBeGreaterThan(10);
  });
});
