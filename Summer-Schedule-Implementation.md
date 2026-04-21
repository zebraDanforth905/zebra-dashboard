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

Parents receive a tokenized per-family link (`/summer-reg?token=abc123`). They open it, see each of their active students, pick the summer evening sessions they want to enroll in(if any)(multiple allowed), and submit. Staff review responses in `/dashboard/summer` and approve → enrolments are created automatically with course auto-inherited.

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

// fetchSummerResponseRows(filter) → SummerResponseRow[]
// cacheTag('summer-responses')
// filter: 'all' | 'pending' | 'enrolling' | 'pausing' | 'needs_followup' | 'approved'

// fetchParentLinkRows() → ParentLinkRow[]
// cacheTag('summer-tokens', 'summer-responses')

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
- **`SummerResponsesSection`** — table: Student, Parent, Choice, Sessions, Sept Slot, Submitted, Actions
- **`ApproveModal`** — start_date only (sessions already stored; course auto-inherited). No session or course picker.
- **`ApproveAllModal`** — start_date only, bulk. Shows count of enrolling students.
- **`RemoveButton`** — inline confirm before `removeFromSummer`
- **`SummerLinkManagement`** — Generate All Tokens, Export CSV, Copy individual links
- **`CopyLinkButton`** — `navigator.clipboard.writeText(origin + '/summer-reg?token=' + token)`
- **`ExportCsvButton`** — client-side CSV, **one row per family** (deduplicated at customer level)

**CSV column names match Constant Contact variable names:**
```
Full Name, Email Address, Students, Link
```
Example row:
```
"John Smith","john@example.com","Emma, Liam","https://dashboard.zebrarobotics.com/summer-reg?token=abc123"
```
Staff uploads to CC → creates email template with `{{Full Name}}`, `{{Students}}`, `{{Link}}` variables → CC sends one personalized email per family.

**Why deduplication is built-in:** The portal exports data at the session level (one row per class), so a family with two kids in three classes appears six times. Our system avoids this entirely — `parent_tokens` has `UNIQUE(customer_id)` and `generateAllParentTokens()` works from the `customers` table, not from enrolments or sessions. The exported CSV will always be one row per family.

---

## Implementation Order

### Step 1 — Foundation
1. Run migration `008` (parent_tokens + parent_requests)
2. Run migration `009` (is_summer on sessions)
3. Add types to `definitions.ts`
4. Fix `auth.config.ts`

### Step 2 — Public Form
5. `fetchParentFormData` in `summer-data.ts`
6. `generateParentToken` + `submitSummerForm` in `summer-actions.ts`
7. `app/summer-reg/page.tsx`
8. `app/summer-reg/submitted/page.tsx`
9. `SummerRegForm` + `StudentCard`
10. **Test:** insert token → visit form → submit → verify DB row

### Step 3 — Link Management Dashboard
11. `fetchParentLinkRows` + `generateAllParentTokens`
12. `app/dashboard/summer/page.tsx` (links tab)
13. `SummerLinkManagement`, `CopyLinkButton`, `ExportCsvButton`
14. Add `Summer Reg` nav link
15. **Test:** generate all tokens → export CSV → verify URL format

### Step 4 — Response Review
16. `fetchSummerStats` + `fetchSummerResponseRows`
17. `SummerStatsCards`, `SummerTabs`, `SummerResponsesSection`
18. **Test:** submit responses → dashboard shows correct data

### Step 5 — Approval Flow
19. `approveSummerRequest`, `approveAllEnrolling`, `removeFromSummer`, `markReviewed`
20. `ApproveModal`, `ApproveAllModal`, `RemoveButton`
21. **Test full cycle:** submit → approve → enrolment on schedule → remove → enrolment gone, request kept

### Step 6 — Email Automation (Phase 4, after core flow proven)
22. Set up Resend account + domain DNS verification for zebrarobotics.com
23. `pnpm add resend @react-email/components`
24. `app/lib/email/resend.ts` + `app/lib/email/summer-form-email.tsx`
25. `sendSummerFormEmails` server action
26. `SendSummerEmailsButton` in link management dashboard

---

## Edge Cases

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
9. **Approval creates enrolment**: Approve → check `enrolments` table → verify student on schedule page
10. **Remove from summer**: Remove → enrolments deleted, `parent_requests` row still exists with payload intact
11. **Approve All**: N enrolling responses → Approve All → N students' enrolments created, all marked `completed`
12. **"Other" request**: Select "Other" + type note → `status='needs_manual_followup'`, `custom_notes` populated
