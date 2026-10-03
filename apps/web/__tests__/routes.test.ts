import { describe, expect, it } from "vitest";
import { isPatientPortalPath, isPublicAuthPath } from "@/lib/routes";

describe("isPatientPortalPath", () => {
  it.each(["/patient", "/patient/", "/patient/program", "/patient/tickets/42"])(
    "accepts the patient portal path %s",
    (pathname) => {
      expect(isPatientPortalPath(pathname)).toBe(true);
    }
  );

  it.each([
    "/",
    "/patient-education",
    "/patients",
    "/patientish",
    "/Patient",
  ])("rejects the non-patient path %s", (pathname) => {
    expect(isPatientPortalPath(pathname)).toBe(false);
  });
});

describe("isPublicAuthPath", () => {
  it.each(["/auth", "/auth/forgot-password", "/auth/update-password"])(
    "accepts a standalone auth path %s",
    (pathname) => expect(isPublicAuthPath(pathname)).toBe(true)
  );

  it.each(["/", "/author", "/authentication", "/patient"])(
    "rejects a non-auth path %s",
    (pathname) => expect(isPublicAuthPath(pathname)).toBe(false)
  );
});
