# Summer Schedule Implementation

## Purpose

This document is the historical implementation reference for the parent-facing summer scheduling system in the Zebra Dashboard.

For the current future-week schedule plan, see `Summer-Schedule-Future-Week-Plan.md`.

Built for:
- Next.js 15 App Router
- Direct PostgreSQL via `postgres` npm package (no ORM)
- Auth via `next-auth` v5 (`auth()` server-side, JWT callbacks)
- Staff pages under `/dashboard`
- Public parent form outside `/dashboard` at `/summer-reg`

---

## Executive Summary

Parents receive a tokenized per-family link (`/summer-reg?token=abc123`). They open it, see each active student, see current class context, pick summer sessions if attending, record fall plans if needed, and submit. Staff review responses in `/dashboard/summer`, apply choices to the Zebra Portal, then mark each response as Added to Portal.

**Key framing:** Responses are the intake workflow. The future live summer schedule should come from portal sync after staff applies responses to the portal, not directly from `parent_requests`.

## Current Addendum — 2026-05-29

Summer responses are already shaped well enough for the summer schedule handoff. The form persists selected session IDs plus per-session start dates, so no response schema change is required unless staff needs parents to express non-contiguous week-by-week attendance in structured fields.

The next schedule work is separate:

- add a week selector to `/dashboard/schedule`
- keep default schedule behavior unchanged when no week is selected
- make schedule counts and rosters date-aware with `start_date` and `end_date`
- classify portal-synced sessions as summer or regular
- scope portal-sync deletes before scraping partial summer date ranges

See `Summer-Schedule-Future-Week-Plan.md` for implementation details and launch gates.

Current migration set for summer responses is `008` through `022`. Migration `022` adds response source tracking (`submitted_by`, `submitted_by_name`) and portal staff tracking (`added_to_portal_by`).

---

## Confirmed Product Decisions

| Decision | Answer |
|----------|--------|
| Enrollment or preference form? | Enrollment — parents pick actual sessions |
| Multiple sessions per student? | Yes — Mon 4:15 AND Sat 10:00 each become a real enrolment |
| "No change" option? | Historical only. Current parent form offers Enroll, Pause, and Custom. Existing `no_change` rows can still be bulk-completed. |
| Course selection? | Neither form nor approval — auto-inherited from student's existing enrolment |
| Token expiry? | No hard expiry — staff control by flipping `is_summer=FALSE` on sessions |
| Form stays live how long? | Until staff flip all summer sessions to `is_summer=FALSE` |
| Resubmission? | Yes — old row `superseded`, new `is_latest=TRUE` row created |
| September scheduling? | Current form includes a fall section with same/change/pause options and per-session fall start dates. |
| Restart (inactive siblings)? | Phase 3 — same link, extra card section, detected automatically |
| Capacity limits? | No hard blocks — staff flip `is_summer=FALSE` to close a session later phase we could have auto calculation on Coach Capacity |
| Per-student or per-family link? | Per-family (one link per customer) |
| `generateAllParentTokens` scope? | Customers with at least one **active enrolment** — churned families excluded |

---

## Architecture

```
Staff generates tokens → exports CSV → sends via Constant Contact (or Resend, Phase 4)
                                              ↓
Parent clicks /summer-reg?token=abc123
                                              ↓
Form fetches live sessions WHERE is_summer=TRUE
  → If none: shows "Summer times coming soon — check back shortly"
Parent sees each student's current class context
For each student (actual enrollment):
  ├── Check off session(s) they want  [Mon 4:15] [Tue 4:15] [Sat 10:00] etc.
  ├── Pause for summer → one click
  └── Custom / unusual request → blank text box with examples
Parent submits → parent_requests row(s) created (is_latest=TRUE)
                                              ↓
Staff dashboard /dashboard/summer
├── See all submissions (filtered by status)
├── Review details and custom notes
├── Apply selected choices to Zebra Portal
└── Mark Added to Portal when done
```

---

## Operational Requirements (Non-Code)

These items are part of the real launch plan and should be tracked alongside the coding work.

- **Family email source of truth:** The current system assumes one deliverable family email in `customers.email`. Before send, staff must audit missing/blank emails and decide how to handle families where both parents want the link.
- **One link per family:** `parent_tokens` enforces one token per `customer_id`, and the CSV/export flow must stay deduplicated at the customer level even when multiple students or enrolments exist.
- **Family link QA before send:** Staff must be able to preview any generated family link while logged in so they can verify the correct children and current class context appear before emailing that family.
- **Internal end-to-end test:** Before the first campaign send, staff should send at least one real token to an internal address, open the email, submit the form, and run the approval flow through to enrolment creation.
- **Response triage for schedule building:** Staff need both filters and sorting on the response dashboard so they can work queues such as `enrolling`, `no_change`, `pausing`, `needs_followup`, and requested session/time.
- **Export tracking:** Constant Contact remains the send source of truth. Dashboard tracks CSV export with `last_exported_at` / `export_count`, not actual email delivery.

## OnTrack / Small Backlog Items

Use this section for lightweight operational/productivity follow-ups that are too small for a dedicated GitHub issue. Bigger feature implementations should still get a GitHub issue so design, acceptance criteria, and PRs can be tracked cleanly.

- **Investigate Vercel deploy workflow workaround:** Current launch flow depends on Taite merging/pushing to `main` so Vercel deploys the live site. After summer launch, find a better workflow for preview/staging deploys from `summer-responses` or other feature branches without requiring a production merge first. Options to evaluate: Vercel project access for Kyle, GitHub preview deployment settings, a separate staging Vercel project, or a documented Taite approval/deploy handoff.

---

## Schema — Migrations

### `migrations/008_create_parent_request_tables.sql`

```sql
-- Generalized parent self-serve system.
-- 'summer' is the first request_type; restart/other will reuse this schema.
-- NOTE: students.id is NUMERIC in this DB (portal ID).

-- One token per customer (family). Reused across all future flows.
CREATE TABLE parent_tokens (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id      UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  token            TEXT NOT NULL UNIQUE,
  email_sent_at    TIMESTAMPTZ,
  email_sent_count INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(customer_id)
);

CREATE INDEX idx_parent_tokens_token       ON parent_tokens(token);
CREATE INDEX idx_parent_tokens_customer_id ON parent_tokens(customer_id);

-- Generalized parent request. One row per submission.
-- Multiple rows per student are possible (resubmission); use is_latest to find current.
CREATE TABLE parent_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id      UUID NOT NULL REFERENCES parent_tokens(id) ON DELETE CASCADE,
  student_id    NUMERIC NOT NULL,   -- matches students.id (NUMERIC, cast to text in TS)
  request_type  TEXT NOT NULL CHECK (request_type IN ('summer_scheduling', 'restart', 'other')),
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'reviewed', 'completed', 'superseded', 'needs_manual_followup')),
  is_latest     BOOLEAN NOT NULL DEFAULT TRUE,  -- only one TRUE per (student_id, request_type)
  payload       JSONB NOT NULL DEFAULT '{}',    -- request-type-specific structured data
  custom_notes  TEXT,                           -- free text for "Other" or extra context
  enrolment_ids UUID[] NOT NULL DEFAULT '{}',  -- set when approved; one per session enrolled
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at   TIMESTAMPTZ,
  reviewed_by   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_parent_requests_token_id     ON parent_requests(token_id);
CREATE INDEX idx_parent_requests_student_id   ON parent_requests(student_id);
CREATE INDEX idx_parent_requests_status       ON parent_requests(status);
CREATE INDEX idx_parent_requests_request_type ON parent_requests(request_type);
-- Partial index for efficient "latest" lookups
CREATE INDEX idx_parent_requests_latest
  ON parent_requests(student_id, request_type)
  WHERE is_latest = TRUE;
```

### `migrations/009_add_summer_flag_to_sessions.sql`

```sql
-- Staff flip is_summer=true on session rows to make them appear on the parent form.
-- Removing the flag (or deleting the session) makes it disappear immediately.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS is_summer BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX idx_sessions_is_summer ON sessions(is_summer) WHERE is_summer = TRUE;
```

### `migrations/010_add_alternate_email_to_customers.sql`

```sql
-- Staff-fillable alternate contact email for families where both parents want the summer link.
-- Non-breaking: existing rows receive NULL; populated manually before the CC import.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS alternate_email TEXT;
```

Decision: treat alternate_email as a staff-managed field. Staff fill it in for two-parent families before exporting the CSV. Constant Contact can CC the alternate address or staff can import it as a second recipient list — that is an operational choice, not a code choice. The column gives the CSV a real DB source rather than relying on a staff spreadsheet.

### Payload shapes (JSONB)

```typescript
// request_type: 'summer_scheduling'
// session_ids are UUIDs of sessions WHERE is_summer=TRUE
// course_id NOT stored — auto-inherited at approval time
{ summer_status: 'enrolling' | 'pausing' | 'no_change', session_ids: string[] }
// no_change: historical only; current form does not offer it

// request_type: 'restart' (Phase 3)
{ session_id: string }  // course auto-inherited from last known enrolment

// request_type: 'other'
{}  // custom_notes TEXT field carries all content
```

---

## Status Model

| Status | Meaning | Set by |
|--------|---------|--------|
| `pending` | Submitted, not yet reviewed | System on submit |
| `superseded` | Replaced by a newer submission | System on resubmit |
| `reviewed` | Legacy status retained for old rows | Historical |
| `completed` | Enrolment(s) created | System on approval |
| `needs_manual_followup` | Custom request, requires human | System on "Other" submit |

**Re-submission:** Old summer/fall planning row → `is_latest=FALSE, status='superseded'`. New row → `is_latest=TRUE, status='pending'` or `needs_manual_followup`.

---

## Route Structure

### Public (no auth)
- `GET /summer-reg?token=abc123` — parent enrollment form
- `GET /summer-reg/submitted` — confirmation page

### Protected (admin only)
- `GET /dashboard/summer` — staff hub (`?tab=responses` or `?tab=links`)

---

## `auth.config.ts` Fix

The current authorized callback redirects logged-in users from any non-dashboard route to `/dashboard`. This must be fixed to allow staff to preview the parent form.

**Current** (line ~14):
```typescript
} else if (isLoggedIn) {
  return Response.redirect(new URL('/dashboard', nextUrl)); // ← blocks /summer-reg
}
```

**Fix:**
```typescript
authorized({ auth, request: { nextUrl } }) {
  const isLoggedIn = !!auth?.user;
  const isOnDashboard = nextUrl.pathname.startsWith('/dashboard');
  const isPublicParentRoute = nextUrl.pathname.startsWith('/summer-reg');
  if (isOnDashboard) {
    if (isLoggedIn) return true;
    return false;
  } else if (isPublicParentRoute) {
    return true; // allow both auth and unauth — token is the access mechanism
  } else if (isLoggedIn) {
    return Response.redirect(new URL('/dashboard', nextUrl));
  }
  return true;
},
```

---

## New Files to Create

| File | Purpose |
|------|---------|
| `migrations/008_create_parent_request_tables.sql` | Generalized schema |
| `migrations/009_add_summer_flag_to_sessions.sql` | Live session control |
| `migrations/010_add_alternate_email_to_customers.sql` | Staff-fillable alternate family email |
| `app/lib/summer-data.ts` | Read queries (follows data.ts patterns) |
| `app/lib/summer-actions.ts` | Server actions |
| `app/summer-reg/page.tsx` | Public parent form (no auth) |
| `app/summer-reg/submitted/page.tsx` | Confirmation page |
| `app/dashboard/summer/page.tsx` | Admin staff dashboard |
| `app/dashboard/summer/loading.tsx` | Skeleton fallback |
| `app/ui/summer/summer-reg-form.tsx` | Client: parent form |
| `app/ui/summer/student-card.tsx` | Client: per-student section |
| `app/ui/summer/stats-cards.tsx` | Server: summary stats |
| `app/ui/summer/summer-tabs.tsx` | Client: tab switcher |
| `app/ui/summer/responses-table.tsx` | Server: response list |
| `app/ui/summer/approve-modal.tsx` | Client: individual approval (start_date only) |
| `app/ui/summer/approve-all-modal.tsx` | Client: bulk approval |
| `app/ui/summer/link-management.tsx` | Server: link table + export |
| `app/ui/summer/copy-link-button.tsx` | Client: clipboard copy |
| `app/ui/summer/export-csv-button.tsx` | Client: CSV download |
| `app/lib/email/resend.ts` | Resend client singleton (Phase 4) |
| `app/lib/email/summer-form-email.tsx` | React Email template (Phase 4) |
| `app/ui/summer/send-emails-button.tsx` | Client: bulk send button (Phase 4) |

## Files to Modify

| File | Change |
|------|--------|
| `auth.config.ts` | Exempt `/summer-reg` (see fix above) |
| `app/lib/definitions.ts` | Add parent self-serve types |
| `app/ui/dashboard/nav-links.tsx` | Add `{ name: 'Summer Reg', href: '/dashboard/summer', adminOnly: true }` |

---

## Key Data Functions (`app/lib/summer-data.ts`)

All follow data.ts patterns: `'use server'`, `'use cache'` + `cacheTag` inside function body.

```typescript
// fetchParentFormData(token) → ParentFormData | null
// NO cache — public, always fresh
// Lookup token → JOIN customers + students → current Sept slot per student
// → latest parent_request per student (is_latest=TRUE, summer_scheduling)
// → sessions WHERE is_summer=TRUE

// fetchSummerStats() → SummerStats
// cacheTag('summer-responses')

// fetchSummerResponseRows(filter, sort) → SummerResponseRow[]
// cacheTag('summer-responses')
// filter: 'all' | 'pending' | 'enrolling' | 'pausing' | 'needs_followup' | 'approved'
// sort: 'submitted_desc' | 'submitted_asc' | 'parent_name' | 'student_name' | 'summer_status' | 'current_slot'

// fetchParentLinkRows() → ParentLinkRow[]
// cacheTag('summer-tokens', 'summer-responses')
// JOIN: parent_tokens
//   → customers            (email, alternate_email)
//   → students             (for student_names[])
//   → enrolments → sessions → courses  (course_name, weekday, start_time per student)
// Aggregate into student_courses[] on the customer row for staff QA/reference.
//
// ParentLinkRow shape (definitions.ts):
// {
//   token_id: string;
//   customer_id: string;
//   customer_name: string;
//   email: string;
//   alternate_email: string | null;          ← new: from customers.alternate_email
//   student_names: string[];
//   student_courses: Array<{                 ← new: one entry per active enrolment
//     student_name: string;
//     course_name: string;
//     weekday: string;
//     start_time: string;
//   }>;
//   token: string;
//   last_exported_at: Date | null;
//   export_count: number;
//   has_responded: boolean;
// }

// fetchSummerSessions() → Session[]    — WHERE is_summer=TRUE
// cacheTag('schedule')
```

---

## Key Server Actions (`app/lib/summer-actions.ts`)

```typescript
// generateParentToken(customerId)   — idempotent, crypto.randomBytes(24).toString('hex')
// generateAllParentTokens()         — bulk INSERT for all customers with at least one active enrolment
// submitSummerForm(prevState, formData)  — PUBLIC, validates by token only
//   1. Validate token exists
//   2. Validate all session_ids are still is_summer=TRUE
//   3. Per student: supersede old row, INSERT new parent_requests row
//   4. revalidateTag('summer-responses', 'max')
//   5. redirect('/summer-reg/submitted')

// approveSummerRequest(formData)    — FormData: request_id, start_date
//   1. Fetch request → student_id + payload.session_ids[]
//   2. Auto-inherit course_id: SELECT course_id FROM enrolments
//      WHERE student_id=$x ORDER BY start_date DESC LIMIT 1
//   3. sql.begin: INSERT one enrolment per session_id RETURNING id
//      UPDATE parent_requests SET enrolment_ids=[...], status='completed'

// approveAllEnrolling(formData)     — FormData: start_date only
//   Must filter: status='pending' AND payload->>'summer_status'='enrolling' to avoid double-approving
// removeFromSummer(formData)        — deletes all enrolment_ids[], resets to pending
// markAddedToPortal(requestId)      — records when staff has applied response to portal
// clearAddedToPortal(requestId)
// markNeedsFollowup(formData)
// clearFollowup(requestId)
// updateSummerResponseSource(requestId, 'parent' | 'staff')
// sendSummerFormEmails(customerIds?) — Phase 4, uses Resend
```

**Zod schemas:**
```typescript
// No session_id or course_id — both auto-inherited from DB at approval time
const ApproveSummerSchema = z.object({ request_id: z.string().uuid(), start_date: z.coerce.date() });
const ApproveAllSchema    = z.object({ start_date: z.coerce.date() });
const RemoveFromSummerSchema = z.object({ request_id: z.string().uuid() });
```

---

## Parent Form UX

```
[Student Name] — currently in: Wednesday 5:15 PM

○ Continue weekly classes in July and August:
    Mon / Fri:         [ ] 4:15 PM
    Tue / Wed / Thu:   [ ] 4:15 PM   [ ] 5:15 PM
    Saturday:          [ ] 9:00 AM   [ ] 10:00 AM   [ ] 11:00 AM   [ ] 12:00 PM   [ ] 1:00 PM
○ Not attending this summer in July and August
○ Custom / unusual request: [___________________________]
  e.g. "Only June evenings, then pause in July and resume mid-August"

Fall section:
○ Keep current session
○ Request a different class time starting in September
○ Pause in September
```

**"No change" behavior:** historical only. Old `summer_status: 'no_change'` rows may exist and can still be bulk-completed, but the current parent form does not offer this option.

Sessions are grouped by weekday from live DB rows (`is_summer=TRUE`). No hardcoded slot config.

**Form header messaging:**
> Choose your child's summer evening class schedule below.
> This is for your ongoing summer schedule — not for one-time date changes.
> You can select multiple time slots if your child will attend more than one session per week.
>
> We'll assume your child returns to the same class time in September unless you tell us otherwise.

---

## Staff Dashboard Components

- **Stats cards** — Total Families, Responded, Not Responded, Exported, Enrolling, Pausing, Needs Follow-up, Parent Submitted, Staff Submitted
- **Tabs** — `links`, `responses`, `schedule`, `fall-schedule`
- **`SummerResponsesSection`** — table: Student, Parent, Choice, Sessions, Sept Slot, Submitted, Actions; sortable by submitted date, family, student, response type, and current slot
- **`ApproveModal` / `ApproveAllModal`** — historical/local enrolment path. Primary operating workflow is now response → portal → Added to Portal.
- **`Delete response`** — testing/cleanup action. Current code hard-deletes the `parent_requests` row after deleting linked enrolments; if audit preservation is required, restore the `removed_at` soft-delete plan before launch.
- **`AddedToPortalButton`** — marks portal application complete and records staff name.
- **`SummerLinkManagement`** — Generate All Tokens, Export CSV, Copy individual links, Preview link, and flag rows missing a usable email
- **`CopyLinkButton`** — `navigator.clipboard.writeText(origin + '/summer-reg?token=' + token)`
- **`PreviewLinkButton`** — opens `/summer-reg?token=...` in a new tab so staff can QA a family's form before send
- **`ExportCsvButton`** — client-side CSV, **one row per family** (deduplicated at customer level)

**Current CSV columns:**
```
Email, Alternate Email, Students, Link
```
- **Alternate Email** — pulled from `customers.alternate_email`; empty string if null.
- **Students** — active students only, formatted for email copy.
- CC template uses `{{Students}}` and `{{Link}}` personalization variables.

Staff uploads to CC → creates email template → CC sends one personalized email per family.

**Why deduplication is built-in:** The portal exports data at the session level (one row per class), so a family with two kids in three classes appears six times. Our system avoids this entirely — `parent_tokens` has `UNIQUE(customer_id)` and `generateAllParentTokens()` works from the `customers` table, not from enrolments or sessions. The exported CSV will always be one row per family.

---

## Implementation Order

Time estimates are realistic single-session focused work. Total Steps 1–5: ~22–25 hrs.

### Step 1 — Foundation (~2 hrs)
1. Run migration `008` (parent_tokens + parent_requests) — 5 min
2. Run migration `009` (is_summer on sessions) — 5 min
3. Run migration `010` (alternate_email on customers) — 5 min
4. Add types to `definitions.ts` (ParentToken, ParentRequest, ParentLinkRow with alternate_email + student_courses, SummerResponseRow, SummerStats) — 45 min
5. Fix `auth.config.ts` — 20 min

### Step 2 — Public Form (~7 hrs)
6. `fetchParentFormData` in `summer-data.ts` (JOIN across 5 tables — hardest query) — 60 min
7. `generateParentToken` + `submitSummerForm` in `summer-actions.ts` — 75 min
8. `app/summer-reg/page.tsx` — 30 min
9. `app/summer-reg/submitted/page.tsx` — 20 min
10. `SummerRegForm` + `StudentCard` — 2.5 hrs
11. **Test:** insert token → visit form → submit → verify DB row — 30 min

### Step 3 — Link Management Dashboard (~5 hrs)
12. `fetchParentLinkRows` (with alternate_email + student_courses JOIN) + `generateAllParentTokens` — 90 min
13. `app/dashboard/summer/page.tsx` (links tab) — 30 min
14. `SummerLinkManagement`, `CopyLinkButton`, `PreviewLinkButton` — 60 min
15. `ExportCsvButton` (current filtered CSV: Email, Alternate Email, Students, Link) — 45 min
16. Add `Summer Reg` nav link — 10 min
17. **Test:** generate all tokens → export CSV → open in Sheets → verify 4 columns, one row per family
18. **Test:** preview selected family links while logged in → correct children + current class context appear
19. **Operational:** review blank/missing `email` and `alternate_email` before importing into Constant Contact

### Step 4 — Response Review (~5 hrs)
20. `fetchSummerStats` + `fetchSummerResponseRows` (filter + sort) — 90 min
21. `SummerStatsCards`, `SummerTabs`, `SummerResponsesSection` — 2.5 hrs
22. Add response sorting controls needed for schedule triage — 30 min
23. **Test:** submit responses → dashboard shows correct data and sorting/filtering work for staff queues

### Step 5 — Approval Flow (~5 hrs)
24. `approveSummerRequest`, `approveAllEnrolling`, `deleteSummerResponse`, `markAddedToPortal`, `markNeedsFollowup`, `clearFollowup` — 2.5 hrs
25. `ApproveModal`, `ApproveAllModal`, `RemoveButton` — 2 hrs
26. **Test full cycle:** submit → approve → enrolment on schedule → remove → enrolment gone, request kept — 30 min

### Step 6 — Email Automation (Phase 4, after core flow proven) (~4 hrs when ready)
27. Set up Resend account + domain DNS verification for zebrarobotics.com
28. `pnpm add resend @react-email/components`
29. `app/lib/email/resend.ts` + `app/lib/email/summer-form-email.tsx`
30. `sendSummerFormEmails` server action
31. `SendSummerEmailsButton` in link management dashboard

---

## Daily Implementation Schedule (April 22 → May 11)

Assumes ~3–4 hrs of focused coding per day alongside regular studio work. Adjust if bandwidth changes — the order matters more than the exact dates. Weekends are intentionally left as buffer.

---

### Apr 22 (Tue) — Foundation
**WHY:** Every subsequent step is blocked until migrations are in the DB and types are defined. Auth fix is needed for staff to preview the form.
**HOW:** Run migrations 008, 009, 010 in Supabase/psql. Update `definitions.ts` with all parent self-serve types including updated `ParentLinkRow` (add `alternate_email`, `student_courses[]`). Apply the `auth.config.ts` `/summer-reg` exemption.

---

### Apr 23 (Wed) — Public form data layer
**WHY:** `fetchParentFormData` is the most complex query in the project (JOIN: token → customer → students → enrolments → sessions + latest request per student). Getting it right before building UI prevents rework.
**HOW:** Write `fetchParentFormData` in `summer-data.ts`. Write `generateParentToken`. Test by manually inserting a row into `parent_tokens` and calling the function from a test script or a temporary route.

---

### Apr 24 (Thu) — Public form UI
**WHY:** The parent form is the externally-facing core of the entire feature. Completing it unlocks real end-to-end testing.
**HOW:** Build `SummerRegForm` + `StudentCard`. Build `app/summer-reg/page.tsx`. Build `app/summer-reg/submitted/page.tsx`. Manual test: open form in incognito with a real token — verify student cards, session checkboxes, and "No change / Pause" options render correctly.

---

### Apr 25 (Fri) — Form submission + resubmission
**WHY:** Need to prove the data round-trip works before building the staff side. Supersede logic is subtle and must be correct.
**HOW:** Implement `submitSummerForm` (validate token, validate session IDs are still `is_summer=TRUE`, supersede old row, INSERT new row). Test: submit → query `parent_requests`. Test: submit twice → first row `status='superseded'`, `is_latest=FALSE`; second row `is_latest=TRUE`.

---

### Apr 28 (Mon) — Link management data layer
**WHY:** Staff cannot export the CSV or preview family links until `fetchParentLinkRows` and `generateAllParentTokens` are working.
**HOW:** Write `fetchParentLinkRows` with full JOIN (customers → alternate_email, enrolments → sessions → courses for `student_courses[]`). Write `generateAllParentTokens` (bulk INSERT, idempotent — skip existing tokens). Manual test: call generate → query `parent_tokens` → verify row count matches active customer count.

---

### Apr 29 (Tue) — Link management UI
**WHY:** Staff need to export the CSV and preview links before anything goes out via Constant Contact. This is the last step before operational QA.
**HOW:** Build `SummerLinkManagement`, `CopyLinkButton`, `PreviewLinkButton`. Build `ExportCsvButton` with the current CSV spec (Email, Alternate Email, Students, Link). Build `app/dashboard/summer/page.tsx` with the links tab. Add `Summer Reg` to nav links.

---

### Apr 30 (Wed) — CSV export QA + operational email review
**WHY:** The CSV is the primary send mechanism. One wrong column breaks the Constant Contact import. Blank emails must be identified before the send date.
**HOW:** Generate all tokens → export CSV → open in Google Sheets → verify 6 columns, one row per family, no duplicate families. Audit the `email` column for blanks. Fill in `alternate_email` for any two-parent families identified by staff. Confirm the exported link URLs resolve correctly.

---

### May 1 (Thu) — Response review data + UI
**WHY:** Staff need the dashboard working as soon as the first responses arrive. Sorting/filtering matters for schedule triage — a flat list is unusable at volume.
**HOW:** Write `fetchSummerStats`, `fetchSummerResponseRows` (filter by status + summer_status, sort by submitted date / family / student / response type / current slot). Build `SummerStatsCards`, `SummerTabs`, `SummerResponsesSection` table. Test with manually-inserted `parent_requests` rows.

---

### May 2 (Fri) — Approval flow (actions)
**WHY:** Core business logic: auto-inherit course, insert enrolments, handle re-approval cleanly. This is the highest-stakes code in the system.
**HOW:** Implement `approveSummerRequest` (fetch request → inherit course_id from latest enrolment → `sql.begin`: INSERT enrolments, UPDATE request). Implement `approveAllEnrolling` (filter `status='pending'` AND `payload->>'summer_status'='enrolling'`). Implement response cleanup, `markAddedToPortal`, `markNeedsFollowup`, and `clearFollowup`. Test each action directly before wiring to UI.

---

### May 5 (Mon) — Approval flow (UI)
**WHY:** Staff cannot approve without modals. `ApproveAllModal` needs a count of enrolling students so staff can confirm before bulk-acting.
**HOW:** Build `ApproveModal` (start_date picker only — sessions already stored, course auto-inherited). Build `ApproveAllModal` (start_date + enrolling count). Build `RemoveButton` (inline confirm). Wire all to their server actions and `revalidateTag`.

---

### May 6 (Tue) — Full end-to-end internal test
**WHY:** Required before any real family link is emailed. Integration bugs only surface in a real flow: real token, real email, real form submit, real approval.
**HOW:** Send a real token link to an internal address (e.g., Kyle's email). Open it, fill in the form, submit. From the dashboard: review the response, approve it, check the `enrolments` table for the new row, verify the student appears on the schedule page, then remove from summer and verify the enrolment is deleted. Fix any bugs found.

---

### May 7 (Wed) — Staff walkthrough + gap review
**WHY:** Amanda and Taite need to understand the workflow before first send. Undocumented UX gaps are cheaper to fix now than after families have received emails.
**HOW:** Walk through the full workflow live: generate tokens → preview a family link → export CSV → show how to import into CC → show response dashboard → show approval flow. Note any UX confusion or missing features. Confirm any outstanding questions (response deadline date, "Other" handling, inactive sibling decision).

---

### May 8 (Thu) — Buffer / polish
**WHY:** Pad for bugs found during walkthrough or any missing edge-case UX (empty states, loading skeletons, error messages).
**HOW:** Address open items from May 7. Verify "no summer sessions yet" empty state on parent form. Confirm error handling if token is invalid. Ensure `alternate_email` is populated for all two-parent families identified earlier.

---

### May 9 (Fri) — Constant Contact import dry run
**WHY:** CC has its own CSV import UI with column-mapping steps. Confirming the format works now avoids a last-minute scramble on send day.
**HOW:** Import the exported CSV into a Constant Contact test list. Verify Email Address, Alternate Email, Students, and Link map as expected. Preview a templated email using `{{Students}}` and `{{Link}}` variables. Confirm list count matches expected active family count.

---

### May 11 (Sun) — Target: first live send
**WHY:** Gives families approximately two weeks to respond before staff need to finalize the summer schedule.
**HOW:** Staff sends the Constant Contact campaign. Monitor for email bounces. Dashboard stays open — first responses may arrive within hours.

---

| Risk | Mitigation |
|------|-----------|
| Parent resubmits after approved | Old enrolments deleted, new request pending, staff re-approves |
| Session removed between form load and submit | Server action validates session_id is still is_summer=TRUE |
| removeFromSummer with absences | Check ON DELETE CASCADE; if not set, DELETE absences first |
| Student has no September enrolment | `current_weekday` null → form shows "No current class on file" |
| Staff approves student with no existing enrolment | `approveSummerRequest` must guard: if no `course_id` found, throw user-readable error ("No existing enrolment to inherit course from — approve manually"). **OPEN: decide whether to block or allow with a course picker fallback.** |
| Logged-in staff previewing form | auth.config.ts exemption handles this |
| JSONB payload type safety | TypeScript discriminated union on request_type; Zod validation before insert |
| students.id NUMERIC FK | Use `Number(studentId)` in SQL — matches existing actions.ts pattern |

---

## Compatibility With Existing Systems

- **No change** to invoices, payments, recurring invoices, or billing
- Current response launch does not require changes to `/dashboard/schedule`, attendance, makeups, or trials.
- Future portal-derived summer schedule does require changes to `/dashboard/schedule` and portal sync; see `Summer-Schedule-Future-Week-Plan.md`.
- No automatic enrolment changes happen from parent submission alone. Staff must apply responses in portal or use the historical local approval path.

Default schedule behavior must remain unchanged until staff explicitly selects a future week.

---

## Billing Safety — Hard Constraints

These rules apply to ALL work in this repo, not just summer reg. They exist because billing data (`invoices`, `payments`, `recurring_invoices`, `converge_recurring_payments`) is anchored to `customers.id` with no soft-delete or cascade protection.

### Billing tables (never touched by summer reg or portal sync)
| Table | FK |
|-------|----|
| `invoices` | `invoices.customer_id → customers.id` |
| `payments` | `payments.customer_id → customers.id` |
| `recurring_invoices` | `recurring_invoices.customer_id → customers.id` |
| `converge_recurring_payments` | `converge_recurring_payments.customer_id → customers.id` |

### Rules
1. **Never DELETE a customer row.** Deletes orphan all four billing tables.
2. **Never merge customer rows** without a migration that re-points every billing FK in the same transaction.
3. **`syncCustomers` must keep `WHERE customer_id IS NULL`** on the students update. Overriding an existing student→customer link breaks billing aggregation for the evicted customer.
4. **Customer upsert from portal sync may only update:** `name`, `email`, `alternate_email`, `alternate_name`, `portal_parent_id`. Never touch `set_up_qbo` or any other billing column.
5. **Summer reg server actions may not reference billing tables** — only: `customers`, `students`, `parent_tokens`, `parent_requests`, `sessions`, `enrolments`, `courses`, `trials`, `makeups`, `absences`.

### Verified safe (2026-04-28 audit)
Branch `summer-responses` changes confirmed to only write:
- `customers.(name, email, alternate_email, alternate_name, portal_parent_id)` — via portal sync upsert
- `students.customer_id` where NULL only — via `syncCustomers`

No billing tables read or written by any change on this branch.

---

## Product Adjustments — April 28, 2026

These changes were confirmed after initial build review. All code-level changes noted below are already applied unless marked **[TODO]**.

### Summer form — options

**"No Change" removed.** Summer time slots are all shifting; no student can keep their existing slot. Three options remain: Enroll (pick summer times), Pause for summer, Custom/unusual request.

### Fall form — session display

**Duplicate sessions merged.** Multiple session rows with the same weekday + start_time are now grouped by weekday+start_time in the DB query (MIN id, SUM student_count). Parents see one checkbox per distinct time, not one per session row.

**Standard hourly filter applied.**
- Weekdays: show 4:00, 5:00, 6:00 PM only. Also show any non-standard times (non-hourly, or outside 4–6 PM) if there are enrolled students.
- Weekends: show all on-the-hour times except noon (12:00 PM). Show noon only if students are enrolled. Same rule for non-hourly.

**Student count / capacity badge removed.** Previously showed "X enrolled / At capacity / Available." Staff feedback: not needed on parent form. Badge removed from fall session checkboxes.

### Link management — alternate email

**Manual edit removed.** Alternate email is now read-only in the table. It is auto-populated from portal sync when the portal provides a second parent email for a family. If the portal doesn't have it, nothing shows. Staff should not need to enter it manually.

**Alternate name edit kept.** Staff can still manually correct alternate parent names via the inline edit in the Family column.

**Portal sync guardrails added.** Customer extraction now ignores alternate contacts when the alternate email is the same as the primary parent email, and ignores alternate names that are the same as the primary parent name. Existing duplicate portal rows can otherwise make the same parent appear as their own second parent.

**Bidirectional co-parent bridge guarded.** `syncCustomers` now skips the bridge when the candidate secondary parent has the same email as the existing primary customer row for the students. This prevents duplicate portal/customer rows for the same person from writing `alternate_email` / `alternate_name` back onto the same family as a fake co-parent.

**Link table duplicate display guarded.** `fetchParentLinkRows` now uses distinct student names and distinct student/course/session rows before aggregating for link management and CSV export. This keeps duplicate enrolment rows from showing repeated student/course entries in the summer link table.

**[TODO] Historical customer cleanup / audited backfill.** Do not run a blind `alternate_name` backfill yet. The DB has pre-existing duplicate customer rows, including rows with `portal_parent_id: null`, and some duplicates may share students/tokens. Claude should first run an audit query that lists:
- customers where `alternate_email` equals `email` or where `alternate_name` equals `name`
- customers with `alternate_email` matching another customer's email but no shared student relationship
- duplicate customer rows by normalized email and by normalized name
- token ownership for each duplicate group (`parent_tokens.customer_id`)

After reviewing that output, write a one-time backfill that only fills `alternate_name` when:
- `alternate_name IS NULL`
- `alternate_email` is non-null and different from `email`
- `alternate_email` matches exactly one other customer email
- the matched customer is not the same normalized name/email
- the two customer rows are connected through the same current student set or an already-established reverse `alternate_email`

Do not merge/delete duplicate customer rows until token ownership and student `customer_id` assignments are explicitly audited.

### Alternate Names + Emails — Coverage Gap [TODO — IN PROGRESS]

**Status (2026-05-06):** Portal endpoint discovered. Backfill route built and validated locally in dry run. **Apply step deferred** until full polish pass + prod migration window.

**Endpoint discovered:** `GET /node/api/family-view/family/{familyId}` where `familyId` = `customers.portal_parent_id` (same ID space as class report `parent_id`).

**Response shape (confirmed):**
```typescript
{
  results: {
    parents: Array<{
      user_id: number;
      name: string;
      email: string;
      alternate_email: string;
      primary_ind: 0 | 1;   // 1 = primary parent, 0 = secondary
      address, mobile, homephone, ...
    }>;
    students: Array<{ user_id, name, dob, gender, ... }>;
    user: Array<{ ... }>;   // requested user echoed back
  }
}
```

**Co-parent extraction logic:** Find the row in `parents[]` whose `user_id` ≠ the queried `familyId` (cast both to `Number` — the DB returns `portal_parent_id` as string). Fall back to `primary_ind === 0` if user_id match fails. Apply self-loop guards: skip when co-parent email or name normalizes equal to the primary's. Migration `015` cleaned up the same self-loop pattern from earlier broken bridge code.

**Backfill route:** `app/jobs/backfill-alt-parents/route.ts`
- Protected by `BACKFILL_ALT_PARENTS_SECRET`; pass it as `x-job-secret` or `?secret=...`.
- Default = DRY RUN. Apply with `?apply=1`.
- Optional `?limit=N` and `?customerId=<uuid>` for targeted runs.
- Batches of 10 with `Promise.all` (JWT cached, fits inside 50-min window).
- Only writes `alternate_name` / `alternate_email` when current value is `null` (`COALESCE` guarded). Never overwrites existing data.

**Dry run results (2026-05-06, full DB, 267 customers, 2.1s):**
| Outcome | Count |
|---|---|
| Would update (gain alt name) | **169** |
| Already set | 59 |
| Self-loop (correctly filtered) | 25 |
| No co-parent (single-parent families) | 14 |
| Fetch failed | 0 |

Spot-check sample (first 5):
- 6849 Bronwyn Lam → Waiman Lam (`ray.waiman.lam@gmail.com` already set as alt_email)
- 7734 Colin Kish → Cathy Cancilla
- 7736 Megan Collins → Richard Deitsch
- 8290 Michelle Yagelsky → Evgene Yagelsky
- 8539 Rebecca Green → Matthew Green

Full list saved to `backfill-alt-parents-dryrun.txt` (gitignored — review locally before apply).

**Plan to ship:**
1. ✅ Endpoint discovered + schema confirmed
2. ✅ Backfill route built with self-loop guards + dry run validated
3. ✅ Spot-check 5–10 entries against known families — names match
4. ⏳ Polish pass on remaining items (responses Details modal, schedule tab refactor, etc.)
5. ⏳ Prod migration window: run `?apply=1` once with `BACKFILL_ALT_PARENTS_SECRET` → verify row counts → delete backfill route
6. ⏳ Phase B: integrate `fetchFamilyView` into daily scrape so new families gain alt name automatically (separate work, after Phase A apply confirmed)
7. ⏳ Restore `alternate_name` to `syncCustomers` upsert + `DO UPDATE SET COALESCE(...)` clause so future portal syncs don't wipe what backfill set
8. ⏳ Add `Alternate Name` column to CSV export for CC personalization

**Temporary file (delete after apply):**
- `app/jobs/backfill-alt-parents/route.ts` — one-shot enrichment, secret-protected

**Why historical context still matters:** Portal sync currently captures `alternate_email` only. `alternate_name` was removed from sync in commit `ee0b561` because the portal's `alternate_emails` field is plain email text — no name attached. The bidirectional co-parent bridge (in `syncCustomers`) was also stripped of its `alternate_name` writes at the same time to avoid self-loops; migration `015` cleared the resulting bad rows. The `family-view` endpoint solves both problems: it returns each parent as a structured row with `name` and clear `primary_ind` so co-parent identification is unambiguous.

**Goal:** Capture BOTH alternate email AND alternate name for every two-parent family, automatically where possible, with staff manual edit as fallback. *Resolved approach below — fed by `/family-view/family/{id}` endpoint, validated against full DB in dry run on 2026-05-06.*

**Why we want both:**
- CSV export to Constant Contact ideally addresses the alternate parent by name (`{{Alternate Name}}` personalization) instead of a bare email.
- Family link previews and the staff link table already render `customer_alternate_name` — gap is in *populating* it, not displaying it.
- Manual edit alone doesn't scale: staff would have to fill it for every two-parent family.

**Where alternate names actually exist:**
1. **Bidirectional co-parent bridge** — when two separate `customers` rows share the same `student_ids[]`, each row's `name` IS the other row's alternate name. The previous bridge wrote this but was removed; need to restore it with the self-loop guards already in place (compare normalized `email` and `name` before writing).
2. **Manual staff edit** — already wired (`summer-actions.ts:138`, inline edit in Family column on link table). Keep as fallback.
3. **Portal — not available.** Confirmed: portal's `alternate_emails` field has no name component.

**Plan (no prod migration required — pure code):**
1. Restore alt-name writes in the bidirectional bridge in `syncCustomers`:
   - Secondary→primary: `SET alternate_name = COALESCE(alternate_name, ${c.name})` alongside the alt-email write, gated by the existing email-mismatch check.
   - Primary→secondary: `SET alternate_name = COALESCE(alternate_name, ${primary[0].name})` alongside the alt-email write.
2. Keep self-loop guards: do not write when normalized `email` or `name` matches the target row's own value.
3. Re-add `alternate_name` to the upsert column list and `DO UPDATE SET` clause, using `COALESCE(customers.alternate_name, EXCLUDED.alternate_name)` so portal pushes never overwrite an existing alt name (portal will always pass `null` here, but COALESCE keeps the door open if the portal ever starts returning names).
4. CSV export: add `Alternate Name` column between `Alternate Email` and `Students` so CC can use it as a personalization variable.
5. Verify in the staff link table: `customer_alternate_name` should populate for two-parent families after the next sync run.

**Validation before prod migration:**
- Run sync against staging or a local DB snapshot — confirm bridge populates `alternate_name` for known two-parent families.
- Confirm self-loop guards prevent the same bug `migration 015` cleaned up (no row with `alternate_name = name`).
- Confirm CSV export shows alt name only for true two-parent families.

**Holds back prod migration sequence:** No new migration needed. This is a code-only change. Migrations 008–017 remain queued for prod deploy after the polish pass.

---

### Session blocking

**Existing mechanism:** Staff flip `is_summer=FALSE` on a session row to remove it from the parent form immediately. No code change needed for basic blocking.

**Mark-as-full mechanism (2026-05-05):**
- Migration `017_add_is_full_to_sessions.sql` adds `sessions.is_full BOOLEAN NOT NULL DEFAULT FALSE`.
- Parent form: full sessions render grayed-out with strikethrough + "Full" badge, checkbox disabled. Applies to BOTH summer and fall blocks in `student-card.tsx`.
- Server action: `toggleSessionFull(sessionId, isFull)` in `summer-actions.ts`. Revalidates `schedule` and `summer-responses` tags.
- **Summer staff UI — DONE:** `SessionFullToggle` button on each card in `summer-schedule-tab.tsx`. Card header turns red when full.
- **Fall staff UI — DONE:** Fall Schedule subtab on `/dashboard/summer` reuses `SummerScheduleTab` and `SessionFullToggle`.

### Summer schedule tab — ✅ DONE (refactor pending)

**[TODO] Refactor summer schedule tab UI to match `/dashboard/schedule`.** Current implementation is a basic card list. Target: identical layout/styling to the regular Schedule page so staff have a consistent experience switching between summer and year-round views.



Third tab on `/dashboard/summer?tab=schedule`. Shows all sessions WHERE `is_summer=TRUE` as cards, each with enrolled student roster and course names. Sourced from real `enrolments` rows — approvals flow directly into this view.

**How staff use it:** After approving summer enrolments, open this tab to see the full per-session rosters. Replaces need to look at regular `/dashboard/schedule` during summer.

**Session visibility control:** Staff flip `is_summer=TRUE` on a session row to add it to both the parent form AND this tab. Flip `is_summer=FALSE` to remove from both. No code change needed.

**[TODO] Admin UI for session toggling:** Currently requires direct DB edit to flip `is_summer`. A future toggle UI on this tab would let staff manage session availability without DB access.

### Portal integration on approval — [TODO, Post-MVP]

When staff approves a summer enrolment, it currently only writes to the local `enrolments` table. Kyle has confirmed the intent to eventually push approved summer enrolments back to the portal system. This is deferred — no API contract defined yet.

Billing integration is also deferred. `enrolment_ids` are stored on approved `parent_requests` rows so billing can pick them up later.

---

## Responses Tab — Action Buttons (2026-05-05)

**Removed** `Needs Followup` button from the responses table. Status `needs_manual_followup` is set automatically when a parent submits `summer_status='other'` — staff don't need a manual toggle.

**Removed** the duplicate `Mark Reviewed` button from the `reviewed` row (left only on `pending` rows).

**Remove button — testing-only.** Renamed to `Remove (test)` with explicit confirm copy ("Deletes enrolments. For testing only."). Reason: approval history must be preserved in production; remove is only intended for QA / internal testing of the round-trip.

### Preserve approval history on remove — HISTORICAL PLAN, RECHECK BEFORE LAUNCH
- Migration `019_add_removed_at_to_parent_requests.sql` written — adds `parent_requests.removed_at TIMESTAMPTZ` + partial index. Idempotent.
- Current `deleteSummerResponse` code hard-deletes the row after deleting linked enrolments.
- If production audit history must be preserved, restore the `removed_at` soft-delete behavior before launch.
- All response queries already filter `is_latest = TRUE` and `removed_at IS NULL`, so soft-deleted rows would drop out of staff views automatically.
- A subsequent submission for the same (token, student) supersedes the removed row via the existing `is_latest` flip in `submitSummerForm`.

Bundle with 008–018 when the prod migration window opens.

---

## Responses Tab — Details Modal — ✅ DONE (2026-05-08)

When a parent submits with `summer_status: 'other'` (custom request) the responses-tab table currently shows the row as `Other` with most fields blank — staff can see only Student / Family / Current. They need the full submission visible to manually update the portal.

### Built
- Added `app/ui/summer/response-details-modal.tsx` — mirrors `submitted/page.tsx` layout (Summer block, Fall block, pickup, custom_notes).
- `responses-tab.tsx` Actions column now shows a `Details` button alongside `Review` / `Approve Again` and the existing Portal toggle. Renamed the `Details` reuse on completed rows to `Approve Again` so the modal-vs-approve distinction is clear.
- Reads only from existing `SummerResponseRow` — no new query.

---

## Admin-Only Access for Summer Reg — ✅ DONE (2026-05-05)

- `app/ui/dashboard/nav-links.tsx`: link has `adminOnly: true` (pre-existing).
- `app/dashboard/summer/page.tsx`: redirects non-admin to `/dashboard` via `auth()` + `user_type !== 'admin'` check (matches `incident-reports` pattern).
- `app/lib/summer-actions.ts`: every staff action calls `requireAdmin()` first — throws `Forbidden` if non-admin. Public exception: `submitSummerForm` (parent token auth, no session required).

### Why
Data exposed (parent emails, tokens that grant form access without auth, every family's schedule preferences) is sensitive enough that nav hiding is not sufficient — URL knowledge should not bypass authorization. Server actions are also independently callable, so each must enforce its own auth check.

---

## Staff-on-Behalf Submissions — CODE DONE, PROCESS TEST NEEDED

Use case: A parent calls / emails / tells staff in person what they want for summer + fall. Staff opens the family's link (via Preview Link) and submits the form on the parent's behalf.

### Real test case to validate this flow
**Lewis Thang** — pausing **now** (immediate, mid-school year, not just summer) until **September 10th**, returning to **same timeslot**.

How this maps to the current form:
- Summer: `Pause for summer` (closest match — "now" pause is effectively a summer pause from staff's perspective since summer starts soon)
- Fall: `Keep current slot — [current slot]`
- Resume date (Sept 10) — **no field for this in the current form**

### Open design questions
1. Should the form have a **resume date** field on the "Pause for summer" option? Today there's no way to capture "pause now, return on X date" — staff has to track this externally.
2. Should there be a separate **"Pause now"** option distinct from "Pause for summer", since the parent might be pausing mid-spring before summer even starts?
3. Staff-vs-parent source is now tracked with `submitted_by` and `submitted_by_name`.

### Plan
- Try the Lewis Thang submission with the current form once migrations through 022 are deployed.
- Record what info couldn't be captured cleanly.
- Decide whether to add a resume date field or rely on `custom_notes` for now.

---

## VEX Students — Flex Schedule [TODO, Post-MVP]

VEX (Vex Stunts) students have a unique scheduling situation: they can attend on **any weekday** rather than a fixed recurring slot. The current form model (pick specific sessions from a list) doesn't fit this well.

### Open design questions before implementing:
- How do we identify VEX students? By course name containing "VEX"? A DB flag?
- Should VEX students see the normal session checkboxes (pick specific days) or a special "Flex — I'll come on different days each week" option?
- Does VEX have a fixed time (e.g., always 4pm) or does time also flex?
- Should VEX responses be excluded from the normal approval/enrolment flow (since they don't map to a specific session row)?

### Proposed approach (confirm before building):
1. Detect VEX students by course name at `fetchParentFormData` time
2. On the student card, replace session checkboxes with: `○ Yes, continuing with Vex Stunts` / `○ Pause for summer` / custom notes
3. Submission stores `summer_status: 'vex_flex'` (new payload variant) → staff sees it in dashboard, handles scheduling manually
4. No enrolment auto-creation on approval — VEX attendance is tracked differently

**[TODO]** Confirm above with Amanda/Kyle before building. This needs a `definitions.ts` type change, a new form branch in `student-card.tsx`, and a new approval path (or explicit "approve manually" status).

---

## Meeting Decisions — 2026-05-07

Working from Kyle's session-handoff transcript. Goal: stable enough to send first Constant Contact email wave ASAP without blocking on perfect alt-parent-name handling.

### Form / parent-facing decisions

- **Drop parent name from greeting.** Use generic ("Hi Zebra family,"). Reason: alt-parent name data is messy + inconsistent; not worth blocking launch.
- **Show only primary email on form.** Try to surface alt email if present. No name display.
- **Notes textarea visible for ALL `summer_status` options** (currently only on `other`). Custom-schedule hint near notes: "Custom schedule? Describe it here."
- **Display exact start date per session option.** Each available session shows its own start date (e.g., "Monday, June 2 — 4 PM"). Multi-week Tuesday/Wednesday/Thursday rows show date next to / below each option. Reason: portal defaults online registrations to next matching weekday, but manual enrollments need exact date. Always confirm the date manually.
- **Saturday fall options:** restrict to 9 AM, 10 AM, 11 AM, 1 PM only. Hide 12 PM + odd times — those are exception-only.

### Portal enrollment strategy (operational, not code)

- Use existing 4:00 / 5:00 portal sessions to represent 4:15 / 5:15 internally for summer. No separate slots.
- Pause everyone for summer in portal; reactivate / re-enroll in fall as needed. Cleaner September.

### CSV / Constant Contact decisions

- **Single `student_names` field** with grammar:
  - 1 student: `"James Smith"`
  - 2 students: `"James Smith and Johnny Smith"`
  - 3+: `"James Smith, Johnny Smith, and Sarah Smith"`
- **Active students only** in CSV student list. Form already filters; export must too. Fix bug where inactive students appear in export but not form.
- **Send to both parents.** Include alt email when available — CC often hits spam, two recipients is safer.
- CSV fields: `email`, `alternate_email` (optional), `student_names`, `custom_link`, `last_exported_at` (internal tracking).
- Drop course/time info from CSV — form itself shows current details.

### UI terminology + filter flow

- **Rename "Last Emailed" → "Last Exported"** (column + UI). Dashboard isn't connected to CC, can't know real send date. CC remains source of truth.
- **Replace "Mark Sent"** + dual "Export All" / "Export Non-Responders" buttons with **filter + single Export CSV** flow.
- Filters: `Not responded`, `Not exported`, `Exported`, `Responded`. (Future: `Summer email wave`, `Fall email wave` if needed.)
- Export CSV button exports the currently filtered list. Updates `last_exported_at`.
- Use case: family added after first export → appears as `Not exported` → staff filter + export only those.

### Link / data behavior

- Persistent custom link per family. Same URL across summer + fall waves. Backend logic decides what to display per phase.
- Link Management students column: **only active students** (currently includes inactive — bug).
- Investigate duplicate / stale student records (Abby Wolsky example): trial IDs vs student IDs, stale local copies after portal rename, dedupe strategy needed.

### Implementation order (this session)

Round 1 (quick wins, no migration) — **DONE 2026-05-08**:
1. ✅ Form greeting → generic ("Hi Zebra family,") on `summer-reg/page.tsx` + `submitted/page.tsx`
2. ✅ Notes textarea always visible (any `summer_status` selected) + custom-schedule hint above it (`student-card.tsx`)
3. ✅ Saturday fall filter restricted to hours {9, 10, 11, 13} in `fetchParentFormData` (`summer-data.ts`). Sunday keeps prior weekend behavior. Weekday strict 4/5/6 PM unchanged.
4. ✅ Link Management students column → active only. Added `EXISTS (SELECT 1 FROM enrolments e WHERE e.student_id = s.id)` to the `student_names` LATERAL in `fetchParentLinkRows`. Matches form behavior (form uses INNER LATERAL on enrolments).

Round 2 (medium) — **DONE 2026-05-08**:
5. ✅ CSV `student_names` single field + grammar (`formatStudentNamesGrammar` in `export-csv-button.tsx`). CSV columns reduced to `Email, Alternate Email, Students, Link` (dropped Full Name, Alternate Name, Current Courses per meeting decision).
6. ✅ Filter UI + single Export CSV button in `link-management.tsx`. Filter dropdown: `All families / Not responded / Not exported / Exported / Responded`. Export CSV exports filtered list and calls new `markTokensExported(tokenIds)` action which bumps `last_exported_at` + `export_count` for the exported rows. Dropped dual `ExportCsvButton` ("Export All" / "Export Non-Responders") and `MarkSentButton`. Deleted `app/ui/summer/mark-sent-button.tsx` and the now-unused `markAllEmailSent` / `markNonRespondersEmailSent` actions.
7. ✅ UI rename "Last Emailed" → "Last Exported" (column header in link-management.tsx). Column still backed by `parent_tokens.email_sent_at` until Round 3 migration 018 renames concept to `last_exported_at`.

Round 3 (migration window, batched into 018) — **CODE DONE 2026-05-08, MIGRATION 018 NOT YET DEPLOYED**:
8. ✅ Migration 018 written: `parent_tokens.email_sent_at → last_exported_at`, `email_sent_count → export_count`, plus `parent_requests.added_to_portal_at TIMESTAMPTZ`. Idempotent. **Not yet run against any DB.** Code now references the new column names — local dev DB will break until 018 is applied.
9. ✅ Code switched to `last_exported_at` / `export_count`: `definitions.ts` (`ParentToken`, `ParentLinkRow`, `SummerStats.exported`), `summer-data.ts` (`fetchParentLinkRows`, `fetchSummerStats`), `summer-actions.ts` (`markTokensExported`), `link-management.tsx` (filter logic + display + "Last Exported" column), `responses-tab.tsx` (Exported stat card). Audit script `scripts/audit-duplicate-customers.mjs` also updated.
10. ✅ Dropped `MarkReviewedButton` + `markReviewed` action. Replaced with `AddedToPortalButton` + `markAddedToPortal` / `clearAddedToPortal` actions. Button toggles `parent_requests.added_to_portal_at`; UI shows date when set, click to undo. Status workflow simplified: `pending → completed` (approval still flips status). Reviewed status is no longer set anywhere; column kept for backward compatibility.
11. ✅ Per-session start date picker built without a schema change. New file `app/lib/tdsb-calendar.ts` holds summer + fall date ranges and Zebra-closed dates; `getStartDateOptions(weekday, term)` returns ISO dates of every matching weekday in the term that isn't a closed day. `student-card.tsx` shows an inline `Start: <date select>` next to each checked session, defaulting to the first valid date. Form persists `session_start_dates` + `fall_session_start_dates` (Record<sessionId, ISODate>) into `SummerSchedulingPayload`. SQL session-label aggregation in `fetchSummerResponseRows` + `fetchSubmittedChoices` appends `(start Mon DD)` when the payload has a date for that session. **Calendar dates are best-effort 2025-26 / 2026-27 TDSB approximations** — anchor dates and the closed-dates list at the top of `tdsb-calendar.ts` should be confirmed against the published TDSB calendar before launch. PA days are not currently treated as closed (Zebra normally still runs on PA days); change if needed.

Round 4 (investigation):
12. Duplicate students audit — Abby Wolsky + trial ID confusion + stale records

---

## Polish Pass — Before Touching Prod (2026-05-06)

**Stance:** Migrations 008–017 stay queued. No prod DB changes until the full code path is polished and end-to-end functional locally / on staging. Prod migration is the *last* step, not the next one.

### Code-only items remaining (no migration needed)

Ordered by impact on launch readiness:

1. ~~**Restore alternate-name capture in portal sync.**~~ ✅ DONE 2026-05-08 — `syncCustomers` upsert now lists `alternate_name` (passes NULL from portal, COALESCE-protected so existing values survive), and the bidirectional bridge writes `alternate_name` alongside `alternate_email` with self-loop guards on both email AND name. CSV export gained an `Alternate Name` column between `Alternate Email` and `Students`. No new migration needed. Future portal syncs populate alt name automatically when a co-parent row arrives whose students belong to an existing customer.
2. ~~**Responses Tab Details Modal.**~~ ✅ DONE 2026-05-08 — `response-details-modal.tsx` + Details button wired into responses tab.
3. **Refactor summer schedule tab UI** to match `/dashboard/schedule` styling. Current is a basic card list. Consistency matters once staff toggle between summer + year-round views daily.
4. ~~**Fall staff UI for `is_full` toggle**~~ ✅ DONE 2026-05-08 — added Fall Schedule subtab on `/dashboard/summer`. `fetchFallSchedule()` mirrors the summer query with `is_summer = FALSE`. `SummerScheduleTab` now takes a `term` prop ("summer" | "fall") for label copy. The existing `SessionFullToggle` works as-is.
5. ~~**Preserve approval history on remove.**~~ ✅ CODE DONE 2026-05-08 — migration 019 + revised `removeFromSummer`. Bundle with 008–018 deploy.
6. **Staff-on-behalf submissions test.** Run the Lewis Thang case through the current form once 008–017 are deployed locally. Decide whether `custom_notes` covers the resume-date gap or a dedicated field is needed.
7. **VEX flex schedule** — design confirmation with Amanda before building. Don't block the polish pass on this; ship without VEX support if needed.

### What NOT to do until prod migration is ready

- Do not run any of the queued migrations against prod.
- Do not run the `alternate_name` historical backfill (audit query first — see "Historical customer cleanup" TODO above).
- Do not enable email automation (Resend, Phase 4) — CSV → CC stays manual until everything else is solid.

### Definition of "polished and ready for prod"

- All seven items above either done or explicitly deferred with a written reason.
- Full end-to-end test (token → form → submit → approve → enrolment → schedule view) passes against a local DB seeded with realistic data.
- Lewis Thang staff-on-behalf test produces a row staff can act on.
- CSV export reviewed against a CC test list import.
- Migrations 008–018 (assuming `removed_at` lands) reviewed in order, no partial deploys.

---

## Explicitly Deferred

| Item | Why |
|------|-----|
| Fall-only campaign | Current form captures fall plans, but a later fall-only campaign needs campaign/request scoping. |
| Restart / resume inactive sibling | Phase 3 — detected automatically, same link |
| Automated email sending (Resend) | Phase 4 — use CSV → CC manually while researching |
| Course selection / switching | Course always inherited — not needed |
| Capacity hard-blocking | Staff flip is_summer=FALSE to close sessions |
| Billing automation | Manual review preferred; store enrolment_ids for later |
| Per-session capacity limits | Add when enrollment counts stabilize |
| Parent login portal | Long-term vision; token-based sufficient for now |
| Future-week schedule selector | Active plan now documented in `Summer-Schedule-Future-Week-Plan.md`. |
| Portal sync on approval | No API contract yet — deferred post-MVP |
| Session blocking admin UI | MVP: DB edit; future: toggle on dashboard |
| VEX flex schedule | Needs design confirmation — see VEX section above |

---

## Questions to Clarify Before Starting

### Must answer before Step 1 (blocks implementation)
| Question | Why it blocks |
|----------|--------------|
| Which sessions should have `is_summer=TRUE`? | Need to flip the flag in DB to test the form. Can create test sessions if no real ones exist yet. |
| What URL is the dashboard hosted at? | Needed for `NEXT_PUBLIC_APP_URL` in `.env.local` — used in CSV export link column and email links. |
| Is `customers.email` the single source of truth for one family email, or do some families need two parent recipients? | Current design sends one family link per customer. If both parents need delivery, decide whether that is operational-only in Constant Contact or needs data model support. |

### Can answer anytime before Step 6 (email)
| Question | Notes |
|----------|-------|
| Who manages DNS for zebrarobotics.com? | Need to add Resend SPF/DKIM records — can be done in parallel while building the form |
| What "from" address for outgoing emails? | e.g. `noreply@zebrarobotics.com` or `hello@zebrarobotics.com` |
| What response deadline date should emails mention? | Can hardcode as a constant initially |
| Approximately how many active customer families? | Only matters if > 3,000 (Resend free tier limit) |

### Can wait until Step 5 (approval workflow)
| Question | Notes |
|----------|-------|
| What start date should summer enrolments use? | Date picker per approval, or a configurable global constant |
| Does the absences table have ON DELETE CASCADE on enrolment_id? | Affects removeFromSummer — quick DB check at implementation time |

### Questions for Amanda
| Question | Notes |
|----------|-------|
| Should inactive siblings appear on the same family form? | Phase 3 plan: yes, with a "Restart [name]" section auto-detected. Confirm this is the right UX. |
| What is the response deadline date parents should target? | For email copy and any in-form messaging |
| Are you comfortable with `/dashboard/summer` as the primary staff home for this feature? | vs. adding it to the billing customer page |
| Resend vs CC for email sending: who manages zebrarobotics.com DNS? | Required to verify the sending domain |
| Online students — Jasmine Hue, Stephen K | Currently appear on the parent form like in-person students. Likely handled out-of-band via email instead of the form. Decide: hide from form entirely, mark as "online" with a different option set, or keep as-is and handle in approval. |
| Saturday fall slots — standardize or keep as-is? | Saturday has half-classes which makes it more unique than weekdays. Weekdays are now strict 4/5/6 PM on the hour. For weekends, current logic still shows enrolled non-hourly + all hourly except noon. Should weekends also standardize, or leave flexible? |

---

### Questions for Taite
| Question | Notes |
|----------|-------|
| Are Customer id's unique to active parents?|  |
|staff flip `is_summer=FALSE` to close a session later phase we could have auto calculation on Coach Capacity |  |
| Is there a documented Zebra Portal endpoint to fetch alternate parent names? | We discovered `GET /node/api/family-view/family/{familyId}` returning `{results: {parents[]}}` with name + email + primary_ind. Used it for 2026-05-07 Phase A backfill (169 rows filled, 10 self-duplicates cleared). Want to confirm this is the expected source or if she knows a cleaner one before integrating into daily sync. |
| Why does the Class Report `alternate_emails` field never include alternate parent **name**? | Portal scraping currently returns email-only for the second parent. Asking whether this is intentional, a missing field, or available via another report. |
| Are there families where the Primary Parent in portal does NOT match the legal/billing contact for the customer? | Affects whether `customers.name` (set by portal sync from primary parent) is always correct, or if some need staff override. |
| Where do "X & Y" combined parent names in `customers.name` come from — portal class report, family-view, or parent self-entry on portal? | Audit found 28 customers with combined names like "Maia Becker & Stephan MacDonald" in the PRIMARY name slot. Need to know source to choose fix path: clean in portal (preferred) vs override in sync code. |

---

## Verification / Testing

1. **Public form — no login**: Open `/summer-reg?token=<valid>` in incognito → loads with student names and live summer sessions
2. **Logged-in staff can preview**: Log in → visit same URL → form loads (not redirected to dashboard)
3. **Live sessions**: Flip `is_summer=FALSE` on a session in DB → refresh form → session gone
4. **Submission stores data**: Submit → query `parent_requests` → verify `is_latest=TRUE`, correct payload
5. **Resubmission**: Submit twice → first row `status='superseded'`, `is_latest=FALSE`; second row `is_latest=TRUE`
6. **Confirmation page**: Shows student name + selected session labels + September messaging
7. **Form pre-fill on revisit**: Visit link after submitting → form pre-filled with last response
8. **Link management**: Generate all tokens → export CSV → verify URL format + all columns present
9. **Family link preview**: From the dashboard, open a generated family link while logged in → verify the correct children and current class context appear
10. **Approval creates enrolment**: Approve → check `enrolments` table → verify student on schedule page
11. **Remove from summer**: Remove → enrolments deleted, `parent_requests` row still exists with payload intact
12. **Approve All**: N enrolling responses → Approve All → N students' enrolments created, all marked `completed`
13. **"Other" request**: Select "Other" + type note → `status='needs_manual_followup'`, `custom_notes` populated
14. **Response sorting**: Sort the dashboard by response type / current slot / submitted date → verify queue order matches staff expectations for applying the summer schedule
