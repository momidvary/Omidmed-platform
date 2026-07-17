import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient as createServerClient } from "@/utils/supabase/server";
import {
  findOrCreateUserByPhone,
  getAdminClient,
  getCaller,
  maskPhone,
  writeAudit,
} from "@/lib/server/admin";
import { normalizeIranianPhoneNumber } from "@/lib/phone";

/**
 * POST — link a patient record to a phone-OTP login account.
 * Body: { patientId, phone }
 * The caller must be clinic staff who can see the patient (checked with
 * their OWN RLS session). Duplicate-phone situations are surfaced as a
 * 409 review step — records are never merged automatically.
 */
export async function POST(req: Request) {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (caller.role === "patient")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const admin = getAdminClient();
  if (!admin)
    return NextResponse.json({ error: "server not configured" }, { status: 503 });

  let body: { patientId?: string; phone?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (!body.patientId)
    return NextResponse.json({ error: "invalid_patient" }, { status: 422 });
  const normalized = normalizeIranianPhoneNumber(body.phone ?? "");
  if (!normalized.ok)
    return NextResponse.json({ error: "invalid_phone" }, { status: 422 });

  // Authorization through the caller's own RLS session: they must be able
  // to see (and by role, administer) this patient.
  const userClient = createServerClient(await cookies());
  const { data: patient } = await userClient
    .from("patients")
    .select("id, clinic_id, full_name, phone")
    .eq("id", body.patientId)
    .maybeSingle();
  if (!patient)
    return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Duplicate review: another patient record already carries this phone.
  const { data: dupes } = await admin
    .from("patients")
    .select("id")
    .eq("phone", normalized.e164)
    .neq("id", patient.id)
    .limit(1);
  if ((dupes?.length ?? 0) > 0) {
    return NextResponse.json(
      { error: "duplicate_phone_review" },
      { status: 409 }
    );
  }

  const found = await findOrCreateUserByPhone(
    admin,
    normalized.e164,
    patient.full_name as string
  );
  if ("error" in found)
    return NextResponse.json({ error: "provision_failed" }, { status: 500 });

  // The account must not already be linked to a DIFFERENT patient.
  const { data: existingLink } = await admin
    .from("patient_users")
    .select("patient_id")
    .eq("user_id", found.userId)
    .maybeSingle();
  if (existingLink && existingLink.patient_id !== patient.id) {
    return NextResponse.json(
      { error: "duplicate_phone_review" },
      { status: 409 }
    );
  }

  await admin.from("profiles").update({ role: "patient" }).eq("id", found.userId);
  await admin.from("patient_users").upsert(
    { patient_id: patient.id, user_id: found.userId },
    { onConflict: "patient_id,user_id" }
  );
  await admin
    .from("patients")
    .update({ phone: normalized.e164 })
    .eq("id", patient.id);

  await writeAudit(admin, {
    actorId: caller.id,
    action: "patient.linked",
    targetUserId: found.userId,
    clinicId: patient.clinic_id as string,
    patientId: patient.id as string,
    detail: { phone_masked: maskPhone(normalized.e164), created: found.created },
  });

  return NextResponse.json({ ok: true });
}
