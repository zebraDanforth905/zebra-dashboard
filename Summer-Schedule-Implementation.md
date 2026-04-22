# Summer Schedule Implementation

## Purpose

This document is the authoritative implementation reference for the parent-facing summer scheduling system in the Zebra Dashboard.

Built for:
- Next.js 15 App Router
- Direct PostgreSQL via `postgres` npm package (no ORM)
- Auth via `next-auth` v5 (`auth()` server-side, JWT callbacks)
- Staff pages under `/dashboard`
- Public parent form outside `/dashboard` at `/summer-reg`

---

## Executive Summary

Parents receive a tokenized per-family link (`/summer-reg?token=abc123`). They open it, see each of their active students, see each child's current class context, pick the summer evening sessions they want to enroll in(if any)(multiple allowed), and submit. Staff review responses in `/dashboard/summer`, sort/filter them into action queues, and approve → enrolments are created automatically with course auto-inherited.

**Key framing:** This is an **enrolment form**, not a preference form. Parents choose actual sessions. Course is always inherited from existing enrolments — no course-picker UI anywhere.

---

## Confirmed Product Decisions

| Decision | Answer |
|----------|--------|
| Enrollment or preference form? | Enrollment — parents pick actual sessions |
| Multiple sessions per student? | Yes — Mon 4:15 AND Sat 10:00 each become a real enrolment |
| "No change" option? | Yes — `summer_status: 'no_change'` with empty `session_ids[]`; staff can bulk-complete these without touching enrolments |
| Course selection? | Neither form nor approval — auto-inherited from student's existing enrolment |
| Token expiry? | No hard expiry — staff control by flipping `is_summer=FALSE` on sessions |
| Form stays live how long? | Until staff flip all summer sessions to `is_summer=FALSE` |
| Resubmission? | Yes — old row `superseded`, new `is_latest=TRUE` row created |
| September scheduling? | Separate future flow — not in this form |
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
Parent sees each student's current September slot (context only)
For each student (actual enrollment):
  ├── Check off session(s) they want  [Mon 4:15] [Tue 4:15] [Sat 10:00] etc.
  ├── Pause for summer → one click
  └── Custom / unusual request → blank text box with examples
Parent submits → parent_requests row(s) created (is_latest=TRUE)
                                              ↓
Staff dashboard /dashboard/summer
├── See all submissions (filtered by status)
├── Approve individually → course auto-inherited → enrolment(s) created
├── Approve All Enrolling (bulk)
└── Remove from Summer (delete enrolments, keep request record)
```

---

## Operational Requirements (Non-Code)

These items are part of the real launch plan and should be tracked alongside the coding work.

- **Family email source of truth:** The current system assumes one deliverable family email in `customers.email`. Before send, staff must audit missing/blank emails and decide how to handle families where both parents want the link.
- **One link per family:** `parent_tokens` enforces one token per `customer_id`, and the CSV/export flow must stay deduplicated at the customer level even when multiple students or enrolments exist.
- **Family link QA before send:** Staff must be able to preview any generated family link while logged in so they can verify the correct children and current class context appear before emailing that family.
- **Internal end-to-end test:** Before the first campaign send, staff should send at least one real token to an internal address, open the email, submit the form, and run the approval flow through to enrolment creation.
- **Response triage for schedule building:** Staff need both filters and sorting on the response dashboard so they can work queues such as `enrolling`, `no_change`, `pausing`, `needs_followup`, and requested session/time.
- **Email send tracking:** If links are sent manually through Constant Contact, `email_sent_at` / `email_sent_count` will not update automatically unless we add a manual "mark as sent" action. The dashboard should not show an "Emailed" count as authoritative until that is handled.

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
// no_change: session_ids is always [] — student continues in their existing slot, no enrolment action needed

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
| `reviewed` | Staff has seen it | Staff |
| `completed` | Enrolment(s) created | System on approval |
| `needs_manual_followup` | Custom request, requires human | System on "Other" submit |

**Re-submission:** Old row → `is_latest=FALSE, status='superseded'`. If approved enrolment exists → DELETE it first. New row → `is_latest=TRUE, status='pending'`.

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
// Aggregate into student_courses[] on the customer row so ExportCsvButton can render the
// "Current Courses" CSV column without a second query.
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
//   email_sent_at: Date | null;
//   email_sent_count: number;
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
// markReviewed(formData)
// markNeedsFollowup(formData)
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

○ No change — keep my current schedule through summer
○ Enroll in different/additional summer sessions:
    Mon / Fri:         [ ] 4:15 PM
    Tue / Wed / Thu:   [ ] 4:15 PM   [ ] 5:15 PM
    Saturday:          [ ] 9:00 AM   [ ] 10:00 AM   [ ] 11:00 AM   [ ] 12:00 PM   [ ] 1:00 PM
○ Pause for summer
○ Custom / unusual request: [___________________________]
  e.g. "Only June evenings, then pause in July and resume mid-August"
```

**"No change" behavior:** stores `summer_status: 'no_change'`, `session_ids: []`. Staff can bulk-complete these with a "Mark all No-Change as Reviewed" action — no enrolment insert needed.

Sessions are grouped by weekday from live DB rows (`is_summer=TRUE`). No hardcoded slot config.

**Form header messaging:**
> Choose your child's summer evening class schedule below.
> This is for your ongoing summer schedule — not for one-time date changes.
> You can select multiple time slots if your child will attend more than one session per week.
>
> We'll assume your child returns to the same class time in September unless you tell us otherwise.

---

## Staff Dashboard Components

- **`SummerStatsCards`** — Total Families, Responded, Enrolling, Pausing, Pending, Needs Follow-up, Emailed
- **`SummerTabs`** — `?tab=responses` / `?tab=links`
- **`SummerResponsesSection`** — table: Student, Parent, Choice, Sessions, Sept Slot, Submitted, Actions; sortable by submitted date, family, student, response type, and current slot
- **`ApproveModal`** — start_date only (sessions already stored; course auto-inherited). No session or course picker.
- **`ApproveAllModal`** — start_date only, bulk. Shows count of enrolling students.
- **`RemoveButton`** — inline confirm before `removeFromSummer`
- **`SummerLinkManagement`** — Generate All Tokens, Export CSV, Copy individual links, Preview link, and flag rows missing a usable email
- **`CopyLinkButton`** — `navigator.clipboard.writeText(origin + '/summer-reg?token=' + token)`
- **`PreviewLinkButton`** — opens `/summer-reg?token=...` in a new tab so staff can QA a family's form before send
- **`ExportCsvButton`** — client-side CSV, **one row per family** (deduplicated at customer level)

**CSV columns — first four are Constant Contact template variables; last two are staff QA reference only (CC ignores extra columns):**
```
Full Name, Email Address, Alternate Email, Students, Current Courses, Link
```
Example row:
```
"John Smith","john@example.com","jane@example.com","Emma, Liam","Emma — Robotics Wed 5:15 PM; Liam — Robotics Sat 10:00 AM","https://dashboard.zebrarobotics.com/summer-reg?token=abc123"
```
- **Alternate Email** — pulled from `customers.alternate_email`; empty string `""` if null (CC handles blank gracefully).
- **Current Courses** — staff-only reference so they can QA that each child's class context is correct before send. Populated from the `student_courses[]` JOIN in `fetchParentLinkRows`. Format: `"[Student] — [Course] [Weekday] [Time]"`, multiple students separated by `"; "`.
- CC template uses `{{Full Name}}`, `{{Students}}`, `{{Link}}` as personalization variables. `{{Alternate Email}}` can optionally be wired to CC's built-in "also email" feature.

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
15. `ExportCsvButton` (6-column CSV: Full Name, Email Address, Alternate Email, Students, Current Courses, Link) — 45 min
16. Add `Summer Reg` nav link — 10 min
17. **Test:** generate all tokens → export CSV → open in Sheets → verify 6 columns, one row per family
18. **Test:** preview selected family links while logged in → correct children + current class context appear
19. **Operational:** review blank/missing `email` and `alternate_email` before importing into Constant Contact

### Step 4 — Response Review (~5 hrs)
20. `fetchSummerStats` + `fetchSummerResponseRows` (filter + sort) — 90 min
21. `SummerStatsCards`, `SummerTabs`, `SummerResponsesSection` — 2.5 hrs
22. Add response sorting controls needed for schedule triage — 30 min
23. **Test:** submit responses → dashboard shows correct data and sorting/filtering work for staff queues

### Step 5 — Approval Flow (~5 hrs)
24. `approveSummerRequest`, `approveAllEnrolling`, `removeFromSummer`, `markReviewed`, `markNeedsFollowup` — 2.5 hrs
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
**HOW:** Build `SummerLinkManagement`, `CopyLinkButton`, `PreviewLinkButton`. Build `ExportCsvButton` with the 6-column CSV spec (Full Name, Email Address, Alternate Email, Students, Current Courses, Link). Build `app/dashboard/summer/page.tsx` with the links tab. Add `Summer Reg` to nav links.

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
**HOW:** Implement `approveSummerRequest` (fetch request → inherit course_id from latest enrolment → `sql.begin`: INSERT enrolments, UPDATE request). Implement `approveAllEnrolling` (filter `status='pending'` AND `payload->>'summer_status'='enrolling'`). Implement `removeFromSummer`, `markReviewed`, `markNeedsFollowup`. Write Zod schemas. Test each action directly before wiring to UI.

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
**HOW:** Import the exported CSV into a Constant Contact test list. Verify Full Name, Email Address, Alternate Email map as expected. Preview a templated email using `{{Full Name}}`, `{{Students}}`, `{{Link}}` variables. Confirm list count matches expected active family count.

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
- **No change** to `/dashboard/schedule`, attendance, makeups, or trials
- **No change** to portal sync / `insert_from_portal.ts` — summer data is in separate tables
- **No automatic enrolment changes** — staff approve individually or in bulk

The only change to existing behavior is the `auth.config.ts` fix to allow `/summer-reg` for logged-in users.

---

## Explicitly Deferred

| Item | Why |
|------|-----|
| September scheduling / fall slots | Separate future flow on same token infrastructure |
| Restart / resume inactive sibling | Phase 3 — detected automatically, same link |
| Automated email sending (Resend) | Phase 4 — use CSV → CC manually while researching |
| Course selection / switching | Course always inherited — not needed |
| Capacity hard-blocking | Staff flip is_summer=FALSE to close sessions |
| Billing automation | Manual review preferred; store enrolment_ids for later |
| Per-session capacity limits | Add when enrollment counts stabilize |
| Parent login portal | Long-term vision; token-based sufficient for now |

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

---

### Questions for Taite
| Question | Notes |
|----------|-------|
| Are Customer id's unique to active parents?|  |
|staff flip `is_summer=FALSE` to close a session later phase we could have auto calculation on Coach Capacity |  |

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
