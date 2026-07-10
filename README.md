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

## Connecting a real AI later

Every AI-generated output flows through `apps/web/lib/ai/engine.ts`
(`buildReasoning`, `buildTreatmentPlan`, `buildEducation`, `buildChatReply`).
Each function is marked with a `🔌 REAL AI API INTEGRATION POINT` comment —
swap its body for a call to your AI provider that returns the same typed
shape, and the UI works unchanged. Keep API keys server-side.

## Roadmap

- Persian (RTL) UI
- Real AI provider integration (server-side)
- Multi-user accounts & cloud persistence (Supabase)
- Progress tracking and outcome-measure charts
- Printable/PDF patient handouts
