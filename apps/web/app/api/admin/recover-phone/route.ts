import { NextResponse } from "next/server";
import {
  getAdminClient,
  getCaller,
  maskPhone,
  writeAudit,
} from "@/lib/server/admin";
import { normalizeIranianPhoneNumber } from "@/lib/phone";

/**
 * POST — administrative phone change / lost-SIM recovery.
 * Body: { targetUserId, newPhone, reason }
 *
 * Rules:
 * - platform_admin may recover anyone EXCEPT another platform_admin
 *   (admin recovery requires the SQL editor — stronger control).
 * - clinic_owner may recover members of their own clinic and patients
 *   linked to their clinic.
 * - Identity must be verified out-of-band by the clinic (documented).
 * - Auth phone + profile (+ patient record, if any) update together;
 *   all previous sessions are revoked; the audit log stores only
 *   MASKED old/new numbers and the reason.
 */
export async function POST(req: Request) {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (caller.role !== "platform_admin" && caller.role !== "clinic_owner")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const admin = getAdminClient();
  if (!admin)
    return NextResponse.json({ error: "server not configured" }, { status: 503 });

  let body: { targetUserId?: string; newPhone?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (!body.targetUserId)
    return NextResponse.json({ error: "invalid_target" }, { status: 422 });
  const reason = (body.reason ?? "").trim();
  if (reason.length < 5)
    return NextResponse.json({ error: "reason_required" }, { status: 422 });
  const normalized = normalizeIranianPhoneNumber(body.newPhone ?? "");
  if (!normalized.ok)
    return NextResponse.json({ error: "invalid_phone" }, { status: 422 });

  const { data: target } = await admin
    .from("profiles")
    .select("id, role, phone")
    .eq("id", body.targetUserId)
    .maybeSingle();
  if (!target) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Stronger control for admins: recover only via SQL editor.
  if (target.role === "platform_admin")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Owners: target must belong to their clinic (member or linked patient).
  if (caller.role === "clinic_owner") {
    const { data: membership } = await admin
      .from("clinic_members")
      .select("clinic_id")
      .eq("user_id", target.id)
      .in("clinic_id", caller.clinicIds);
    const { data: patientLink } = await admin
      .from("patient_users")
      .select("patient_id, patients!inner(clinic_id)")
      .eq("user_id", target.id);
    const patientInClinic = (patientLink ?? []).some((row) =>
      caller.clinicIds.includes(
        (row.patients as unknown as { clinic_id: string }).clinic_id
      )
    );
    if ((membership?.length ?? 0) === 0 && !patientInClinic)
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // The new number must not belong to someone else.
  const { data: taken } = await admin
    .from("profiles")
    .select("id")
    .eq("phone", normalized.e164)
    .neq("id", target.id)
    .maybeSingle();
  if (taken)
    return NextResponse.json({ error: "phone_in_use" }, { status: 409 });

  const { error: authErr } = await admin.auth.admin.updateUserById(target.id, {
    phone: normalized.e164.replace("+", ""),
    phone_confirm: true,
  });
  if (authErr)
    return NextResponse.json({ error: "update_failed" }, { status: 500 });

  await admin
    .from("profiles")
    .update({ phone: normalized.e164 })
    .eq("id", target.id);
  // Keep linked patient records in sync.
  const { data: links } = await admin
    .from("patient_users")
    .select("patient_id")
    .eq("user_id", target.id);
  for (const link of links ?? []) {
    await admin
      .from("patients")
      .update({ phone: normalized.e164 })
      .eq("id", link.patient_id);
  }

  // Kill every previous session — the old SIM must not stay signed in.
  await admin.auth.admin.signOut(target.id, "global").catch(() => {});

  await writeAudit(admin, {
    actorId: caller.id,
    action: "phone.recovered",
    targetUserId: target.id,
    detail: {
      reason,
      old_phone_masked: target.phone ? maskPhone(target.phone as string) : null,
      new_phone_masked: maskPhone(normalized.e164),
    },
  });

  return NextResponse.json({ ok: true });
}
