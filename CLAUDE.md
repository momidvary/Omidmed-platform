# PhysioAI Assistant - Claude Instructions

## Project Identity

PhysioAI Assistant is an AI-powered clinical decision-support web app for
physiotherapists. It helps with clinical reasoning, assessment, treatment
planning, exercise prescription, red-flag safety screening, and patient
education.

This project replaced the earlier "OmidMed ordering platform" concept.
Do not rebuild ordering/e-commerce features.

## Main Users

- Physiotherapists
- Rehab clinicians
- Clinic owners
- Physiotherapy assistants under supervision

## Clinical Safety Rules (non-negotiable)

- The app must NEVER present a final medical diagnosis.
- Always use the wording "possible clinical hypotheses" and remind the user
  to confirm with clinical examination.
- Red-flag screening must always warn: "Refer to physician / emergency care
  if clinically indicated."
- Every AI-generated page must show the clinical safety disclaimer
  (`Disclaimer` component in `components/ui/Misc.tsx`).

## Current MVP Scope

- 10 clinician pages: Dashboard, New Case, Case Analysis, Treatment Planner,
  Exercise Library, AI Assistant, Posture Analysis (3-view photo upload +
  mock vision findings), Red Flag Checker, Patient Education, Settings.
- Clinician UI i18n (en/fa/ar) via `lib/i18n/translations.ts` +
  `LocaleContext`; fa/ar are RTL. Chrome/nav/posture/settings translated;
  deep clinical content is progressive. Patient portal stays Persian-native.
- Supabase Auth + RLS are real: roles in `profiles` (platform_admin /
  clinic_owner / therapist / clinic_staff / patient), schema in
  `database/migrations/001_schema.sql`, policies in `002_rls.sql` (no anon
  policies), dev-only seed in `database/seed/seed.dev.sql`. Clinic data is
  isolated per clinic; therapists see their clinic's or assigned patients;
  patients see only themselves. One patient can have multiple
  care_episodes.
- Auth is PHONE OTP ONLY for all five roles (single flow in
  `components/auth/PhoneOtpLogin.tsx`, `shouldCreateUser:false`; accounts
  provisioned via audited server routes under `app/api/`). Never add
  email/password, magic-link, or national-ID login; national_id is a
  record field only. Phone normalization lives in `lib/phone.ts` (E.164,
  fa/ar digits) with tests in `lib/__tests__` (`npm test`). SMS delivery:
  `supabase/functions/send-auth-sms` (Kavenegar/mock providers; secrets
  only in Supabase Secrets). Persian guides: docs/PHONE_OTP_ALL_USERS_FA,
  KAVENEGAR_SETUP_FA, SUPABASE_SEND_SMS_HOOK_FA,
  CREATE_FIRST_PHONE_ADMIN_FA, PHONE_ACCOUNT_RECOVERY_FA.
- Patient Portal at `/patient` (Persian, RTL, Vazirmatn font); clinic
  links accounts via patient_users. Persian exercise content in
  `apps/web/lib/data/exerciseFa.ts`.
- Data modes (`lib/config.ts`): mock mode (NEXT_PUBLIC_DATA_MODE=mock or
  missing env) = local demo, no auth. Real mode = no localStorage
  fallback; storage status shown via `SaveStatusPill` (Connected/Saving/
  Saved/Offline/Save failed); failed saves must never clear user input.
- Persian setup guide: `docs/RAHNAMA-FA.md`.
- The "AI" is a mock heuristic engine in `apps/web/lib/ai/engine.ts`.

## AI Integration Rule

All AI behaviour flows through `apps/web/lib/ai/engine.ts`. Each function is
marked with "🔌 REAL AI API INTEGRATION POINT". When connecting a real
provider, keep the function signatures and return types identical so the UI
needs no changes. API keys must live in server-side environment variables —
never in the browser, never committed.

## Technical Direction

- Next.js App Router + React 19 + TypeScript everywhere
- Tailwind CSS 4 (design tokens defined in `apps/web/app/globals.css`)
- Reusable primitives in `apps/web/components/ui/`
- App shell (sidebar + topbar) in `apps/web/components/layout/`
- Mock data in `apps/web/lib/data/`
- GitHub for version control

## Architecture Rules

- Build incrementally; make the smallest safe change.
- Do not modify unrelated files.
- Do not delete existing files without confirmation.
- Keep the project production-ready: `npm run build` and `npm run lint`
  must pass in `apps/web` before committing.
- Responsive design is required (desktop, tablet, mobile).
- Every feature must be documented in README.md.

## Future Roadmap (do not build unless asked)

- Persian (RTL) UI
- Real AI provider integration (server-side route handlers)
- Supabase auth + persistence
- Progress tracking / outcome-measure charts
- Printable or PDF patient handouts

## Working Style

1. Understand the current scope.
2. Make the smallest safe change.
3. Verify with build + lint (and browser check for UI changes).
4. Explain what changed.
5. Update documentation if needed.
