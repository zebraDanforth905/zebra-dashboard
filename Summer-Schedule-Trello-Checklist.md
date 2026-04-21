# Summer Schedule — Trello Checklist

**Due: May 11, 2026**
**Authoritative design reference:** `Summer-Schedule-Implementation.md`

---

## Phase Overview

| Phase | Scope | Target |
|-------|-------|--------|
| **MVP** | Foundation + Public Form + Link Management + Response Review + Approval Flow | May 11 |
| **Phase 3** | Restart / inactive sibling detection on same family link | Post-launch |
| **Phase 4** | Automated email sending via Resend | Post-launch |

---

## MVP — Step 1: Foundation

**Goal:** Schema and auth are in place. The app can store family tokens and parent requests, and staff can preview the public form without being redirected.

**Done when:**
- `008_create_parent_request_tables.sql` applied — `parent_tokens` and `parent_requests` tables exist
- `009_add_summer_flag_to_sessions.sql` applied — `is_summer` column exists on `sessions`
- TypeScript types for `ParentToken`, `ParentRequest`, `SummerSchedulingPayload` added to `definitions.ts`
- `auth.config.ts` updated — `/summer-reg` is exempt from the logged-in redirect
- At least one session has `is_summer=TRUE` in DB (real or test) so the form can be tested

**Checklist:**
- [ ] Write and apply migration `008_create_parent_request_tables.sql`
- [ ] Write and apply migration `009_add_summer_flag_to_sessions.sql`
- [ ] Add parent self-serve types to `app/lib/definitions.ts`
- [ ] Fix `auth.config.ts` to exempt `/summer-reg`
- [ ] Flip `is_summer=TRUE` on at least one session for testing
- [ ] Confirm dashboard URL for `NEXT_PUBLIC_APP_URL` in `.env.local`

---

## MVP — Step 2: Public Parent Form

**Goal:** A parent with a valid token link can open the form, see their children's current session, choose No Change / Enroll / Pause / Custom for each student, and submit. A confirmation page is shown. Re-visiting the link pre-fills with their last response.

**Done when:**
- `/summer-reg?token=abc123` loads in incognito with correct student names and live session options
- Submitting creates a `parent_requests` row with correct `is_latest=TRUE` and `payload`
- Re-submitting marks the old row `superseded` and creates a new `is_latest=TRUE` row
- `/summer-reg/submitted` shows the student names and selected sessions
- Logged-in staff can visit the form without being redirected

**Checklist:**
- [ ] `fetchParentFormData(token)` in `summer-data.ts` — joins token → customer → students → active enrolments → sessions WHERE `is_summer=TRUE`
- [ ] `generateParentToken(customerId)` in `summer-actions.ts` (idempotent)
- [ ] `submitSummerForm(prevState, formData)` in `summer-actions.ts` — validates token, validates session IDs still `is_summer=TRUE`, supersedes old row, inserts new row
- [ ] `app/summer-reg/page.tsx` — server page, calls `fetchParentFormData`, passes to form
- [ ] `app/summer-reg/submitted/page.tsx` — confirmation page showing submitted choices
- [ ] `SummerRegForm` client component — radio group per student (No Change / Enroll / Pause / Custom), session checkboxes grouped by weekday, resubmission banner when pre-filled
- [ ] `StudentCard` client component — per-student section showing current September slot
- [ ] Test: insert token manually → visit form → submit each option type → verify DB row payload
- [ ] Test: submit twice → verify `superseded` + `is_latest` flags
- [ ] Test: no `is_summer=TRUE` sessions → form shows "Summer times coming soon — check back shortly"
- [ ] Test: student with no existing enrolment → card shows "No current class on file"

---

## MVP — Step 3: Link Management Dashboard

**Goal:** Staff can generate a unique link for every active family in one click, copy individual links, and export a Constant Contact-ready CSV (one row per family: Full Name, Email Address, Students, Link).

**Done when:**
- "Generate All Tokens" creates tokens for all customers with at least one active enrolment (idempotent — safe to re-run)
- Exported CSV has exactly one row per family regardless of how many students or sessions they have
- Each link in the CSV resolves to the correct family's form in a browser

**Checklist:**
- [ ] `generateAllParentTokens()` in `summer-actions.ts` — bulk upsert scoped to customers with active enrolments
- [ ] `fetchParentLinkRows()` in `summer-data.ts` — customer name, email, student list, token, `email_sent_at`
- [ ] `app/dashboard/summer/page.tsx` (initial version, links tab only)
- [ ] `SummerLinkManagement` server component — table of families + links
- [ ] `CopyLinkButton` client component — copies `${origin}/summer-reg?token=${token}` to clipboard
- [ ] `ExportCsvButton` client component — client-side CSV download, columns: `Full Name, Email Address, Students, Link`
- [ ] Add `Summer Reg` nav link in `app/ui/dashboard/nav-links.tsx` (admin only)
- [ ] Test: generate all tokens → verify count matches active families
- [ ] Test: export CSV → open in spreadsheet → confirm one row per family, correct columns, valid URLs
- [ ] Test: copy link → paste in incognito → correct family's form loads

---

## MVP — Step 4: Response Review Dashboard

**Goal:** Staff can see a live summary of how many families have responded and what they chose, and can filter the response list by status.

**Done when:**
- Stats cards show accurate counts: Total Families, Responded, Enrolling, Pausing, No Change, Needs Follow-up, Pending (not yet responded)
- Response table shows each student's name, parent name, their choice, selected sessions, their September slot, and submission time
- Filtering by status works correctly
- Submitting a new parent response immediately updates the dashboard (cache invalidation working)

**Checklist:**
- [ ] `fetchSummerStats()` in `summer-data.ts` — cacheTag `summer-responses`
- [ ] `fetchSummerResponseRows(filter)` in `summer-data.ts` — filter: `all | pending | enrolling | pausing | no_change | needs_followup | completed` — cacheTag `summer-responses`
- [ ] `SummerStatsCards` server component — Total Families, Responded, Enrolling, Pausing, No Change, Pending, Needs Follow-up
- [ ] `SummerTabs` client component — `?tab=responses` / `?tab=links`
- [ ] `SummerResponsesSection` server component — table: Student, Parent, Choice, Sessions, Sept Slot, Submitted, Actions
- [ ] Wire `revalidateTag('summer-responses')` in `submitSummerForm` action
- [ ] Test: submit a response → dashboard stats update correctly
- [ ] Test: each filter tab shows only the correct rows

---

## MVP — Step 5: Approval Flow

**Goal:** Staff can approve individual enrolling requests (creates real enrolments with auto-inherited course), bulk-approve all pending enrolling requests, remove a student from summer (deletes enrolments, keeps request record), and mark requests as reviewed or needing follow-up.

**Done when:**
- Approving a request creates one enrolment per selected session in the `enrolments` table with the correct inherited `course_id`
- Approved student appears on the schedule page
- Removing a student deletes those enrolments but leaves the `parent_requests` row intact with payload
- "Approve All Enrolling" only operates on `status='pending'` rows — does not double-create for already-completed requests
- Approval fails gracefully with a user-readable error if no existing enrolment exists to inherit a course from

**Checklist:**
- [ ] `approveSummerRequest(formData)` — validates course inheritance, `sql.begin` insert enrolments, update request to `completed`
- [ ] `approveAllEnrolling(formData)` — filters `status='pending' AND payload->>'summer_status'='enrolling'`, same insert logic
- [ ] `removeFromSummer(formData)` — deletes all `enrolment_ids`, resets request to `pending` (check absences `ON DELETE CASCADE` first)
- [ ] `markReviewed(formData)` and `markNeedsFollowup(formData)`
- [ ] `ApproveModal` client component — start_date picker only (no session or course picker)
- [ ] `ApproveAllModal` client component — start_date picker + count of enrolling students
- [ ] `RemoveButton` with inline confirmation
- [ ] Test full cycle: submit → approve → verify enrolment in DB and on schedule page
- [ ] Test: approve → remove → enrolment gone, `parent_requests` row still exists
- [ ] Test: approve all → verify N enrolments created, all requests marked `completed`
- [ ] Test: approve a student with no existing enrolment → error shown, no DB change
- [ ] Test: resubmit after approved → old enrolments deleted, new request pending, staff re-approves

---

## MVP — Launch Checklist

**Goal:** System is verified end-to-end with real data and staff are ready to send links.

- [ ] All 5 MVP steps pass their tests on production DB
- [ ] Real summer sessions have `is_summer=TRUE` flipped
- [ ] All active family tokens generated
- [ ] CSV exported and spot-checked (names, emails, links valid)
- [ ] Staff dry-run: generate → export → import to Constant Contact → send test email to internal address
- [ ] Parent form tested on mobile (iOS Safari + Android Chrome)
- [ ] Confirmation page shows correct student names and selected sessions
- [ ] Resubmission flow tested with a real family account
- [ ] First wave of links ready to send via Constant Contact

---

## Phase 3 — Restart / Inactive Sibling (Post-launch)

**Goal:** A family with an inactive sibling sees an additional "Restart [name]" card section on the same form link, auto-detected — no new link or token needed.

**Done when:**
- Family form detects students with no active enrolment and shows a "Restart" section
- Restart submission creates a `parent_requests` row with `request_type='restart'`
- Staff see restart requests in the dashboard alongside summer scheduling requests
- Course auto-inherited from student's last known enrolment

**Checklist:**
- [ ] Confirm UX with Amanda — restart card on same form is the right experience
- [ ] Update `fetchParentFormData` to also return inactive students with a last-known course
- [ ] Add restart section to `StudentCard` / `SummerRegForm`
- [ ] `submitSummerForm` handles `request_type='restart'` payload
- [ ] Dashboard response table shows restart requests with distinct label
- [ ] Approval creates enrolment using last known course

---

## Phase 4 — Automated Email Sending via Resend (Post-launch)

**Goal:** Staff can send personalized form links directly from the dashboard without exporting to Constant Contact.

**Done when:**
- Clicking "Send Emails" fires one transactional email per family via Resend
- Email contains the family's `{{Full Name}}`, `{{Students}}` list, and their unique `{{Link}}`
- `email_sent_at` and `email_sent_count` update on `parent_tokens` after send
- Stats card shows "Emailed" count

**Pre-requisites to resolve before starting:**
- [ ] Who manages DNS for zebrarobotics.com? (Resend requires SPF/DKIM records)
- [ ] Confirm sending address (e.g. `noreply@zebrarobotics.com`)
- [ ] Confirm response deadline date for email copy
- [ ] Confirm active family count — if > 3,000, upgrade Resend plan before sending

**Checklist:**
- [ ] Set up Resend account + verify zebrarobotics.com domain
- [ ] `pnpm add resend @react-email/components`
- [ ] `app/lib/email/resend.ts` — Resend client singleton
- [ ] `app/lib/email/summer-form-email.tsx` — React Email template with family name, student list, link, deadline
- [ ] `sendSummerFormEmails(customerIds?)` server action — bulk or targeted send, updates `email_sent_at`
- [ ] `SendSummerEmailsButton` client component in link management dashboard
- [ ] Test: send to internal test address → verify email renders correctly on mobile
- [ ] Test: `email_sent_at` and `email_sent_count` update after send
- [ ] Test: bulk send to all un-emailed families → no duplicate sends
