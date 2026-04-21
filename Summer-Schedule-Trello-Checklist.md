# Summer Schedule — Trello Checklist

**Final deadline: May 11, 2026**
**Authoritative design reference:** `Summer-Schedule-Implementation.md`

---

## Phase Overview

| Phase | Scope | Target |
|-------|-------|--------|
| **MVP** | Foundation + Public Form + Link Management + Response Review + Approval Flow | May 2 |
| **Operational** | Data pull, CC campaign, internal test, first send, monitor + approve | May 11 |
| **Phase 3** | Restart / inactive sibling detection on same family link | Post-launch |
| **Phase 4** | Automated email sending via Resend | Post-launch |

---

## MVP — Step 1: Foundation
**Target: April 22 ✅**

**Goal:** Schema and auth are in place. The app can store family tokens and parent requests, and staff can preview the public form without being redirected.

**Done when:**
- `008_create_parent_request_tables.sql` applied — `parent_tokens` and `parent_requests` tables exist
- `009_add_summer_flag_to_sessions.sql` applied — `is_summer` column exists on `sessions`
- TypeScript types for `ParentToken`, `ParentRequest`, `SummerSchedulingPayload` added to `definitions.ts`
- `auth.config.ts` updated — `/summer-reg` is exempt from the logged-in redirect
- At least one session has `is_summer=TRUE` in DB (real or test) so the form can be tested

**Checklist:**
- [x] Write migration `008_create_parent_request_tables.sql`
- [x] Write migration `009_add_summer_flag_to_sessions.sql`
- [x] Add parent self-serve types to `app/lib/definitions.ts`
- [x] Fix `auth.config.ts` to exempt `/summer-reg`
- [ ] Apply both migrations to production DB
- [ ] Flip `is_summer=TRUE` on at least one session for testing (real or test row)
- [ ] Confirm dashboard URL → set `NEXT_PUBLIC_APP_URL` in `.env.local`

---

## MVP — Step 2: Public Parent Form
**Target: April 25**

**Goal:** A parent with a valid token link can open the form, see their children's current session info, choose their summer intent for each student, and submit. A confirmation page is shown. Re-visiting the link pre-fills with their last response.

**Done when:**
- `/summer-reg?token=abc123` loads in incognito with correct student names and live session options
- Submitting creates a `parent_requests` row with correct `is_latest=TRUE` and `payload`
- Re-submitting marks the old row `superseded` and creates a new `is_latest=TRUE` row
- `/summer-reg/submitted` shows the student names and submitted choices
- Logged-in staff can visit the form without being redirected

**Checklist:**
- [ ] `fetchParentFormData(token)` in `summer-data.ts` — joins token → customer → students → active enrolments → sessions WHERE `is_summer=TRUE`
- [ ] `generateParentToken(customerId)` in `summer-actions.ts` (idempotent)
- [ ] `submitSummerForm(prevState, formData)` in `summer-actions.ts` — validates token, validates session IDs still `is_summer=TRUE`, supersedes old row, inserts new row
- [ ] `app/summer-reg/page.tsx` — server page, calls `fetchParentFormData`, passes to form
- [ ] `app/summer-reg/submitted/page.tsx` — confirmation page showing submitted choices
- [ ] `SummerRegForm` client component — radio group per student (Enroll in summer sessions / No change — returning September / Stopping / Custom), session checkboxes grouped by weekday, resubmission banner when pre-filled
- [ ] `StudentCard` client component — per-student section showing current slot (day + time)
- [ ] Test: insert token manually → visit form → submit each option type → verify DB row payload
- [ ] Test: submit twice → verify `superseded` + `is_latest` flags
- [ ] Test: no `is_summer=TRUE` sessions → form shows "Summer times coming soon — check back shortly"
- [ ] Test: student with no existing enrolment → card shows "No current class on file"

---

## MVP — Step 3: Link Management Dashboard
**Target: April 27**

**Goal:** Staff can generate a unique link for every active family in one click, copy individual links, and export a Constant Contact-ready CSV (one row per family: Full Name, Email Address, Students, Link).

**Done when:**
- "Generate All Tokens" creates tokens for all customers with at least one active enrolment (idempotent — safe to re-run)
- Exported CSV has exactly one row per family regardless of how many students or sessions they have
- Each link in the CSV resolves to the correct family's form in a browser
- Staff can preview any single family's link from the dashboard before send
- Families with blank/missing emails are visible before export/send

**Checklist:**
- [ ] `generateAllParentTokens()` in `summer-actions.ts` — bulk upsert scoped to customers with active enrolments
- [ ] `fetchParentLinkRows()` in `summer-data.ts` — customer name, email, student list, token, `email_sent_at`
- [ ] `app/dashboard/summer/page.tsx` (initial version, links tab only)
- [ ] `SummerLinkManagement` server component — table of families + links
- [ ] `CopyLinkButton` client component — copies `${origin}/summer-reg?token=${token}` to clipboard
- [ ] `PreviewLinkButton` client component — opens `${origin}/summer-reg?token=${token}` in a new tab for staff QA
- [ ] `ExportCsvButton` client component — client-side CSV download, columns: `Full Name, Email Address, Students, Link`
- [ ] Add an obvious "missing email" state in the link table so staff can fix families before sending
- [ ] Add `Summer Reg` nav link in `app/ui/dashboard/nav-links.tsx` (admin only)
- [ ] Test: generate all tokens → verify count matches active families
- [ ] Test: export CSV → open in spreadsheet → confirm one row per family, correct columns, valid URLs
- [ ] Test: copy link → paste in incognito → correct family's form loads
- [ ] Test: preview link while logged in as staff → correct family's form loads without redirect
- [ ] Operational: resolve blank/missing family emails before importing the CSV into Constant Contact

---

## MVP — Step 4: Response Review Dashboard
**Target: April 29**

**Goal:** Staff can see a live summary of how many families have responded and what they chose, and can filter/sort the response list into workable queues for building the summer schedule.

**Done when:**
- Stats cards show accurate counts: Total Families, Responded, Enrolling, No Change (returning September), Stopping, Needs Follow-up, Pending (not yet responded)
- Response table shows each student's name, parent name, their choice, selected sessions, their current slot, and submission time
- Filtering by status works correctly
- Sorting by submitted date, family, student, response type, and current slot works correctly
- Submitting a new parent response immediately updates the dashboard (cache invalidation working)

**Checklist:**
- [ ] `fetchSummerStats()` in `summer-data.ts` — cacheTag `summer-responses`
- [ ] `fetchSummerResponseRows(filter, sort)` in `summer-data.ts` — filter: `all | pending | enrolling | no_change | pausing | needs_followup | completed`; sort: `submitted_desc | submitted_asc | parent_name | student_name | summer_status | current_slot` — cacheTag `summer-responses`
- [ ] `SummerStatsCards` server component — Total Families, Responded, Enrolling, No Change, Stopping, Pending, Needs Follow-up
- [ ] `SummerTabs` client component — `?tab=responses` / `?tab=links`
- [ ] `SummerResponsesSection` server component — table: Student, Parent, Choice, Sessions, Current Slot, Submitted, Actions
- [ ] Add visible sort controls so staff can work queue views for Enrolling / No Change / Stopping / Needs Follow-up
- [ ] Wire `revalidateTag('summer-responses')` in `submitSummerForm` action
- [ ] Test: submit a response → dashboard stats update correctly
- [ ] Test: each filter tab shows only the correct rows
- [ ] Test: sort each queue by submitted date / current slot / family name and confirm stable ordering

---

## MVP — Step 5: Approval Flow
**Target: May 2**

**Goal:** Staff can approve individual enrolling requests (creates real enrolments with auto-inherited course), bulk-approve all pending enrolling requests, remove a student from summer (deletes enrolments, keeps request record), and mark requests as reviewed or needing follow-up.

**Done when:**
- Approving an "enrolling" request creates one enrolment per selected session in the `enrolments` table with the correct inherited `course_id`
- Approved student appears on the schedule page
- Removing a student deletes those enrolments but leaves the `parent_requests` row intact with payload
- "Approve All Enrolling" only operates on `status='pending'` rows — does not double-create for already-completed requests
- Approval fails gracefully with a user-readable error if no existing enrolment exists to inherit a course from
- Staff can bulk-complete "No Change" responses without any enrolment action

**Checklist:**
- [ ] `approveSummerRequest(formData)` — validates course inheritance, `sql.begin` insert enrolments, update request to `completed`
- [ ] `approveAllEnrolling(formData)` — filters `status='pending' AND payload->>'summer_status'='enrolling'`, same insert logic
- [ ] `markAllNoChangeComplete()` — bulk marks all `no_change` + `status='pending'` rows as `completed`, no enrolment action
- [ ] `removeFromSummer(formData)` — deletes all `enrolment_ids`, resets request to `pending` (check absences `ON DELETE CASCADE` first)
- [ ] `markReviewed(formData)` and `markNeedsFollowup(formData)`
- [ ] `ApproveModal` client component — start_date picker only (no session or course picker)
- [ ] `ApproveAllModal` client component — start_date picker + count of enrolling students
- [ ] `RemoveButton` with inline confirmation
- [ ] Test full cycle: submit enrolling → approve → verify enrolment in DB and on schedule page
- [ ] Test: approve → remove → enrolment gone, `parent_requests` row still exists
- [ ] Test: approve all → verify N enrolments created, all requests marked `completed`
- [ ] Test: approve a student with no existing enrolment → error shown, no DB change
- [ ] Test: resubmit after approved → old enrolments deleted, new request pending, staff re-approves
- [ ] Test: submit no_change → mark all no-change complete → rows marked `completed`, no enrolments created

---

## Operational — Pre-Send Setup
**Target: May 4**

**Goal:** System is fully tested end-to-end. Staff have confirmed the data, built the CC campaign, and are ready to send.

**Data & Accounts:**
- [ ] **Amanda: confirm which sessions should have `is_summer=TRUE`** — real summer evening sessions need the flag flipped before links go out
- [ ] **Taite / Amanda: pull parent email list** — verify all active family emails are current in the portal / customer table (the CSV uses whatever is in `customers.email`)
- [ ] Decide how to handle families that need more than one parent recipient — current system assumes one family email field in `customers.email`
- [ ] Flip `is_summer=TRUE` on all confirmed summer sessions in production DB
- [ ] Run "Generate All Tokens" on production — confirm count matches expected active family count
- [ ] Export CSV from dashboard — spot-check 5–10 rows: correct names, emails, valid links
- [ ] Use the dashboard preview action to QA family links before send, especially any row with unusual student grouping or a recently updated email

**Constant Contact:**
- [ ] Log into Constant Contact account
- [ ] Create a new list called "Summer Schedule 2026" — import the exported CSV into it
- [ ] Verify CC field mapping: `Full Name` → First + Last name, `Email Address` → email, `Students` → custom field, `Link` → custom field
- [ ] Create email campaign — subject: "Choose your child's summer class schedule"
- [ ] Build email body using the three CC template variables: `{{Full Name}}`, `{{Students}}`, `{{Link}}`
- [ ] Preview campaign — confirm variables populate correctly for a test contact
- [ ] **Amanda: confirm response deadline date** — add to email body copy

**Internal Test Send:**
- [ ] Add an internal staff email as a test contact in CC with a real token link
- [ ] Send test email to that address
- [ ] Click the link in the email → confirm the form loads in a browser with the correct student shown
- [ ] Submit the form (try at least: "Enroll" with a session selected, and "No change")
- [ ] Open `/dashboard/summer` → confirm responses appear in the dashboard
- [ ] Confirm the response table can be sorted into the expected approval queue after the test submission
- [ ] Approve the "enrolling" test response → confirm student appears on the schedule page
- [ ] Confirm "no change" response can be bulk-completed without touching enrolments
- [ ] Fix any issues found before proceeding to send

---

## Operational — First Send
**Target: May 5–7**

**Goal:** Every active family receives their personalized link in one email campaign via Constant Contact.

- [ ] Final review of CC campaign content with Amanda
- [ ] Send campaign to "Summer Schedule 2026" list in Constant Contact
- [ ] Decide whether `email_sent_at` / `email_sent_count` will be updated manually after the CC send or treated as unused until Phase 4 automation
- [ ] Confirm delivery stats in CC (sent / opened / bounced)
- [ ] Flag any hard bounces → update emails manually + resend individually if needed
- [ ] Post send link in internal staff channel so anyone can monitor responses

---

## Operational — Monitor + Approve
**Target: May 8–11**

**Goal:** All responses processed. Enrolling students are on the summer schedule. No-change families are marked complete. Edge cases handled.

- [ ] Check `/dashboard/summer` daily — track Responded vs Pending count
- [ ] Approve enrolling students in batches using "Approve All Enrolling" (or individually where needed)
- [ ] Bulk-complete all "No Change" responses (no enrolment action, just marks complete)
- [ ] Review "Needs Follow-up" requests manually — contact family to clarify
- [ ] For families who haven't responded by May 9 — consider a manual follow-up or resend
- [ ] Verify approved students appear correctly on the schedule page
- [ ] Final count: all responses should be `completed` or `needs_manual_followup` — no `pending` rows from active families

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
