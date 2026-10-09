# PhysioAI web application

PhysioAI is a multilingual physiotherapy decision-support workspace built with
Next.js, Supabase and an optional audited OpenAI clinical-draft service. It
includes clinician and patient authentication, clinic-scoped records, a patient
registry, safety screening, treatment-support tools, a patient portal and a
clinician ticket inbox.

This repository is not a validated medical device and does not provide a
diagnosis, emergency service or autonomous treatment decision. A licensed
clinician must verify the source record, perform the appropriate examination
and make every clinical decision.

## Runtime modes

### Supabase mode

Provide `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and do not set
`NEXT_PUBLIC_DATA_MODE=mock`. Supabase authentication and Row Level Security
are the source of truth; client state does not fall back to `localStorage` when
a production read or write fails.

Production is fail-closed. If the public Supabase configuration is missing, the
clinician workspace shows a configuration error instead of silently loading
sample patients or bypassing authentication.

### Mock mode

Set `NEXT_PUBLIC_DATA_MODE=mock` only for an intentional demo. Mock mode uses
sample/local data, bypasses real authentication and may persist demo state in
the browser. Development also falls back to mock mode when Supabase is not
configured; production does not, unless `mock` was explicitly set.

Never deploy an environment containing real patient data with mock mode
enabled.

## Feature status and safety gates

| Area | Current behavior | Deployment gate |
| --- | --- | --- |
| Clinic and patient workflows | Real Supabase-backed auth, active-clinic tenancy, patient registry, consent-attested portal invitations, therapist assignment, care-episode lifecycle, linked cases, multi-patient family portal, progress, attributed tickets/alerts, append-only assessment/session-note history and versioned outcome measures. | Apply migrations `001` through `020` on a fresh database (or only tracked unapplied migrations on an existing database), provision memberships and verify RLS before use. |
| Deterministic clinical tools | Local decision-support templates with explicit safety clearance requirements for treatment and education flows. They are not AI diagnoses or clinical clearance. | Keep clinician review and escalation procedures in the operational workflow. |
| Structured findings and hypothesis ranking | Case Analysis records region-specific history answers (yes/no), irritability, examination tests (positive/negative/equivocal) and notes as append-only, clinician-attributed versions. A transparent rule-based engine (`lib/clinical/reasoning`) ranks provisional hypotheses for neck, shoulder, low back, hip, knee and ankle/foot, shows every weighted reason, published test accuracy with its source, screening rules (Ottawa, myelopathy cluster…), serious hypotheses needing medical review and the most informative next tests. It is relative support, not a probability or diagnosis, and is locked until the safety screen is clear. | Requires migration `029`. Weights and accuracy figures in `knowledge.ts` need clinical review before use; bump `KNOWLEDGE_VERSION` on any change. |
| Treatment and exercise workflow | Append-only treatment-plan versions require clinician sign-off. Prescriptions have draft/published/suspended/revoked states; high pain or a non-clear re-screen hides the program, and resume requires a newer clear screen plus clinician action. | Requires migrations `006` through `008` and `013` through `014`, with a linked patient, active episode and safety-cleared case. |
| Posture page | No vision service is connected. By default the page is disabled. The optional sandbox keeps photos as local previews and displays fixed sample cards without inspecting pixels. | Keep `NEXT_PUBLIC_ENABLE_POSTURE_SANDBOX=false` in clinical/production environments. Set it to `true` only for internal UI testing. |
| AI assistant with clinical drafts disabled | A template/keyword sandbox. Its content is fixed demo decision-support, not a model response. | Keep both clinical-AI flags false. |
| Audited clinical AI drafts | Optional real server-side OpenAI structured drafts. The latest saved structured findings (labelled, notes redacted) and the rule-based ranking are added to the audited context for the model to critique (prompt `clinical-draft-v3`). Requests require an authenticated clinic owner/therapist, a persisted safety-cleared case, no detected safety signal, data minimization, atomic idempotency/quota reservation, an audit write and explicit accept/edit/reject review. A failed or blocked request never substitutes a fallback clinical answer. | Requires migrations `005`, `009` and `010`, both clinical-AI flags, explicit data-processing approval, server secrets and an approved model. |
| Ticket “AI” acknowledgement | A deterministic server-side triage acknowledgement, not an OpenAI model call. Client code cannot forge an `ai` sender. | Requires Supabase server secret; missing configuration returns an error without inventing a reply. |
| External clinical-alert delivery | Urgent/emergency alerts enter a metadata-minimized durable outbox. A service-only worker leases bounded batches, sends HMAC-signed HTTPS webhooks and records retry/dead-letter attempts without logging patient text. | Requires migration `019`, three server-only delivery variables, an approved webhook processor and a tested on-call runbook. This is transport plumbing, not proof that a real person received an alert. |

## Environment configuration

Copy `.env.local.example` to `.env.local` for local work. The example contains
all supported variables with no real credentials.

Public variables are embedded in the browser bundle:

- `NEXT_PUBLIC_DATA_MODE`: set to `mock` only for an explicit demo.
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: browser-safe publishable key.
- `NEXT_PUBLIC_ENABLE_POSTURE_SANDBOX`: fixed-output internal sandbox; default
  `false`.
- `NEXT_PUBLIC_ENABLE_CLINICAL_AI_DRAFTS`: exposes the audited clinical-draft
  UI; default `false`.

Server-only variables must be stored in the deployment platform's encrypted
secret store and must never use a `NEXT_PUBLIC_` prefix:

- `SUPABASE_SECRET_KEY`: privileged key used only by guarded server routes,
  including patient-account invitations. Configure the Supabase Site URL and
  allow `/auth/update-password` as an Auth redirect before inviting users.
- `CRON_SECRET`: random secret of at least 32 bytes used to authenticate the
  internal notification drain endpoint.
- `CLINICAL_ALERT_WEBHOOK_URL`: approved public HTTPS endpoint that receives
  only the fixed alert metadata schema. Literal IP, local/internal host,
  credential-bearing URL and non-standard port configurations fail closed.
- `CLINICAL_ALERT_WEBHOOK_SECRET`: random secret of at least 32 bytes used for
  `HMAC-SHA256` signatures over `timestamp.rawBody`.
- `ENABLE_CLINICAL_AI_DRAFTS`: server-side clinical-AI gate.
- `OPENAI_CLINICAL_DATA_PROCESSING_APPROVED`: explicit operational/legal
  approval gate; do not enable it merely to make a deployment pass.
- `OPENAI_API_KEY`: server-only OpenAI credential.
- `OPENAI_MODEL`: explicitly approved model identifier for structured output.
- `CLINICAL_AI_PER_MINUTE_LIMIT`: per-clinician request ceiling; blank uses `5`.
- `CLINICAL_AI_DAILY_USER_LIMIT`: per-clinician UTC-day ceiling; blank uses `40`.
- `CLINICAL_AI_DAILY_CLINIC_LIMIT`: per-clinic UTC-day ceiling; blank uses `500`.
  Values outside the documented bounds fail closed.

Enabling only the public clinical-AI flag does not enable generation. The
server returns `503` unless every server-side gate and dependency is present.
Because `NEXT_PUBLIC_*` values are compiled into the client bundle, rebuild and
redeploy after changing them.

## Database setup

Use a new or backed-up Supabase project. Migration `001_schema.sql` removes the
legacy demo tables, so do not run it casually against an unbacked production
database. The canonical runner uses an advisory lock, records checksums and an
`applying/applied` ledger, and refuses an existing untracked schema:

```bash
# Only once, against a verified empty Supabase database:
DATABASE_URL='postgresql://…' node database/scripts/migrate.mjs --allow-baseline

# Every subsequent release:
DATABASE_URL='postgresql://…' node database/scripts/migrate.mjs
```

Do not pass `--allow-baseline` to a provisioned system. If a migration remains
marked `applying`, stop and inspect the target rather than editing the ledger or
blindly rerunning SQL. The ordered migration set is:

1. `database/migrations/001_schema.sql` — core roles, clinics, patients and
   clinical schema.
2. `database/migrations/002_rls.sql` — authenticated Row Level Security.
3. `database/migrations/003_security_fixes.sql` — granular access, actor
   anti-spoofing and patient/clinician data separation.
4. `database/migrations/004_security_hardening.sql` — tenant integrity,
   restricted workflow RPCs, audit hardening and production policies.
5. `database/migrations/005_ai_governance.sql` — append-only AI generation and
   clinician-review audit tables.
6. `database/migrations/006_case_episode_linkage.sql` — immutable linkage from
   a clinician case to the correct patient and care episode.
7. `database/migrations/007_treatment_plan_workflow.sql` — versioned treatment
   drafts and atomic clinician approve/reject workflow.
8. `database/migrations/008_exercise_prescriptions.sql` — versioned exercise
   prescription draft/publish/revoke workflow and patient-scoped reads.
9. `database/migrations/009_ai_request_reservations.sql` — atomic clinical-AI
   idempotency reservations and bounded user/clinic quotas.
10. `database/migrations/010_ai_review_hardening.sql` — atomic, service-only
    clinician review records for completed AI drafts.
11. `database/migrations/011_treatment_plan_validation.sql` — database-enforced
    bounded input/output shape for every new treatment-plan version.
12. `database/migrations/012_access_and_ai_race_hardening.sql` — consistent
    role/membership enforcement and AI completion/review race protection.
13. `database/migrations/013_clinical_safety_and_portal_controls.sql` —
    append-only safety screening, legacy-program retirement, current-date
    prescription visibility and active-episode patient controls.
14. `database/migrations/014_clinical_alerts.sql` — idempotent high-pain
    alerts, prescription suspension and clinician acknowledge/resolve/resume.
15. `database/migrations/015_patient_onboarding_and_episode_lifecycle.sql` —
    consent-attested and expiring patient-account links, invitation throttling,
    therapist reassignment, episode transitions and retained record archive.
16. `database/migrations/016_exercise_catalog_and_date_validation.sql` —
    reviewed/versioned patient exercise snapshots, catalog-enforced prescription
    IDs and real calendar validation for post-operative dates.
17. `database/migrations/017_ticket_workflow_and_escalation.sql` —
    server-triaged patient ticket creation/replies, attributed acknowledgement
    and closure, urgent alert creation and direct-DML retirement.
18. `database/migrations/018_clinical_documentation_and_outcomes.sql` —
    append-only signed session notes, correction lineage, reviewed/versioned
    outcome instruments and immutable score snapshots.
19. `database/migrations/019_notification_outbox.sql` — durable metadata-only
    alert delivery leases, bounded retries, append-only attempts and
    service-only completion/dead-letter transitions.
20. `database/migrations/020_case_assessment_versioning.sql` — immutable,
    clinician-attributed intake snapshots with stale-write-safe correction and
    reassessment versions plus a read-only current-case projection.
21. `database/migrations/021_structured_exercise_adherence.sql` — append-only,
    per-exercise patient completion events recorded through a service RPC.
22. `database/migrations/022_adherence_retry_hardening.sql` — idempotent
    adherence retries and weekday validation.
23. `database/migrations/023_prescription_schedule.sql` — patient-local
    prescription schedules (timezone + weekdays).
24. `database/migrations/024_structured_progress_guard.sql` — blocks generic
    daily logs where structured per-exercise reporting applies.
25. `database/migrations/025_exercise_measurement_targets.sql` — prescribed
    numeric targets (sets/reps or duration) validated on each report.
26. `database/migrations/026_auth_email_type_fix.sql` — fixes the owner's
    patient-account listing on hosted Supabase (`auth.users.email` is
    `varchar(255)`); without it the Patient Registry fails to load.
27. `database/migrations/027_patient_prescription_visibility.sql` — lets the
    linked patient actually read their current, clear, published prescription
    (the earlier policy checked `cases` under the patient's RLS, so patients
    never saw a programme).
28. `database/migrations/028_patient_phone_accounts.sql` — clinic owners link
    portal accounts by mobile number (`link_patient_account_by_phone`);
    `list_patient_account_phones` returns the sign-in phones (owners only).
    The existing listing's return type is left unchanged so replaying 015/026
    stays idempotent.
29. `database/migrations/029_case_clinical_findings.sql` — append-only
    structured history/examination findings per case
    (`record_case_clinical_findings`, stale-write safe, attributed to
    `auth.uid()`), readable only by clinicians who manage the patient's
    clinical record.

### Patient portal sign-in (mobile number + SMS code)

Patients sign in at `/patient` with their mobile number and a one-time SMS
code (Supabase phone auth, `shouldCreateUser: false`) — no email, password or
self sign-up. A clinic owner links the number from **Patients → Manage**; if
no Auth account has it, `/api/patients/invite` creates one with the service
key (phone confirmed, no SMS sent) and links it. Supabase delivers the code
through the **Send SMS hook** → `/api/auth/sms-hook`, which verifies the
Standard Webhooks signature (`SEND_SMS_HOOK_SECRET`) and sends via
MeliPayamak (`MELIPAYAMAK_API_KEY`, `MELIPAYAMAK_OTP_PATTERN`). Setup:
`docs/PATIENT_PHONE_LOGIN_FA.md`. Clinicians keep email + password.

### Supabase SQL Editor install (no `psql`)

For a project managed only from the Supabase dashboard,
`database/supabase-sql-editor/` holds three files to run in order:

1. `01_reset_app_schema.sql` — only for a project set up from an older
   branch; drops the app schema, keeps Auth users, refuses if any patient
   record exists.
2. `02_all_migrations.sql` — generated by
   `node database/scripts/build-sql-editor-bundle.mjs`; applies every
   migration and writes the same `schema_migrations` ledger as
   `migrate.mjs`, so later upgrades use the runner as usual. CI fails if it
   is stale (`--check`).
   Projects already installed this way apply later migrations with the
   generated `upgrades/NNN_*.sql` files (each runs once and writes the
   ledger row).
3. `03_first_clinic_owner.sql` — edit the email/name/clinic at the top; makes
   that account `clinic_owner` of a new clinic.

Do not load `database/seed/seed.dev.sql` into production. Run the database
security tests against an isolated test project after applying the migrations,
and inspect/remediate any legacy rows before validating constraints introduced
as `NOT VALID` by migrations `004`, `006`, `011` and `013`.

## Local development

Requirements: a supported Node.js LTS release and npm.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Without Supabase variables,
local development starts in mock mode. To exercise authentication, RLS and
server routes, configure a non-production Supabase project instead.

## Verification

Run all checks before a deployment:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

`npm run test:e2e` is a PHI-free mock smoke suite. The separate
`npm run test:e2e:real` command targets an already deployed staging site and
requires `REAL_E2E_BASE_URL` plus dedicated owner, therapist, staff and linked
patient credentials. The manual `Staging real-mode E2E` workflow reads those
credentials only from the protected GitHub `staging` environment. Never point
it at production or use real patient accounts.

The repository CI also boots disposable PostgreSQL 17, applies migrations
`001` through `020`, reapplies the hardening migrations, validates deferred
constraints on the clean schema, runs the multi-role RLS/cross-tenant/AI and
clinical-alert workflow suite, and verifies the development seed. The
clinical AI route still needs an end-to-end staging check with the approved
provider configuration; CI never uses a real OpenAI or production Supabase key.

## Production deployment gates

Before promoting a build:

1. Back up and restore-test the database. Use `001` only for a new database;
   on an existing project apply only tracked, previously unapplied migrations
   through `020`, then run the security tests in an isolated environment.
2. Configure the correct Supabase public values and encrypted server secret;
   verify that no privileged key appears in a client bundle or repository.
3. Confirm `NEXT_PUBLIC_DATA_MODE` is not `mock`, authentication is required,
   tenant switching cannot expose stale data and clinic roles match the intended
   PHI access.
4. Keep the posture sandbox disabled for clinical users.
5. Keep clinical AI disabled until the organization has approved provider data
   processing, retention, model choice, monitoring, incident response and human
   review. If approved, enable both flags and the approval gate together in a
   controlled release.
6. Run lint, TypeScript, unit tests and a production build with the exact
   deployment environment, then complete role/RLS and clinical-safety smoke
   tests in preview.
7. Configure `CRON_SECRET`, `CLINICAL_ALERT_WEBHOOK_URL` and
   `CLINICAL_ALERT_WEBHOOK_SECRET`, verify HMAC and idempotency at the approved
   recipient, test retry/dead-letter monitoring and connect it to a documented
   on-call escalation policy. The webhook contains stable patient/clinic IDs,
   which remain sensitive pseudonymous health metadata; select the processor
   only after privacy/security review and the required data-processing terms.

`apps/web/vercel.json` invokes the drain once a day (`0 4 * * *`, 04:00 UTC)
so the project deploys on the Vercel Hobby plan, which rejects more frequent
cron schedules. That is not an acceptable alerting configuration: before
relying on webhook alerts, move to Pro/Enterprise and set the schedule to
`* * * * *`. In-app alerts (`/alerts`) do not depend on this cron. Cron timing is
still not a hard real-time or receipt guarantee, so production needs monitoring
and a tested fallback path.

Vercel can host the Next.js application, but a successful Vercel build alone is
not a clinical-release approval. Database, security, privacy and operational
gates above remain mandatory.
