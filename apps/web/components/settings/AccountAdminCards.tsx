"use client";

import { useState } from "react";
import { useAuth } from "@/lib/store/AuthContext";
import { getSupabase } from "@/lib/supabase/client";
import { isMockMode } from "@/lib/config";
import { normalizeIranianPhoneNumber, toEnglishDigits } from "@/lib/phone";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Form";
import { Icon } from "@/components/ui/Icon";

/*
 * Phone-based account administration (Supabase mode only):
 * - platform_admin: create clinic owners
 * - clinic_owner: invite therapists / clinic staff
 * - staff: link a patient record to a phone login
 * - everyone: change their own phone (verified by OTP on the new number)
 */
export function AccountAdminCards() {
  const { profile } = useAuth();
  if (isMockMode || !profile) return null;
  return (
    <>
      {profile.role === "platform_admin" && <CreateOwnerCard />}
      {(profile.role === "platform_admin" || profile.role === "clinic_owner") && (
        <InviteMemberCard clinicId={profile.clinicIds[0]} />
      )}
      {profile.role !== "patient" && <LinkPatientCard />}
      <ChangeMyPhoneCard />
    </>
  );
}

function useApiPost(path: string) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function post(body: Record<string, unknown>): Promise<boolean> {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      setBusy(false);
      if (res.ok) {
        setMsg({ ok: true, text: "Done ✓" });
        return true;
      }
      const map: Record<string, string> = {
        invalid_phone: "Invalid mobile number.",
        invalid_name: "Name is required.",
        invalid_clinic: "Clinic is required.",
        invalid_role: "Invalid role.",
        reason_required: "A reason is required.",
        duplicate_phone_review:
          "This phone is already attached to another record — review required; nothing was merged.",
        phone_in_use: "This phone belongs to another account.",
        conflict_role: "This phone belongs to an owner/admin account.",
        forbidden: "You don't have permission for this action.",
      };
      setMsg({ ok: false, text: map[json.error ?? ""] ?? "Request failed — inputs kept." });
      return false;
    } catch {
      setBusy(false);
      setMsg({ ok: false, text: "Network error — inputs kept." });
      return false;
    }
  }
  return { busy, msg, post };
}

function CreateOwnerCard() {
  const { busy, msg, post } = useApiPost("/api/admin/clinic-owners");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [clinicName, setClinicName] = useState("");

  return (
    <Card>
      <CardHeader
        title="Create Clinic Owner (platform admin)"
        subtitle="Provisions a phone-OTP account, the clinic, and the membership"
        icon={<Icon name="shield" width={18} height={18} />}
      />
      <CardBody className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Full name" required>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>
        <Field label="Mobile (e.g. 0912…)" required>
          <Input dir="ltr" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="Clinic name" required>
          <Input value={clinicName} onChange={(e) => setClinicName(e.target.value)} />
        </Field>
        <div className="sm:col-span-3 flex items-center gap-3">
          <Button
            size="sm"
            disabled={busy}
            onClick={async () => {
              const ok = await post({ phone, fullName, clinicName });
              if (ok) {
                setFullName("");
                setPhone("");
                setClinicName("");
              }
            }}
          >
            {busy ? "Creating…" : "Create owner"}
          </Button>
          {msg && (
            <p className={`text-xs ${msg.ok ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}`}>
              {msg.text}
            </p>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

function InviteMemberCard({ clinicId }: { clinicId?: string }) {
  const { busy, msg, post } = useApiPost("/api/clinic/members");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<"therapist" | "clinic_staff">("therapist");

  return (
    <Card>
      <CardHeader
        title="Invite Team Member (clinic owner)"
        subtitle="Therapist or clinic staff — they sign in with phone OTP"
        icon={<Icon name="user" width={18} height={18} />}
      />
      <CardBody className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Full name" required>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>
        <Field label="Mobile" required>
          <Input dir="ltr" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="Role" required>
          <Select value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
            <option value="therapist">Therapist</option>
            <option value="clinic_staff">Clinic staff</option>
          </Select>
        </Field>
        <div className="sm:col-span-3 flex items-center gap-3">
          <Button
            size="sm"
            disabled={busy}
            onClick={async () => {
              const ok = await post({ phone, fullName, role, clinicId });
              if (ok) {
                setFullName("");
                setPhone("");
              }
            }}
          >
            {busy ? "Inviting…" : "Invite member"}
          </Button>
          {msg && (
            <p className={`text-xs ${msg.ok ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}`}>
              {msg.text}
            </p>
          )}
        </div>
        <p className="sm:col-span-3 text-[11px] text-[var(--color-ink-faint)]">
          Owners can never grant platform_admin or clinic_owner here, and can
          only invite into their own clinic. Every invite is audit-logged.
        </p>
      </CardBody>
    </Card>
  );
}

function LinkPatientCard() {
  const { busy, msg, post } = useApiPost("/api/clinic/patients/link");
  const [patientId, setPatientId] = useState("");
  const [phone, setPhone] = useState("");

  return (
    <Card>
      <CardHeader
        title="Link Patient Account"
        subtitle="Attach a patient record to a phone so the patient can sign in with OTP"
        icon={<Icon name="new-case" width={18} height={18} />}
      />
      <CardBody className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Patient record ID (UUID)" required hint="From the patients table">
          <Input dir="ltr" value={patientId} onChange={(e) => setPatientId(e.target.value)} />
        </Field>
        <Field label="Patient mobile" required>
          <Input dir="ltr" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <div className="sm:col-span-2 flex items-center gap-3">
          <Button
            size="sm"
            disabled={busy}
            onClick={async () => {
              const ok = await post({ patientId: patientId.trim(), phone });
              if (ok) {
                setPatientId("");
                setPhone("");
              }
            }}
          >
            {busy ? "Linking…" : "Link patient"}
          </Button>
          {msg && (
            <p className={`text-xs ${msg.ok ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}`}>
              {msg.text}
            </p>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

/**
 * Self-service phone change: Supabase sends an OTP to the NEW number and
 * the change only applies after verifyOtp(type: 'phone_change') — the
 * user can never edit profiles.phone directly (RLS + this flow).
 */
function ChangeMyPhoneCard() {
  const [newPhone, setNewPhone] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"idle" | "verify" | "done">("idle");
  const [e164, setE164] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setError(null);
    const normalized = normalizeIranianPhoneNumber(newPhone);
    if (!normalized.ok) {
      setError("Invalid mobile number.");
      return;
    }
    const supabase = getSupabase();
    if (!supabase) return;
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({
      phone: normalized.e164.replace("+", ""),
    });
    setBusy(false);
    if (err) {
      setError("Could not start the change. Try again.");
      return;
    }
    setE164(normalized.e164);
    setStage("verify");
  }

  async function confirm() {
    const supabase = getSupabase();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.verifyOtp({
      phone: e164.replace("+", ""),
      token: toEnglishDigits(code).replace(/\D/g, ""),
      type: "phone_change",
    });
    setBusy(false);
    if (err) {
      setError("The code is incorrect or expired.");
      return;
    }
    setStage("done");
  }

  return (
    <Card>
      <CardHeader
        title="Change My Phone Number"
        subtitle="An OTP is sent to the new number; the change applies only after verification"
        icon={<Icon name="settings" width={18} height={18} />}
      />
      <CardBody className="space-y-3">
        {stage === "done" ? (
          <p className="text-sm text-[var(--color-success)]">
            Phone updated ✓ — use the new number next time you sign in.
          </p>
        ) : stage === "verify" ? (
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Code sent to the new number" error={error ?? undefined}>
              <Input
                dir="ltr"
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-40 text-center tracking-widest"
              />
            </Field>
            <Button size="sm" disabled={busy || code.length < 6} onClick={confirm}>
              {busy ? "Verifying…" : "Confirm change"}
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <Field label="New mobile number" error={error ?? undefined}>
              <Input
                dir="ltr"
                inputMode="tel"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                className="w-52"
                placeholder="0912…"
              />
            </Field>
            <Button size="sm" variant="secondary" disabled={busy} onClick={start}>
              {busy ? "Sending…" : "Send code to new number"}
            </Button>
          </div>
        )}
        <p className="text-[11px] text-[var(--color-ink-faint)]">
          Lost SIM? An owner/admin can recover the account from the server
          recovery flow (reason + audit log; old sessions are revoked).
        </p>
      </CardBody>
    </Card>
  );
}
