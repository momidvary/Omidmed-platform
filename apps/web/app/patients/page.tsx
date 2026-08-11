"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/store/AuthContext";
import { canCreatePatient } from "@/lib/auth/permissions";
import { createPatient, fetchClinicPatients } from "@/lib/supabase/db";
import { isMockMode } from "@/lib/config";
import type { Gender, PatientListItem } from "@/lib/types";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Form";
import { Icon } from "@/components/ui/Icon";
import { EmptyState, PageIntro, Spinner } from "@/components/ui/Misc";
import { cn, formatDate } from "@/lib/utils";

type Filter = "all" | "mine" | "unlinked";

export default function PatientsPage() {
  const { profile, activeClinicId } = useAuth();
  const [rows, setRows] = useState<PatientListItem[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [adding, setAdding] = useState(false);

  // Nothing is set before the first await: a synchronous setState inside
  // an effect triggers a cascading re-render.
  const load = useCallback(async () => {
    if (!activeClinicId || !profile) return;
    const data = await fetchClinicPatients(activeClinicId, profile.id);
    setRows(data ?? []);
    setLoadFailed(!data);
  }, [activeClinicId, profile]);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (active) await load();
    })();
    return () => {
      active = false;
    };
  }, [load]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows ?? []).filter((p) => {
      if (filter === "mine" && !p.isMine) return false;
      if (filter === "unlinked" && p.hasLinkedAccount) return false;
      if (!q) return true;
      return (
        p.fullName.toLowerCase().includes(q) ||
        (p.phone ?? "").includes(q)
      );
    });
  }, [rows, query, filter]);

  if (isMockMode) {
    return (
      <div className="space-y-6">
        <PageIntro
          title="Patients"
          description="Register patients, assign a therapist, and build their exercise programme."
        />
        <EmptyState
          icon="user"
          title="Not available in demo mode"
          description="The patient register writes to the database. Connect Supabase to use it — demo mode has no clinic to file patients under."
        />
      </div>
    );
  }

  const canAdd = canCreatePatient(profile, activeClinicId);

  return (
    <div className="space-y-6">
      <PageIntro
        title="Patients"
        description="Register patients, assign a therapist, and build their exercise programme."
        action={
          canAdd ? (
            <Button onClick={() => setAdding((v) => !v)}>
              <Icon name={adding ? "close" : "plus"} width={16} height={16} />
              {adding ? "Cancel" : "New patient"}
            </Button>
          ) : undefined
        }
      />

      {!activeClinicId && (
        <EmptyState
          icon="alert"
          title="No clinic yet"
          description="Your account is not a member of any clinic, so there is nowhere to file a patient. Ask a clinic owner to add you, or see docs/RAHNAMA-FA.md to create the first clinic."
        />
      )}

      {adding && activeClinicId && (
        <NewPatientForm
          clinicId={activeClinicId}
          createdBy={profile!.id}
          onDone={() => {
            setAdding(false);
            void load();
          }}
        />
      )}

      {activeClinicId && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-56 flex-1">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or phone…"
                aria-label="Search patients"
              />
            </div>
            <div className="flex gap-1 rounded-xl bg-[var(--color-surface-muted)] p-1">
              {(
                [
                  ["all", "All"],
                  ["mine", "My patients"],
                  ["unlinked", "No account"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFilter(id)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                    filter === id
                      ? "bg-white text-[var(--color-ink)] shadow-sm"
                      : "text-[var(--color-ink-faint)] hover:text-[var(--color-ink-soft)]"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {rows === null ? (
            <Spinner label="Loading patients…" />
          ) : loadFailed ? (
            <EmptyState
              icon="alert"
              title="Could not load patients"
              description="The server did not respond. Nothing is lost — try again."
              action={
                <Button
                  onClick={() => {
                    setRows(null);
                    void load();
                  }}
                >
                  Retry
                </Button>
              }
            />
          ) : shown.length === 0 ? (
            <EmptyState
              icon="user"
              title={rows.length === 0 ? "No patients yet" : "No matches"}
              description={
                rows.length === 0
                  ? "Register your first patient to start building a treatment programme."
                  : "No patient matches this search and filter."
              }
            />
          ) : (
            <Card>
              <CardBody className="p-0">
                <ul className="divide-y divide-[var(--color-border)]">
                  {shown.map((p) => (
                    <li key={p.id}>
                      <Link
                        href={`/patients/${p.id}`}
                        className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-[var(--color-surface-muted)]"
                      >
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--color-primary-tint)] text-sm font-semibold text-[var(--color-primary-strong)]">
                          {p.fullName.charAt(0).toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-[var(--color-ink)]">
                            {p.fullName}
                            {p.birthYear && (
                              <span className="font-normal text-[var(--color-ink-faint)]">
                                {" "}
                                · {new Date().getFullYear() - p.birthYear}y
                              </span>
                            )}
                          </span>
                          <span className="block truncate text-xs text-[var(--color-ink-faint)]">
                            {p.activeEpisodeTitle ?? "No care episode yet"}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          {p.openTickets > 0 && (
                            <Badge tone="warn">
                              {p.openTickets} open
                            </Badge>
                          )}
                          {p.isMine && <Badge tone="primary">Mine</Badge>}
                          {!p.hasLinkedAccount && (
                            <Badge tone="neutral">No account</Badge>
                          )}
                          <span className="hidden text-[11px] text-[var(--color-ink-faint)] sm:block">
                            {formatDate(p.createdAt)}
                          </span>
                          <Icon
                            name="arrow"
                            width={14}
                            height={14}
                            className="text-[var(--color-ink-faint)]"
                          />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function NewPatientForm({
  clinicId,
  createdBy,
  onDone,
}: {
  clinicId: string;
  createdBy: string;
  onDone: () => void;
}) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [gender, setGender] = useState<Gender | "">("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) {
      setError("Patient name is required.");
      return;
    }
    const year = birthYear ? Number(birthYear) : null;
    if (year !== null && (year < 1900 || year > new Date().getFullYear())) {
      setError("Enter a valid birth year.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await createPatient(clinicId, createdBy, {
      fullName: fullName.trim(),
      nationalId: nationalId.trim() || null,
      phone: phone.trim() || null,
      birthYear: year,
      gender: gender || null,
    });
    setBusy(false);
    // On failure every field stays exactly as typed.
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onDone();
  }

  return (
    <Card>
      <CardHeader
        title="Register a patient"
        subtitle="The clinical record and exercise programme are added afterwards"
        icon={<Icon name="user" width={18} height={18} />}
      />
      <form onSubmit={submit}>
        <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Full name" required>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="مثلاً رضا کریمی"
            />
          </Field>
          <Field label="Phone">
            <Input
              dir="ltr"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0912…"
            />
          </Field>
          <Field
            label="National ID"
            hint="On file only — never used to sign in"
          >
            <Input
              dir="ltr"
              value={nationalId}
              onChange={(e) => setNationalId(e.target.value)}
            />
          </Field>
          <Field label="Birth year">
            <Input
              type="number"
              dir="ltr"
              value={birthYear}
              onChange={(e) => setBirthYear(e.target.value)}
              placeholder="1975"
            />
          </Field>
          <Field label="Gender">
            <Select
              value={gender}
              onChange={(e) => setGender(e.target.value as Gender)}
            >
              <option value="">Select…</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="other">Other</option>
            </Select>
          </Field>
        </CardBody>
        {error && (
          <p className="mx-5 mb-3 rounded-xl bg-[var(--color-danger-soft)] px-4 py-2.5 text-sm text-[var(--color-danger)]">
            {error}
          </p>
        )}
        <div className="border-t border-[var(--color-border)] px-5 py-4">
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Register patient"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
