import type { AuthProfile } from "@/lib/store/AuthContext";
import type { PatientRecord } from "@/lib/types";

/*
 * A mirror of the RLS policies in database/migrations/003 and 004.
 *
 * The database is the authority — nothing here grants access, and every
 * write is still checked server-side. The point is that the UI should not
 * offer a button whose only outcome is a silent RLS rejection: without
 * this, a therapist sees "Add exercise", clicks it, and gets "Save failed"
 * with no way to know they simply were not assigned to the patient.
 *
 * Keep in step with the migrations. If a policy changes, change it here
 * too, or the UI starts lying in one direction or the other.
 */

function roleIn(
  profile: AuthProfile | null,
  clinicId: string | null,
  roles: string[]
): boolean {
  if (!profile || !clinicId) return false;
  const m = profile.memberships.find((x) => x.clinicId === clinicId);
  return !!m && roles.includes(m.memberRole);
}

const isAdmin = (p: AuthProfile | null) => p?.role === "platform_admin";

export const isMember = (p: AuthProfile | null, clinicId: string | null) =>
  isAdmin(p) ||
  roleIn(p, clinicId, ["clinic_owner", "therapist", "clinic_staff"]);

export const isOwner = (p: AuthProfile | null, clinicId: string | null) =>
  isAdmin(p) || roleIn(p, clinicId, ["clinic_owner"]);

export const isStaff = (p: AuthProfile | null, clinicId: string | null) =>
  roleIn(p, clinicId, ["clinic_staff"]);

const isAssigned = (p: AuthProfile | null, patient: PatientRecord) =>
  !!p && patient.therapistIds.includes(p.id);

/** `patients insert` — any clinic member. */
export const canCreatePatient = isMember;

/** `can_edit_patient_demographics` — admin, owner, staff, assigned therapist. */
export function canEditDemographics(
  p: AuthProfile | null,
  patient: PatientRecord
): boolean {
  return (
    isAdmin(p) ||
    isOwner(p, patient.clinicId) ||
    isStaff(p, patient.clinicId) ||
    isAssigned(p, patient)
  );
}

/**
 * `can_manage_clinical_record` — admin, owner, or the ASSIGNED therapist.
 * Gates care episodes, the exercise program, and replying to tickets.
 * clinic_staff is deliberately excluded.
 */
export function canManageClinicalRecord(
  p: AuthProfile | null,
  patient: PatientRecord
): boolean {
  return (
    isAdmin(p) || isOwner(p, patient.clinicId) || isAssigned(p, patient)
  );
}

/** `link_patient_account` RPC — admin, owner, or clinic staff. */
export function canLinkAccount(
  p: AuthProfile | null,
  patient: PatientRecord
): boolean {
  return (
    isAdmin(p) || isOwner(p, patient.clinicId) || isStaff(p, patient.clinicId)
  );
}

/** `patient_therapists manage` — assigning someone ELSE is owner-only. */
export function canAssignOtherTherapist(
  p: AuthProfile | null,
  patient: PatientRecord
): boolean {
  return isAdmin(p) || isOwner(p, patient.clinicId);
}

/**
 * `therapist self assign` (migration 004) — a member may attach themselves
 * to a patient of their own clinic. Owners already have blanket access, so
 * this only ever matters for therapists.
 */
export function canSelfAssign(
  p: AuthProfile | null,
  patient: PatientRecord
): boolean {
  if (!p || isAssigned(p, patient)) return false;
  return isMember(p, patient.clinicId);
}

/** `cases insert` — clinic members except clinic_staff. */
export const canCreateCase = (
  p: AuthProfile | null,
  clinicId: string | null
) => isMember(p, clinicId) && !isStaff(p, clinicId);

/**
 * Why a clinical action is unavailable, phrased for the person looking at
 * the disabled button rather than for the log.
 */
export function clinicalBlockReason(
  p: AuthProfile | null,
  patient: PatientRecord
): string | null {
  if (canManageClinicalRecord(p, patient)) return null;
  if (isStaff(p, patient.clinicId)) {
    return "Clinic staff can manage bookings and contact details, but not the clinical record.";
  }
  if (isMember(p, patient.clinicId)) {
    return "You are not assigned to this patient yet. Assign yourself above to open the clinical record.";
  }
  return "This patient belongs to another clinic.";
}
