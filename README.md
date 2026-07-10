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
| **Patient Portal** (`/patient`) | Persian/RTL patient-facing portal: login by national ID (کد ملی), personalized exercise program with Persian instructions, daily session + pain logging, progress dashboard (pain trend chart, adherence, stat tiles), support tickets to the therapist with instant AI triage reply, and an AI chat that explains the patient's own exercises |
| **Posture Analysis** | Upload patient photos from three views (front / side / back); the AI screens for common postural deviations per view with severity badges, a summary, and suggested focus areas. Demo engine for now — vision-AI integration point marked. Photos never leave the browser |

## Languages

The clinician interface supports **English, فارسی (Persian) and العربية
(Arabic)** — switch from the topbar selector or Settings. Persian and Arabic
flip the whole shell to RTL. The chrome, navigation, posture analysis and
settings are fully translated; deep clinical content (exercise library,
region modules) is translated progressively. The patient portal is
Persian-native. Locale choice persists in the browser.

## Supabase

The app is Supabase-ready but runs fully local until configured:

1. Create a project at [supabase.com](https://supabase.com), then open
   **SQL Editor** and run `database/schema.sql` once.
2. Copy `apps/web/.env.local.example` to `apps/web/.env.local` and fill in
   `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` from
   Project Settings → API.
3. Restart the dev server. Settings → Supabase Connection shows the status.

The client lives in `apps/web/lib/supabase/client.ts`; data-layer sync is
the next step on the roadmap (the schema already matches the app's types).

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

### Patient portal demo logins

| کد ملی | Patient | Program |
| --- | --- | --- |
| `1234567890` | رضا کریمی | Post-TKA knee rehab |
| `0987654321` | سارا احمدی | Chronic low back pain |

Patient data lives in `apps/web/lib/data/samplePatients.ts` (mock auth —
national ID lookup only; real authentication is on the roadmap).

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
