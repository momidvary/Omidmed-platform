"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/store/LocaleContext";
import { useAuth } from "@/lib/store/AuthContext";
import { isMockMode } from "@/lib/config";
import {
  createPatient,
  findDuplicatePhone,
} from "@/lib/supabase/clinical";
import { normalizeIranianPhoneNumber } from "@/lib/phone";
import { PageState, displayName } from "@/components/patients/shared";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Form";
import { Icon } from "@/components/ui/Icon";
import { PageIntro } from "@/components/ui/Misc";

const empty = {
  first_name: "", last_name: "", phone: "", date_of_birth: "", gender: "",
  national_id: "", preferred_language: "fa", address: "",
  emergency_contact_name: "", emergency_contact_phone: "",
  medical_history: "", surgical_history: "", medications: "", allergies: "",
  general_notes: "",
};

export default function NewPatientPage() {
  const { t } = useLocale();
  const { profile } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dupes, setDupes] = useState<{ id: string; name: string }[] | null>(null);
  const [busy, setBusy] = useState(false);

  // Only staff roles may create patients; clinic comes from MEMBERSHIP,
  // never from the browser form (RLS re-checks it server-side).
  const clinicId = profile?.clinicIds[0];
  if (isMockMode || !profile) {
    return <PageState state={isMockMode ? "error" : "loading"} t={t} />;
  }
  if (profile.role === "patient" || !clinicId) {
    return <PageState state="denied" t={t} />;
  }

  const set = (k: keyof typeof empty, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: "" }));
    if (k === "phone") setDupes(null);
  };

  async function submit(e: React.FormEvent, allowDuplicate = false) {
    e.preventDefault();
    setSaveError(null);
    const errs: Record<string, string> = {};
    if (!form.first_name.trim()) errs.first_name = t("pm.required");
    if (!form.last_name.trim()) errs.last_name = t("pm.required");

    let phoneE164: string | null = null;
    if (form.phone.trim()) {
      const n = normalizeIranianPhoneNumber(form.phone);
      if (!n.ok) errs.phone = t("pm.invalidPhone");
      else phoneE164 = n.e164;
    }
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setBusy(true);
    // Duplicate phone inside this clinic: explicit review, never merged.
    if (phoneE164 && !allowDuplicate) {
      const existing = await findDuplicatePhone(clinicId!, phoneE164);
      if (existing && existing.length > 0) {
        setDupes(existing.map((p) => ({ id: p.id, name: displayName(p) })));
        setBusy(false);
        return;
      }
    }

    const created = await createPatient({
      clinic_id: clinicId!,
      created_by: profile!.id,
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      phone_e164: phoneE164,
      date_of_birth: form.date_of_birth || null,
      gender: form.gender || null,
      national_id: form.national_id.trim() || null,
      preferred_language: form.preferred_language,
      address: form.address.trim() || null,
      emergency_contact_name: form.emergency_contact_name.trim() || null,
      emergency_contact_phone: form.emergency_contact_phone.trim() || null,
      medical_history: form.medical_history.trim() || null,
      surgical_history: form.surgical_history.trim() || null,
      medications: form.medications.trim() || null,
      allergies: form.allergies.trim() || null,
      general_notes: form.general_notes.trim() || null,
    });
    setBusy(false);
    if (!created) {
      // The form is kept exactly as typed.
      setSaveError(t("pm.saveFailedKeep"));
      return;
    }
    router.push(`/patients/${created.id}`);
  }

  return (
    <div className="space-y-5">
      <PageIntro title={t("pm.newPatient")} description="" />
      <form onSubmit={(e) => submit(e)} className="space-y-5">
        <Card>
          <CardHeader title={t("pm.tab.overview")} icon={<Icon name="user" width={18} height={18} />} />
          <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label={t("pm.firstName")} required error={errors.first_name || undefined}>
              <Input value={form.first_name} onChange={(e) => set("first_name", e.target.value)} />
            </Field>
            <Field label={t("pm.lastName")} required error={errors.last_name || undefined}>
              <Input value={form.last_name} onChange={(e) => set("last_name", e.target.value)} />
            </Field>
            <Field label={t("pm.phone")} error={errors.phone || undefined}>
              <Input dir="ltr" inputMode="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="0912…" />
            </Field>
            <Field label={t("pm.dob")}>
              <Input type="date" dir="ltr" value={form.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} />
            </Field>
            <Field label={t("pm.gender")}>
              <Select value={form.gender} onChange={(e) => set("gender", e.target.value)}>
                <option value="">—</option>
                <option value="male">{t("pm.male")}</option>
                <option value="female">{t("pm.female")}</option>
                <option value="other">{t("pm.other")}</option>
              </Select>
            </Field>
            <Field label={t("pm.nationalId")}>
              <Input dir="ltr" value={form.national_id} onChange={(e) => set("national_id", e.target.value)} />
            </Field>
            <Field label={t("pm.language")}>
              <Select value={form.preferred_language} onChange={(e) => set("preferred_language", e.target.value)}>
                <option value="fa">فارسی</option>
                <option value="en">English</option>
                <option value="ar">العربية</option>
              </Select>
            </Field>
            <Field label={t("pm.emergencyName")}>
              <Input value={form.emergency_contact_name} onChange={(e) => set("emergency_contact_name", e.target.value)} />
            </Field>
            <Field label={t("pm.emergencyPhone")}>
              <Input dir="ltr" inputMode="tel" value={form.emergency_contact_phone} onChange={(e) => set("emergency_contact_phone", e.target.value)} />
            </Field>
            <div className="lg:col-span-3">
              <Field label={t("pm.address")}>
                <Input value={form.address} onChange={(e) => set("address", e.target.value)} />
              </Field>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("pm.medicalHistory")} icon={<Icon name="clock" width={18} height={18} />} />
          <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t("pm.medicalHistory")}>
              <Textarea className="min-h-20" value={form.medical_history} onChange={(e) => set("medical_history", e.target.value)} />
            </Field>
            <Field label={t("pm.surgicalHistory")}>
              <Textarea className="min-h-20" value={form.surgical_history} onChange={(e) => set("surgical_history", e.target.value)} />
            </Field>
            <Field label={t("pm.medications")}>
              <Textarea className="min-h-20" value={form.medications} onChange={(e) => set("medications", e.target.value)} />
            </Field>
            <Field label={t("pm.allergies")}>
              <Textarea className="min-h-20" value={form.allergies} onChange={(e) => set("allergies", e.target.value)} />
            </Field>
            <div className="sm:col-span-2">
              <Field label={t("pm.adminNotes")}>
                <Textarea className="min-h-20" value={form.general_notes} onChange={(e) => set("general_notes", e.target.value)} />
              </Field>
            </div>
          </CardBody>
        </Card>

        {dupes && (
          <Card className="border-[var(--color-warn)]/40 bg-[var(--color-warn-soft)]/40">
            <CardBody className="space-y-2">
              <p className="text-sm font-semibold text-[var(--color-warn)]">
                {t("pm.duplicateWarn")}
              </p>
              <ul className="list-disc ps-5 text-sm text-[var(--color-ink-soft)]">
                {dupes.map((d) => <li key={d.id}>{d.name}</li>)}
              </ul>
              <Button size="sm" variant="secondary" disabled={busy} onClick={(e) => submit(e as unknown as React.FormEvent, true)}>
                {t("pm.createAnyway")}
              </Button>
            </CardBody>
          </Card>
        )}

        {saveError && (
          <p className="rounded-xl bg-[var(--color-danger-soft)] px-4 py-3 text-sm text-[var(--color-danger)]">
            {saveError}
          </p>
        )}

        <div className="flex justify-end">
          <Button type="submit" disabled={busy}>
            {busy ? t("status.saving") : t("pm.create")}
          </Button>
        </div>
      </form>
    </div>
  );
}
