# PhysioAI Assistant — Repository Instructions

## Project identity

PhysioAI is a multilingual physiotherapy decision-support application. It
supports structured clinical workflows but is not a validated medical device,
diagnostic service, emergency service or autonomous treatment system.

This repository replaced the earlier OmidMed ordering-platform concept. Do not
reintroduce ordering or e-commerce features.

## Non-negotiable clinical safety

- Never present a definitive diagnosis, autonomous clearance or unsupervised
  treatment decision.
- Describe generated reasoning as provisional clinical hypotheses that require
  examination and clinician judgment.
- An incomplete or concerning safety screen must block treatment, education,
  clinical-AI and prescription-publish workflows as designed.
- Urgent and emergency signals must direct the user to the appropriate clinical
  escalation pathway; an automated acknowledgement is not proof of clinician
  review.
- AI output must remain a draft until an authorized clinician explicitly
  reviews it. AI must never publish a plan or mutate the clinical record.
- Do not imply that the posture sandbox analyses an image. No real vision model
  is currently connected.

## Current architecture

- The Next.js application is in `apps/web` and uses the App Router, React,
  TypeScript and Tailwind CSS.
- Supabase Auth and RLS are the source of truth in real mode. All reads and
  writes must remain scoped to the explicitly selected active clinic.
- Access is least-privilege:
  - clinic owners manage authorized workflows in their clinic;
  - therapists access clinical data only for patients assigned to them;
  - clinic staff do not receive implicit clinical-PHI access;
  - linked patient accounts access only their own patient-facing records;
  - platform administrators do not receive implicit break-glass PHI access.
- A real case is linked to the correct clinic, patient and care episode.
  Treatment-plan and prescription history is versioned; signed/published
  records are not silently rewritten.
- The patient portal can represent more than one linked family member. Selection
  must be explicit and drafts/state must not leak between patients or accounts.
- National ID is a record field, never an authentication credential.

## Runtime modes

- `NEXT_PUBLIC_DATA_MODE=mock` is an explicit auth-free demo mode and may use
  local sample state. It must never contain real patient data.
- Development may fall back to mock mode when Supabase is not configured.
- Production is fail-closed: missing Supabase configuration must not activate
  mock mode, bypass authentication or load sample patient records.
- Real-mode persistence failures must remain visible to the user and must not
  be disguised as successful local saves.

## AI boundaries

Two separate mechanisms exist and must not be conflated:

1. Deterministic decision-support templates live in
   `apps/web/lib/ai/engine.ts`. They are not model responses.
2. Optional OpenAI clinical drafts use guarded server-side route handlers under
   `apps/web/app/api/ai/clinical-draft/`. They are disabled by default and
   require all operational gates, authenticated/authorized persisted context,
   current safety clearance, bounded structured input/output, audit,
   idempotency/quota controls and explicit clinician review.

Provider keys and Supabase secret/service keys are server-only. Never put them
in a `NEXT_PUBLIC_` variable, browser code, logs, fixtures or committed files.
On refusal, timeout or failure, do not manufacture a fallback clinical answer.

## Database rules

- Canonical migrations are the numerically ordered SQL files in
  `database/migrations`. Read every applicable migration and the current
  security tests before changing schema or authorization.
- Production migration execution uses `database/scripts/migrate.mjs`; preserve
  its checksum ledger, advisory lock and fail-closed baseline behavior.
- The initial schema migration removes the legacy demo schema. Use it only for
  a new database or an explicitly approved baseline; never replay it on an
  existing production database.
- Preserve RLS, tenant-integrity triggers, actor derivation and append-only audit
  behavior. Client-supplied clinic IDs, authors, reviewers or timestamps are not
  authorization.
- `database/seed/seed.dev.sql` is development-only and must never be run in
  production.
- Plain PostgreSQL CI is not a substitute for controlled staging checks with
  real Supabase Auth, PostgREST and deployment configuration.

## Engineering rules

- Preserve unrelated work in the dirty tree and make the smallest safe change.
- Use the reusable UI primitives and existing locale/direction mechanisms.
- Treat Persian and Arabic RTL, keyboard operation, error recovery and mobile
  layouts as product requirements.
- Add regression coverage for security, safety and tenant-boundary changes.
- Do not weaken a fail-closed path merely to make a demo or test pass.
- Keep feature and deployment claims aligned with
  `apps/web/README.md`, `docs/RAHNAMA-FA.md` and
  `docs/PRODUCT_READINESS_FA.md`.

## Verification

Run relevant checks in `apps/web`:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

A passing local build does not authorize production deployment or clinical use.
Infrastructure, RLS on the target project, backup/restore, privacy, clinical
validation and release approval remain separate gates.
