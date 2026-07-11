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
 * POST — a clinic_owner (or platform_admin) invites a therapist or
 * clinic_staff to their own clinic by phone number.
 * Body: { phone, fullName, role: "therapist" | "clinic_staff", clinicId }
 * clinic_owner and platform_admin roles can NEVER be granted here, and an
 * owner can only invite into a clinic they own.
 */
export async function POST(req: Request) {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (caller.role !== "clinic_owner" && caller.role !== "platform_admin")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const admin = getAdminClient();
  if (!admin)
    return NextResponse.json({ error: "server not configured" }, { status: 503 });

  let body: { phone?: string; fullName?: string; role?: string; clinicId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  // Only these two roles can be invited — never owner/admin (anti-escalation).
  if (body.role !== "therapist" && body.role !== "clinic_staff")
    return NextResponse.json({ error: "invalid_role" }, { status: 422 });

  const clinicId = body.clinicId ?? caller.clinicIds[0];
  if (!clinicId)
    return NextResponse.json({ error: "invalid_clinic" }, { status: 422 });
  // Owners may only invite into their own clinics.
  if (caller.role === "clinic_owner" && !caller.clinicIds.includes(clinicId))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const normalized = normalizeIranianPhoneNumber(body.phone ?? "");
  if (!normalized.ok)
    return NextResponse.json({ error: "invalid_phone" }, { status: 422 });
  const fullName = (body.fullName ?? "").trim();
  if (!fullName)
    return NextResponse.json({ error: "invalid_name" }, { status: 422 });

  const found = await findOrCreateUserByPhone(admin, normalized.e164, fullName);
  if ("error" in found)
    return NextResponse.json({ error: "provision_failed" }, { status: 500 });

  // Never downgrade an existing owner/admin through an invite.
  const { data: existingProfile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", found.userId)
    .maybeSingle();
  if (
    existingProfile &&
    (existingProfile.role === "platform_admin" ||
      existingProfile.role === "clinic_owner")
  ) {
    return NextResponse.json({ error: "conflict_role" }, { status: 409 });
  }

  await admin
    .from("profiles")
    .update({ role: body.role, full_name: fullName })
    .eq("id", found.userId);
  await admin.from("clinic_members").upsert(
    { clinic_id: clinicId, user_id: found.userId, member_role: body.role },
    { onConflict: "clinic_id,user_id" }
  );

  await writeAudit(admin, {
    actorId: caller.id,
    action: "member.invited",
    targetUserId: found.userId,
    clinicId,
    detail: {
      role: body.role,
      phone_masked: maskPhone(normalized.e164),
      created: found.created,
    },
  });

  return NextResponse.json({ ok: true });
}
