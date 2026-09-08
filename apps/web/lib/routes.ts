/** True only for the patient portal itself and its nested routes. */
export function isPatientPortalPath(pathname: string): boolean {
  return pathname === "/patient" || pathname.startsWith("/patient/");
}

/** Auth recovery pages render without the clinician application chrome. */
export function isPublicAuthPath(pathname: string): boolean {
  return pathname === "/auth" || pathname.startsWith("/auth/");
}
