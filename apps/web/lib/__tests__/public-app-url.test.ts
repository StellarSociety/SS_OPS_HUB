import { describe, expect, it } from "vitest";
import { joinAppUrl } from "@/lib/public-app-url";

describe("joinAppUrl", () => {
  it("joins an in-app path onto the subdomain origin", () => {
    expect(
      joinAppUrl(
        "/api/sentiment/google/callback",
        "https://opshub.stellarsocietygroup.com",
      ),
    ).toBe(
      "https://opshub.stellarsocietygroup.com/api/sentiment/google/callback",
    );
  });

  it("does not prefix localhost", () => {
    expect(joinAppUrl("/login", "http://localhost:3000")).toBe(
      "http://localhost:3000/login",
    );
  });
});
