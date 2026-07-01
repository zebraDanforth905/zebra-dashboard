# Zebra Dashboard Backlog

## P0

### Harden Authorization Across Mutating Server Actions
- Priority: P0
- Affected files: `app/lib/actions.ts`, `app/lib/summer-actions.ts`, `app/lib/attendance-actions.ts`, `app/lib/inactivation-actions.ts`
- Effort: L
- Prompt: Audit every exported server action that mutates data, classify required role, and add tests proving unauthorized users are blocked.

### Add Database-Backed LMS Integration Tests
- Priority: P0
- Affected files: `app/lib/data.ts`, `app/lib/actions.ts`, `app/ui/camp/camp-lms-checklist.tsx`, `tests/`
- Effort: L
- Prompt: Add a test database fixture for camp LMS data and replace static LMS guardrail tests with end-to-end server-action/data tests.

### Verify Admin Login Migration In Dev Database
- Priority: P0
- Affected files: `migrations/040_admin_login_management.sql`, `auth.ts`, `middleware.ts`, `app/lib/auth-security.ts`
- Effort: M
- Prompt: Apply migration 040 to the dev database, create test users, and verify login events, lockout, audit logs, and session invalidation manually and with tests.

### Upgrade Vulnerable Next.js Version
- Priority: P0
- Affected files: `package.json`, `pnpm-lock.yaml`, app runtime smoke tests
- Effort: M
- Prompt: Upgrade Next.js from `16.0.7` to a version satisfying current audit patches, then run lint, test, build, and browser smoke tests.

### Review Vercel CLI Transitive Vulnerabilities
- Priority: P0
- Affected files: `package.json`, `pnpm-lock.yaml`
- Effort: M
- Prompt: Review whether `vercel` must remain a production dependency, move it to devDependencies if appropriate, and upgrade/replace vulnerable transitive packages reported by `pnpm audit`.

## P1

### Add Admin Unlock And Disable Controls
- Priority: P1
- Affected files: `app/dashboard/admin/users/page.tsx`, `app/ui/admin/users-list.tsx`, `app/lib/actions.ts`
- Effort: M
- Prompt: Add admin actions to unlock locked users and disable/reactivate accounts, with audit logs and tests.

### Add Admin Audit Log Viewer
- Priority: P1
- Affected files: `app/dashboard/admin/audit/page.tsx`, `app/lib/data.ts`, `app/ui/admin/`
- Effort: M
- Prompt: Build an admin-only audit log page with filters by actor, target user, action, and date.

### Add Continuous Integration
- Priority: P1
- Affected files: `.github/workflows/ci.yml`, `package.json`
- Effort: S
- Prompt: Add a GitHub Actions workflow that installs dependencies and runs lint, test, and build on pull requests.

### Improve Form Accessibility In Admin Tables
- Priority: P1
- Affected files: `app/ui/admin/users-list.tsx`, `app/ui/staff-schedule/settings-view.tsx`
- Effort: S
- Prompt: Add explicit labels or accessible names for compact admin table inputs and buttons.

## P2

### Consolidate LMS Schema Readiness Checks
- Priority: P2
- Affected files: `app/lib/actions.ts`, `app/lib/data.ts`
- Effort: M
- Prompt: Extract repeated camp LMS migration readiness checks into one shared helper with a single user-facing migration message.

### Reduce Debug Logging In Data Sync Code
- Priority: P2
- Affected files: `app/lib/actions.ts`, `app/lib/data.ts`, `app/lib/insert_from_portal.ts`, `app/lib/scraper_helpers.ts`
- Effort: M
- Prompt: Replace noisy console logging in sync/data paths with structured errors and optional debug logging that avoids sensitive data.

### Add Index Review For Camp And LMS Queries
- Priority: P2
- Affected files: `migrations/`, `app/lib/data.ts`
- Effort: M
- Prompt: Review camp/LMS queries for missing indexes and add migration-backed indexes where query plans show repeated scans.
