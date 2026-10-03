# PhysioAI

PhysioAI is a multilingual physiotherapy decision-support workspace built with
Next.js and Supabase. It includes clinic-scoped patient records, care episodes,
safety screening, clinician-reviewed treatment plans, exercise prescriptions,
a patient portal and clinical communication workflows.

> **Clinical safety notice:** This repository is not a validated medical
> device, diagnostic service or emergency service. It must not make autonomous
> treatment decisions. A licensed clinician remains responsible for assessment,
> escalation and every clinical decision.

## Current boundaries

- Production data uses Supabase authentication and Row Level Security. Clinic
  owners can access their clinic workflows; therapists are limited to assigned
  patients; linked patients can access only their own patient-facing records.
  Platform support and clinic staff do not receive implicit clinical-PHI access.
- Production is fail-closed. Missing Supabase configuration must show a
  configuration/authentication failure and must never load sample patient data.
- Mock mode is an explicit local/demo mode. It bypasses real authentication and
  must never be used with real patient data.
- The deterministic planning, education and chat templates are decision-support
  aids, not diagnoses or clinical clearance.
- Optional OpenAI clinical drafts run only in guarded server routes and are
  disabled by default. They require persisted safety-cleared context, audit,
  quota controls and explicit clinician review; they cannot publish treatment.
- No real posture-vision analysis is connected. The optional internal sandbox
  is disabled by default, does not inspect pixels and must not be presented as a
  clinical analysis.

## Canonical documentation

- [Web application guide](apps/web/README.md) — runtime modes, environment
  variables, database workflow and verification commands.
- [Persian setup guide](docs/RAHNAMA-FA.md) — controlled Supabase and deployment
  setup.
- [Product readiness](docs/PRODUCT_READINESS_FA.md) — completed work, open
  clinical/security/operational gates and release criteria.

These documents are the source of truth. A successful build or deployment is
not, by itself, approval for real patient data, clinical use or public sale.

## Local development

The application package is in `apps/web`. Use the Node.js and npm versions
declared in its `package.json`.

```bash
cd apps/web
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). With no local Supabase
configuration, development may use mock mode; do not enter real patient data.

For Vercel, set the project **Root Directory** to `apps/web`. Public Supabase
values and server-only secrets must be configured in the correct deployment
environment. Never expose a service/secret key through a `NEXT_PUBLIC_`
variable, a client bundle or the repository.

## Database safety

Database migrations live in `database/migrations`. The tracked runner records
SHA-256 checksums, serializes concurrent deploys and refuses an untracked or
non-empty baseline:

```bash
DATABASE_URL='postgresql://…' node database/scripts/migrate.mjs --allow-baseline
DATABASE_URL='postgresql://…' node database/scripts/migrate.mjs
```

Use `--allow-baseline` only for a verified empty database. The initial schema
migration is destructive to the legacy demo schema and the runner deliberately
refuses to adopt an existing untracked schema automatically. Such a database
needs a backed-up, reviewed DBA reconciliation before any migration is run.

`database/seed/seed.dev.sql` is development-only and must never be loaded into
production.

## Verification

Run from `apps/web` before proposing a change:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Repository CI also checks the database migrations, security regression suite
and development seed in disposable infrastructure. Real Supabase roles,
provider integrations, backup/restore and clinical release gates still require
controlled staging verification.
