"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/store/AuthContext";
import {
  canAssignOtherTherapist,
  canEditDemographics,
  canLinkAccount,
  canManageClinicalRecord,
  canSelfAssign,
  clinicalBlockReason,
} from "@/lib/auth/permissions";
import {
  assignTherapist,
  createEpisode,
  fetchClinicMembers,
  fetchPatientRecord,
  linkPatientAccount,
  removePrescription,
  unassignTherapist,
  unlinkPatientAccount,
  updateEpisode,
  updatePatient,
  upsertPrescription,
  type WriteResult,
} from "@/lib/supabase/db";
import { isMockMode } from "@/lib/config";
import { exercises } from "@/lib/data/exercises";
import { exerciseFa } from "@/lib/data/exerciseFa";
import type {
  CareEpisode,
  ClinicMember,
  Gender,
  PatientRecord,
} from "@/lib/types";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Form";
import { Icon } from "@/components/ui/Icon";
import { Disclaimer, EmptyState, PageIntro, Spinner } from "@/components/ui/Misc";
import { formatDate } from "@/lib/utils";

export default function PatientDetailPage() {
  const params = useParams<{ id: string }>();
  const patientId = params.id;
  const { profile } = useAuth();

  const [patient, setPatient] = useState<PatientRecord | null | "missing">(null);
  const [members, setMembers] = useState<ClinicMember[]>([]);

  const load = useCallback(async () => {
    const rec = await fetchPatientRecord(patientId);
    setPatient(rec ?? "missing");
    if (rec) setMembers((await fetchClinicMembers(rec.clinicId)) ?? []);
  }, [patientId]);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (active) await load();
    })();
    return () => {
      active = false;
    };
  }, [load]);

  if (isMockMode) {
    return (
      <EmptyState
        icon="user"
        title="Not available in demo mode"
        description="Patient records live in the database. Connect Supabase to use the clinical workspace."
      />
    );
  }
  if (patient === null) return <Spinner label="Loading patient…" />;
  if (patient === "missing") {
    return (
      <EmptyState
        icon="alert"
        title="Patient not found"
        description="This record does not exist, or it belongs to a clinic you are not a member of."
        action={
          <Link
            href="/patients"
            className="rounded-xl bg-[var(--color-primary)] px-4 py-2.5 text-sm font-medium text-white"
          >
            Back to patients
          </Link>
        }
      />
    );
  }

  const clinical = canManageClinicalRecord(profile, patient);
  const blockReason = clinicalBlockReason(profile, patient);

  return (
    <div className="space-y-6">
      <PageIntro
        title={patient.fullName}
        description={`Registered ${formatDate(patient.createdAt)}${
          patient.birthYear
            ? ` · ${new Date().getFullYear() - patient.birthYear} years old`
            : ""
        }`}
        action={
          <Link
            href="/patients"
            className="text-sm text-[var(--color-primary-strong)] hover:underline"
          >
            ← All patients
          </Link>
        }
      />

      {blockReason && (
        <div className="flex items-start gap-3 rounded-2xl border border-[var(--color-warn)]/40 bg-[var(--color-warn-soft)] px-5 py-4">
          <span className="mt-0.5 shrink-0 text-[var(--color-warn)]">
            <Icon name="alert" width={18} height={18} />
          </span>
          <p className="text-sm text-[var(--color-ink-soft)]">{blockReason}</p>
        </div>
      )}

      <CareTeamCard patient={patient} members={members} onChange={load} />
      <LinkedAccountsCard patient={patient} onChange={load} />
      <DemographicsCard patient={patient} onChange={load} />
      <EpisodesSection
        patient={patient}
        canManage={clinical}
        onChange={load}
      />

      <Disclaimer />
    </div>
  );
}

/** Small helper: run a write, surface its message, refresh on success. */
function useAction(onChange: () => Promise<void>) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<WriteResult>) => {
    setBusy(true);
    setError(null);
    const result = await fn();
    if (!result.ok) {
      setError(result.message);
      setBusy(false);
      return false;
    }
    await onChange();
    setBusy(false);
    return true;
  };

  return { run, error, busy, setError };
}

function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="rounded-xl bg-[var(--color-danger-soft)] px-3.5 py-2.5 text-[13px] leading-relaxed text-[var(--color-danger)]">
      {message}
    </p>
  );
}

/* ── Care team ─────────────────────────────────────────────────── */

function CareTeamCard({
  patient,
  members,
  onChange,
}: {
  patient: PatientRecord;
  members: ClinicMember[];
  onChange: () => Promise<void>;
}) {
  const { profile } = useAuth();
  const { run, error, busy } = useAction(onChange);
  const [pick, setPick] = useState("");

  const assigned = members.filter((m) => patient.therapistIds.includes(m.userId));
  const assignable = members.filter(
    (m) => m.memberRole !== "clinic_staff" && !patient.therapistIds.includes(m.userId)
  );
  const mayAssignOthers = canAssignOtherTherapist(profile, patient);
  const maySelfAssign = canSelfAssign(profile, patient);

  return (
    <Card>
      <CardHeader
        title="Care team"
        subtitle="Only an assigned therapist (or the clinic owner) can edit the clinical record"
        icon={<Icon name="shield" width={18} height={18} />}
      />
      <CardBody className="space-y-3">
        {assigned.length === 0 ? (
          <p className="text-sm text-[var(--color-ink-faint)]">
            No therapist assigned yet.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {assigned.map((m) => (
              <li
                key={m.userId}
                className="flex items-center gap-2 rounded-full bg-[var(--color-primary-tint)] py-1 pe-1 ps-3 text-[13px] text-[var(--color-primary-strong)]"
              >
                {m.fullName}
                {m.userId === profile?.id && (
                  <span className="text-[var(--color-ink-faint)]">(you)</span>
                )}
                {mayAssignOthers && (
                  <button
                    type="button"
                    aria-label={`Unassign ${m.fullName}`}
                    disabled={busy}
                    onClick={() =>
                      void run(() => unassignTherapist(patient.id, m.userId))
                    }
                    className="grid h-5 w-5 place-items-center rounded-full text-[var(--color-ink-faint)] hover:bg-white hover:text-[var(--color-danger)]"
                  >
                    <Icon name="close" width={12} height={12} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {maySelfAssign && (
            <Button
              size="sm"
              disabled={busy}
              onClick={() =>
                void run(() => assignTherapist(patient.id, profile!.id))
              }
            >
              <Icon name="plus" width={14} height={14} />
              Assign myself
            </Button>
          )}
          {mayAssignOthers && assignable.length > 0 && (
            <>
              <Select
                value={pick}
                onChange={(e) => setPick(e.target.value)}
                className="w-56"
                aria-label="Assign a therapist"
              >
                <option value="">Assign a colleague…</option>
                {assignable.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.fullName} — {m.memberRole.replace("clinic_", "")}
                  </option>
                ))}
              </Select>
              <Button
                variant="secondary"
                size="sm"
                disabled={!pick || busy}
                onClick={async () => {
                  if (await run(() => assignTherapist(patient.id, pick))) {
                    setPick("");
                  }
                }}
              >
                Assign
              </Button>
            </>
          )}
        </div>
        <ErrorNote message={error} />
      </CardBody>
    </Card>
  );
}

/* ── Linked accounts ───────────────────────────────────────────── */

function LinkedAccountsCard({
  patient,
  onChange,
}: {
  patient: PatientRecord;
  onChange: () => Promise<void>;
}) {
  const { profile } = useAuth();
  const { run, error, busy, setError } = useAction(onChange);
  const [email, setEmail] = useState("");
  const mayLink = canLinkAccount(profile, patient);

  return (
    <Card>
      <CardHeader
        title="Portal access"
        subtitle="The account the patient signs in with at /patient"
        icon={<Icon name="user" width={18} height={18} />}
      />
      <CardBody className="space-y-3">
        {patient.linkedUsers.length === 0 ? (
          <p className="text-sm text-[var(--color-ink-faint)]">
            No account linked — this patient cannot see their programme yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {patient.linkedUsers.map((u) => (
              <li
                key={u.userId}
                className="flex items-center justify-between gap-3 rounded-xl bg-[var(--color-surface-muted)] px-3.5 py-2.5"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-[var(--color-ink)]">
                    {u.fullName || "(no name)"}
                  </span>
                  <span
                    dir="ltr"
                    className="block truncate text-xs text-[var(--color-ink-faint)]"
                  >
                    {u.email ?? u.userId}
                  </span>
                </span>
                {mayLink && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      void run(() => unlinkPatientAccount(patient.id, u.userId))
                    }
                  >
                    Unlink
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {mayLink && (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!email.trim()) {
                setError("Enter the email the patient signed up with.");
                return;
              }
              if (await run(() => linkPatientAccount(patient.id, email.trim()))) {
                setEmail("");
              }
            }}
          >
            <div className="min-w-56 flex-1">
              <Field
                label="Link an account by email"
                hint="The patient must have signed up at /patient first"
              >
                <Input
                  type="email"
                  dir="ltr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="patient@example.com"
                />
              </Field>
            </div>
            <Button type="submit" variant="secondary" disabled={busy}>
              {busy ? "Linking…" : "Link account"}
            </Button>
          </form>
        )}
        <ErrorNote message={error} />
      </CardBody>
    </Card>
  );
}

/* ── Demographics ──────────────────────────────────────────────── */

function DemographicsCard({
  patient,
  onChange,
}: {
  patient: PatientRecord;
  onChange: () => Promise<void>;
}) {
  const { profile } = useAuth();
  const { run, error, busy } = useAction(onChange);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    fullName: patient.fullName,
    phone: patient.phone ?? "",
    nationalId: patient.nationalId ?? "",
    birthYear: patient.birthYear ? String(patient.birthYear) : "",
    gender: (patient.gender ?? "") as Gender | "",
  });

  const mayEdit = canEditDemographics(profile, patient);

  if (!editing) {
    return (
      <Card>
        <CardHeader
          title="Details"
          icon={<Icon name="clock" width={18} height={18} />}
          action={
            mayEdit ? (
              <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                Edit
              </Button>
            ) : undefined
          }
        />
        <CardBody className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Detail label="Phone" value={patient.phone} ltr />
          <Detail label="National ID" value={patient.nationalId} ltr />
          <Detail
            label="Birth year"
            value={patient.birthYear ? String(patient.birthYear) : null}
            ltr
          />
          <Detail label="Gender" value={patient.gender} />
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader title="Edit details" icon={<Icon name="settings" width={18} height={18} />} />
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const okDone = await run(() =>
            updatePatient(patient.id, {
              fullName: form.fullName.trim(),
              nationalId: form.nationalId.trim() || null,
              phone: form.phone.trim() || null,
              birthYear: form.birthYear ? Number(form.birthYear) : null,
              gender: form.gender || null,
            })
          );
          if (okDone) setEditing(false);
        }}
      >
        <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Full name" required>
            <Input
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            />
          </Field>
          <Field label="Phone">
            <Input
              dir="ltr"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </Field>
          <Field label="National ID">
            <Input
              dir="ltr"
              value={form.nationalId}
              onChange={(e) => setForm({ ...form, nationalId: e.target.value })}
            />
          </Field>
          <Field label="Birth year">
            <Input
              type="number"
              dir="ltr"
              value={form.birthYear}
              onChange={(e) => setForm({ ...form, birthYear: e.target.value })}
            />
          </Field>
          <Field label="Gender">
            <Select
              value={form.gender}
              onChange={(e) =>
                setForm({ ...form, gender: e.target.value as Gender })
              }
            >
              <option value="">Select…</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="other">Other</option>
            </Select>
          </Field>
        </CardBody>
        <div className="space-y-3 border-t border-[var(--color-border)] px-5 py-4">
          <ErrorNote message={error} />
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      </form>
    </Card>
  );
}

function Detail({
  label,
  value,
  ltr,
}: {
  label: string;
  value: string | null;
  ltr?: boolean;
}) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-[var(--color-ink-faint)]">
        {label}
      </p>
      <p
        dir={ltr ? "ltr" : undefined}
        className="mt-0.5 text-sm text-[var(--color-ink)]"
      >
        {value || "—"}
      </p>
    </div>
  );
}

/* ── Care episodes & programme ─────────────────────────────────── */

function EpisodesSection({
  patient,
  canManage,
  onChange,
}: {
  patient: PatientRecord;
  canManage: boolean;
  onChange: () => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--color-ink)]">
          Care episodes
        </h3>
        {canManage && (
          <Button size="sm" onClick={() => setAdding((v) => !v)}>
            <Icon name={adding ? "close" : "plus"} width={14} height={14} />
            {adding ? "Cancel" : "New episode"}
          </Button>
        )}
      </div>

      {adding && (
        <NewEpisodeForm
          patientId={patient.id}
          onDone={async () => {
            setAdding(false);
            await onChange();
          }}
        />
      )}

      {patient.episodes.length === 0 && !adding && (
        <EmptyState
          icon="treatment"
          title="No care episode yet"
          description={
            canManage
              ? "Open an episode to prescribe an exercise programme the patient will see in their portal."
              : "This patient has no treatment course on record."
          }
        />
      )}

      {patient.episodes.map((ep) => (
        <EpisodeCard
          key={ep.id}
          episode={ep}
          canManage={canManage}
          onChange={onChange}
        />
      ))}
    </div>
  );
}

function NewEpisodeForm({
  patientId,
  onDone,
}: {
  patientId: string;
  onDone: () => Promise<void>;
}) {
  const { run, error, busy } = useAction(onDone);
  const [titleFa, setTitleFa] = useState("");
  const [noteFa, setNoteFa] = useState("");
  const [weeklyTarget, setWeeklyTarget] = useState("5");

  return (
    <Card>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!titleFa.trim()) return;
          await run(() =>
            createEpisode(patientId, {
              titleFa: titleFa.trim(),
              therapistNoteFa: noteFa.trim(),
              weeklyTarget: Number(weeklyTarget) || 5,
            })
          );
        }}
      >
        <CardBody className="space-y-4">
          <Field
            label="Episode title (Persian)"
            required
            hint="The patient sees this at the top of their portal"
          >
            <Input
              dir="rtl"
              value={titleFa}
              onChange={(e) => setTitleFa(e.target.value)}
              placeholder="توان‌بخشی بعد از تعویض مفصل زانو"
              className="font-[family-name:var(--font-vazirmatn)]"
            />
          </Field>
          <Field label="Note to the patient (Persian)">
            <Textarea
              dir="rtl"
              value={noteFa}
              onChange={(e) => setNoteFa(e.target.value)}
              placeholder="تمرکز این هفته: افزایش خم‌شدن زانو…"
              className="font-[family-name:var(--font-vazirmatn)]"
            />
          </Field>
          <div className="max-w-40">
            <Field label="Sessions per week">
              <Input
                type="number"
                min={1}
                max={14}
                dir="ltr"
                value={weeklyTarget}
                onChange={(e) => setWeeklyTarget(e.target.value)}
              />
            </Field>
          </div>
          <ErrorNote message={error} />
          <Button type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create episode"}
          </Button>
        </CardBody>
      </form>
    </Card>
  );
}

function EpisodeCard({
  episode,
  canManage,
  onChange,
}: {
  episode: CareEpisode;
  canManage: boolean;
  onChange: () => Promise<void>;
}) {
  const { run, error, busy } = useAction(onChange);
  const [open, setOpen] = useState(episode.status === "active");

  const done = episode.progress.filter((p) => p.completed).length;
  const avgPain =
    episode.progress.length > 0
      ? (
          episode.progress.reduce((s, p) => s + p.painLevel, 0) /
          episode.progress.length
        ).toFixed(1)
      : "—";

  return (
    <Card>
      <CardHeader
        title={episode.titleFa}
        subtitle={`Started ${formatDate(episode.startedAt)} · ${
          episode.program.length
        } exercises · ${done} sessions logged · avg pain ${avgPain}`}
        icon={<Icon name="treatment" width={18} height={18} />}
        action={
          <div className="flex items-center gap-2">
            <Badge
              tone={
                episode.status === "active"
                  ? "success"
                  : episode.status === "paused"
                    ? "warn"
                    : "neutral"
              }
            >
              {episode.status}
            </Badge>
            <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)}>
              {open ? "Hide" : "Open"}
            </Button>
          </div>
        }
      />
      {open && (
        <CardBody className="space-y-4">
          {episode.therapistNoteFa && (
            <p
              dir="rtl"
              className="rounded-xl bg-[var(--color-surface-muted)] px-3.5 py-2.5 text-[13px] leading-relaxed text-[var(--color-ink-soft)] font-[family-name:var(--font-vazirmatn)]"
            >
              {episode.therapistNoteFa}
            </p>
          )}

          <ProgramEditor
            episode={episode}
            canManage={canManage}
            onChange={onChange}
          />

          {canManage && (
            <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-border)] pt-4">
              <span className="text-xs text-[var(--color-ink-faint)]">
                Episode status:
              </span>
              {(["active", "paused", "completed"] as const).map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={episode.status === s ? "primary" : "secondary"}
                  disabled={busy || episode.status === s}
                  onClick={() => void run(() => updateEpisode(episode.id, { status: s }))}
                >
                  {s}
                </Button>
              ))}
            </div>
          )}
          <ErrorNote message={error} />
        </CardBody>
      )}
    </Card>
  );
}

function ProgramEditor({
  episode,
  canManage,
  onChange,
}: {
  episode: CareEpisode;
  canManage: boolean;
  onChange: () => Promise<void>;
}) {
  const { run, error, busy } = useAction(onChange);
  const [exerciseId, setExerciseId] = useState("");
  const [dosageFa, setDosageFa] = useState("");
  const [daysPerWeek, setDaysPerWeek] = useState("5");

  const prescribed = new Set(episode.program.map((p) => p.exerciseId));
  const available = useMemo(
    () => exercises.filter((e) => !prescribed.has(e.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [episode.program]
  );

  // A prescription the patient portal has no Persian card for renders as a
  // name and dosage only, so flag it here rather than letting the therapist
  // find out from the patient.
  const selectedHasFa = exerciseId ? !!exerciseFa[exerciseId] : true;

  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-faint)]">
        Exercise programme
      </h4>

      {episode.program.length === 0 ? (
        <p className="text-sm text-[var(--color-ink-faint)]">
          Nothing prescribed yet — the patient&apos;s portal will be empty.
        </p>
      ) : (
        <ul className="space-y-2">
          {episode.program.map((item) => {
            const lib = exercises.find((e) => e.id === item.exerciseId);
            const fa = exerciseFa[item.exerciseId];
            return (
              <li
                key={item.exerciseId}
                className="flex items-start justify-between gap-3 rounded-xl border border-[var(--color-border)] px-3.5 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-[var(--color-ink)]">
                    {fa?.name ?? lib?.name ?? item.exerciseId}
                  </p>
                  <p
                    dir="rtl"
                    className="mt-0.5 text-xs text-[var(--color-ink-soft)] font-[family-name:var(--font-vazirmatn)]"
                  >
                    {item.dosageFa} · {item.daysPerWeek} روز در هفته
                  </p>
                  {!fa && (
                    <p className="mt-1 text-[11px] text-[var(--color-warn)]">
                      No Persian instructions for this exercise — the patient
                      sees the name and dosage only.
                    </p>
                  )}
                </div>
                {canManage && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      void run(() =>
                        removePrescription(episode.id, item.exerciseId)
                      )
                    }
                  >
                    Remove
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canManage && (
        <form
          className="grid grid-cols-1 gap-3 rounded-xl bg-[var(--color-surface-muted)] p-3 sm:grid-cols-[2fr_2fr_auto_auto]"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!exerciseId || !dosageFa.trim()) return;
            const okDone = await run(() =>
              upsertPrescription(episode.id, {
                exerciseId,
                dosageFa: dosageFa.trim(),
                daysPerWeek: Number(daysPerWeek) || 5,
              })
            );
            if (okDone) {
              setExerciseId("");
              setDosageFa("");
            }
          }}
        >
          <Select
            value={exerciseId}
            onChange={(e) => setExerciseId(e.target.value)}
            aria-label="Exercise"
          >
            <option value="">Add an exercise…</option>
            {available.map((e) => (
              <option key={e.id} value={e.id}>
                {exerciseFa[e.id]?.name ?? e.name}
                {!exerciseFa[e.id] ? " (no Persian card)" : ""}
              </option>
            ))}
          </Select>
          <Input
            dir="rtl"
            value={dosageFa}
            onChange={(e) => setDosageFa(e.target.value)}
            placeholder="۳ ست × ۱۰ تکرار"
            aria-label="Dosage in Persian"
            className="font-[family-name:var(--font-vazirmatn)]"
          />
          <Input
            type="number"
            min={1}
            max={7}
            dir="ltr"
            value={daysPerWeek}
            onChange={(e) => setDaysPerWeek(e.target.value)}
            aria-label="Days per week"
            className="w-20"
          />
          <Button type="submit" size="sm" disabled={!exerciseId || busy}>
            Add
          </Button>
          {!selectedHasFa && (
            <p className="text-[11px] text-[var(--color-warn)] sm:col-span-4">
              This exercise has no Persian instructions yet. It will still be
              prescribed, but the patient will only see its name and dosage —
              add content in{" "}
              <code className="rounded bg-white px-1 py-0.5">
                lib/data/exerciseFa.ts
              </code>
              .
            </p>
          )}
        </form>
      )}
      <ErrorNote message={error} />
    </div>
  );
}
