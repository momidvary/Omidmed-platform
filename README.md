# PhysioAI Assistant

An AI-powered clinical decision-support web app for physiotherapists: clinical
reasoning, assessment support, treatment planning, exercise prescription,
red-flag safety screening, and patient education.

> **Clinical safety notice** — PhysioAI provides decision-support only. It
> never gives a definitive medical diagnosis; it produces *possible clinical
> hypotheses* that must be confirmed by hands-on clinical examination.

## Features

| Page | What it does |
| --- | --- |
| **Dashboard** | Quick clinical tools, recent cases, body-region modules |
| **New Case** | Structured patient intake (complaint, pain, history, goals) |
| **Case Analysis** | Auto-organised clinical reasoning: subjective/objective findings, hypotheses, differentials, yellow/red flags, missing info, suggested tests & outcome measures |
| **Treatment Planner** | Stage- and irritability-aware plan: manual therapy, exercise, mobility, strengthening, motor control, balance, education, home program, progression rules |
| **Exercise Library** | Searchable, filterable exercises with dosage, mistakes, when-to-stop, progression/regression |
| **AI Assistant** | Chat interface with case-context panel, suggested prompts, copyable answers |
| **Red Flag Checker** | Category-grouped safety screen with urgent-referral warnings |
| **Patient Education** | Plain-language handout generator (problem, avoid, exercises, when to call, home advice) |
| **Settings** | Local preferences, AI-connection notes, data reset |
| **Patient Portal** (`/patient`) | Persian/RTL patient-facing portal with Supabase email+password sign-in/sign-up: personalized exercise program with Persian instructions, daily session + pain logging, progress dashboard (pain trend chart, adherence, stat tiles), support tickets with a server-generated AI triage reply, and an AI chat that explains the patient's own exercises |
| **Posture Analysis** | Upload patient photos from three views (front / side / back); the AI screens for common postural deviations per view with severity badges, a summary, and suggested focus areas. Demo engine for now — vision-AI integration point marked. Photos never leave the browser |

## Languages

The clinician interface supports **English, فارسی (Persian) and العربية
(Arabic)** — switch from the topbar selector or Settings. Persian and Arabic
flip the whole shell to RTL. The chrome, navigation, posture analysis and
settings are fully translated; deep clinical content (exercise library,
region modules) is translated progressively. The patient portal is
Persian-native. Locale choice persists in the browser.

## Supabase

Real Supabase Auth with role-based, clinic-isolated access:

- **Roles**: `platform_admin`, `clinic_owner`, `therapist`,
  `clinic_staff`, `patient` (in `profiles`; escalation blocked by a
  DB trigger — only platform admins can change roles).
- **Schema**: `database/migrations/001_schema.sql` (clinics,
  clinic_members, patients, patient_users, patient_therapists,
  care_episodes — one patient can have multiple treatment episodes —
  episode_program, progress, sessions, appointments, exercises, tickets,
  cases). Run it, then `002_rls.sql`, in the Supabase SQL editor.
- **RLS**: `database/migrations/002_rls.sql`. No anon policies at all.
  Each clinic sees only its own data; therapists see their clinic's or
  assigned patients; patients see only themselves.
- **Dev seed** (never for production): `database/seed/seed.dev.sql`.
- **Sign-in**: email + password (clinicians at `/`, patients at
  `/patient` with sign-up). National-ID login is removed; the national ID
  is a record field only. Phone OTP requires an SMS provider configured
  in Supabase (see `docs/RAHNAMA-FA.md`).
- **Env**: copy `apps/web/.env.local.example` to `.env.local`
  (URL + publishable key). Same vars on Vercel.
- **Data modes**: real mode has no localStorage fallback; the topbar
  shows live storage status (Connected / Saving / Saved / Offline /
  Save failed) and failed saves never clear the form. Set
  `NEXT_PUBLIC_DATA_MODE=mock` for the auth-free local demo, which
  carries a permanent "Demo mode" banner.
  **Mock mode requires that explicit opt-in.** It is never inferred from
  missing env vars: because `NEXT_PUBLIC_*` values are inlined at build
  time, a typo or an unset Production variable would otherwise ship a
  clinical app with no auth at all. A build with neither a Supabase
  connection nor `DATA_MODE=mock` refuses to render and shows a
  "Configuration incomplete" screen instead.
- **Security headers**: HSTS, `X-Frame-Options: DENY`, `nosniff`,
  `Referrer-Policy` and a `Permissions-Policy` are set for every route in
  `apps/web/next.config.ts`. CSP is not set yet — it needs per-request
  nonces for the Next.js inline bootstrap, so it ships separately.
- **Session refresh**: `apps/web/proxy.ts` runs `auth.getUser()` on every
  matched request so expired access tokens are rotated server-side.
- **راهنمای فارسی**: `docs/RAHNAMA-FA.md` — creating the first admin,
  clinic, staff, and linking patient accounts.

## Tech stack

- **Next.js (React 19)** — App Router, functional components, TypeScript
- **Tailwind CSS 4** — custom medical design tokens, fully responsive
- All state is **local/mock** (React context + `localStorage`) — no backend
  required to run

## Run it

```bash
cd apps/web
npm install
npm run dev
# open http://localhost:3000
```

Production build: `npm run build && npm start`.

## Project structure

```
apps/web/
  app/                      # one folder per page (App Router)
    page.tsx                # Dashboard
    new-case/  case-analysis/  treatment-planner/
    exercise-library/  ai-assistant/  red-flags/
    patient-education/  settings/
  components/
    layout/                 # Sidebar, AppShell (topbar + responsive drawer)
    ui/                     # Card, Button, Badge, Form, Icon, Misc primitives
  lib/
    ai/engine.ts            # mock AI engine — all 🔌 integration points live here
    data/                   # mock data: exercises, body regions, red flags, sample cases
    store/CaseContext.tsx   # case state (persisted to localStorage)
    types.ts  nav.ts  utils.ts
```

### Demo (mock) mode

Set `NEXT_PUBLIC_DATA_MODE=mock` to run without auth or a database: the
patient portal then offers two demo patients (knee rehab / low back pain)
from `apps/web/lib/data/samplePatients.ts`, stored only in the browser.
This mode is for development and demos — real mode never falls back to
localStorage.

### Database files

| File | Purpose |
| --- | --- |
| `database/migrations/001_schema.sql` | Core schema (roles, clinics, patients, care episodes…) |
| `database/migrations/002_rls.sql` | Row Level Security — no anon access |
| `database/migrations/003_security_fixes.sql` | Admin bootstrap, granular role access, reply hardening, patient logs vs clinical measurements |
| `database/seed/seed.dev.sql` | Development-only demo data |
| `database/tests/rls_tests.sql` | Runnable RLS isolation test scenarios |
| `docs/RAHNAMA-FA.md` | Persian step-by-step setup guide |

Run migrations sequentially (001 → 002 → 003) in the Supabase SQL editor.
The first `platform_admin` is created once via
`select public.bootstrap_platform_admin('<user-uuid>');` — SQL editor or
service role only, refuses to run twice.

## Connecting a real AI later

Every AI-generated output flows through `apps/web/lib/ai/engine.ts`
(`buildReasoning`, `buildTreatmentPlan`, `buildEducation`, `buildChatReply`,
`buildPatientChatReply`, `buildTicketAutoReply`).
Each function is marked with a `🔌 REAL AI API INTEGRATION POINT` comment —
swap its body for a call to your AI provider that returns the same typed
shape, and the UI works unchanged. Keep API keys server-side.

## Roadmap

- Persian (RTL) UI
- Real AI provider integration (server-side)
- Multi-user accounts & cloud persistence (Supabase)
- Progress tracking and outcome-measure charts
- Printable/PDF patient handouts
