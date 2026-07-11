import { NextResponse } from "next/server";
import {
  findOrCreateUserByPhone,
  getAdminClient,
  getCaller,
  maskPhone,
  writeAudit,
} from "@/lib/server/admin";
import { normalizeIranianPhoneNumber } from "@/lib/phone";

/**
 * POST — platform_admin creates a clinic owner by phone number.
 * Body: { phone, fullName, clinicName? , clinicId? }
 * Creates/finds the auth user, sets role clinic_owner, creates or reuses
 * the clinic, adds the membership, and writes an audit log.
 */
export async function POST(req: Request) {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (caller.role !== "platform_admin")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const admin = getAdminClient();
  if (!admin)
    return NextResponse.json({ error: "server not configured" }, { status: 503 });

  let body: { phone?: string; fullName?: string; clinicName?: string; clinicId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const normalized = normalizeIranianPhoneNumber(body.phone ?? "");
  if (!normalized.ok)
    return NextResponse.json({ error: "invalid_phone" }, { status: 422 });
  const fullName = (body.fullName ?? "").trim();
  if (!fullName)
    return NextResponse.json({ error: "invalid_name" }, { status: 422 });
  if (!body.clinicId && !(body.clinicName ?? "").trim())
    return NextResponse.json({ error: "invalid_clinic" }, { status: 422 });

  const found = await findOrCreateUserByPhone(admin, normalized.e164, fullName);
  if ("error" in found)
    return NextResponse.json({ error: "provision_failed" }, { status: 500 });

  // Clinic: reuse or create.
  let clinicId = body.clinicId ?? null;
  if (!clinicId) {
    const { data: clinic, error } = await admin
      .from("clinics")
      .insert({ name: body.clinicName!.trim() })
      .select("id")
      .single();
    if (error || !clinic)
      return NextResponse.json({ error: "provision_failed" }, { status: 500 });
    clinicId = clinic.id as string;
  }

  const { error: roleErr } = await admin
    .from("profiles")
    .update({ role: "clinic_owner", full_name: fullName })
    .eq("id", found.userId);
  if (roleErr)
    return NextResponse.json({ error: "provision_failed" }, { status: 500 });

  await admin.from("clinic_members").upsert(
    { clinic_id: clinicId, user_id: found.userId, member_role: "clinic_owner" },
    { onConflict: "clinic_id,user_id" }
  );

  await writeAudit(admin, {
    actorId: caller.id,
    action: "clinic_owner.created",
    targetUserId: found.userId,
    clinicId,
    detail: { phone_masked: maskPhone(normalized.e164), created: found.created },
  });

  return NextResponse.json({ ok: true, clinicId });
}
