# Zebra Dashboard Project State

Generated: 2026-07-01 for the consolidated pre-PR test branch.

## Stack Summary

- Framework/language: Next.js App Router with React 19.2 and TypeScript.
- Package manager: `pnpm`; key scripts are `pnpm dev`, `pnpm build`, `pnpm lint`, `pnpm test`, and `pnpm camp:picture-qrs`.
- Entry points: route pages under `app/**/page.tsx`, route handlers under `app/**/route.ts`, server actions in `app/lib/actions.ts` and `app/lib/summer-actions.ts`, auth handler at `app/api/auth/[...nextauth]/route.ts`, and request middleware in `middleware.ts`.
- Database: raw SQL through `postgres`; manual SQL migrations under `migrations/`.
- Auth/session: `next-auth` v5 credentials provider in `auth.ts`; bcrypt password verification; JWT sessions enriched with `id`, `name`, `user_type`, and `session_version`.
- Test setup: this branch adds Node's built-in test runner via `pnpm test`; before this branch there was no test runner configured.
- CI config: no `.github` workflow directory is present in this checkout.
- Current branch base: `origin/main` at `dcc68db` (`Revert schedule page to absent-only view (remove attendance buttons)`).

## Recent Commits

- `dcc68db` Revert schedule page to absent-only view (remove attendance buttons).
- `7e7fca8` Merge feature/mark-attendance: portal attendance marking and scheduled inactivations.
- `80b472a` Add portal attendance marking, scheduled inactivations, and related UI.
- `e7de947` Display recurring invoices in summer responses tab.
- `a777c6a` Seed camp print log with enrolled students by default.
- `85d4066` Add staff (Coaches) schedule tab to camp weeks and printable packet.
- `eab4bb8` Merge branch `add-activity-schedule-to-camp-packet`.
- `409834e` Add activity schedule to printable camp packet.
- `ec720e1` Use proven break-after model for camp packet page breaks.
- `831dc9c` Fix camp packet print page breaks broken by chart-inclusion wrapper.

## Key File Map

- Authentication/login: `auth.ts`, `auth.config.ts`, `middleware.ts`, `app/login/page.tsx`, `app/login/actions.ts`, `app/ui/login-form.tsx`, `app/api/auth/[...nextauth]/route.ts`.
- Auth security helpers: `app/lib/auth-security.ts`, `app/lib/auth-security-rules.ts`.
- User/password model and actions: `app/lib/definitions.ts`, `app/lib/actions.ts`, `app/ui/settings/update-password-form.tsx`, `app/dashboard/settings/page.tsx`.
- Admin routes/panel: `app/dashboard/admin/users/page.tsx`, `app/dashboard/admin/incident-reports/page.tsx`, `app/ui/admin/users-list.tsx`, `app/ui/admin/create-user-form.tsx`.
- Session/token handling: `auth.ts` JWT/session callbacks, `middleware.ts` token decoding and session-version validation.
- LMS checklist UI/state: `app/dashboard/camp/[startDate]/[endDate]/page.tsx` loads `fetchCampLmsChecklist`; `app/ui/camp/camp-lms-checklist.tsx` handles local pending UI state and server-action submissions.
- LMS checklist persistence/actions: `app/lib/data.ts` (`fetchCampLmsChecklist`, `summarizeCampLmsRows`), `app/lib/actions.ts` (`refreshCampLmsWeek`, `syncCampLmsCanvasWeek`, `updateCampLmsStatus`, `runCampLmsCanvasTestAction`, mapping imports/saves).
- LMS migrations: `migrations/025_lms_camp_checklist.sql`, `026_canvas_lms_workflow.sql`, `027_rename_lms_status_note.sql`, `030_lms_canvas_activate_course_action.sql`, `032_lms_mapping_additional_courses.sql`, `033_create_app_settings.sql`.

## Known Gaps And Risks

- Admin login management required new schema because no prior `login_events`, audit log, lockout columns, or session invalidation version was present.
- Existing sessions are JWT-based; this branch invalidates them with a database-backed `users.session_version` check in middleware.
- LMS tests in this branch avoid live Canvas and database writes; they verify the server-action/data-flow guardrails statically. A future test DB harness would allow deeper integration coverage.
- Migration deployment is manual. Apply `migrations/040_admin_login_management.sql` before testing the new login-monitoring UI against a database.
- Migration numbering already has duplicate older numbers (`027`, `028`); new migrations should continue with unique numbers.

## Prioritized Improvements

- P0: Apply and verify `040_admin_login_management.sql` in a non-production database before manual auth testing.
- P0: Review all remaining server actions that mutate billing/schedule/camp data and decide whether they require admin-only enforcement.
- P0: Replace static LMS guardrail tests with database-backed integration tests once a reliable test database fixture exists.
- P1: Add admin unlock/disable controls to complement lockout status visibility.
- P1: Add a dedicated audit-log viewer for admin actions.
- P1: Add CI that runs `pnpm lint`, `pnpm test`, and `pnpm build`.
- P2: Consolidate repeated LMS schema-readiness checks into one helper.
- P2: Clean generated Playwright/output artifacts before any PR.
