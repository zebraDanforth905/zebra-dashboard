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

## MVP — Step 1: Foundation ✅ CODE DONE
**Target: April 22 ✅**

**Checklist:**
- [x] Write migration `008_create_parent_request_tables.sql`
- [x] Write migration `009_add_summer_flag_to_sessions.sql`
- [x] Write migration `010_add_alternate_email_to_customers.sql`
- [x] Write migration `011_add_fall_columns_to_parent_requests.sql`
- [x] Write migration `012_add_alternate_name_to_customers.sql`
- [x] Write migration `013_add_portal_parent_id_to_customers.sql`
- [x] Write migration `014_preserve_responses_on_token_delete.sql`
- [x] Add parent self-serve types to `app/lib/definitions.ts`
- [x] Fix `auth.config.ts` to exempt `/summer-reg`
- [ ] **Apply migrations 008–014 to production DB** ← BLOCKED: staff action
- [ ] Flip `is_summer=TRUE` on real summer sessions in production DB
- [ ] Confirm dashboard URL → set `NEXT_PUBLIC_APP_URL` in `.env.local`

---

## MVP — Step 2: Public Parent Form ✅ CODE DONE

**Checklist:**
- [x] `fetchParentFormData(token)` in `summer-data.ts`
- [x] `generateParentToken(customerId)` in `summer-actions.ts` (idempotent)
- [x] `submitSummerForm(prevState, formData)` in `summer-actions.ts`
- [x] `app/summer-reg/page.tsx` — greeting shows both parent first names
- [x] `app/summer-reg/submitted/page.tsx` — shows per-student summary + resubmit link
- [x] `SummerRegForm` client component — 3 options: Enroll, Pause, Custom (No Change removed)
- [x] `StudentCard` client component — shows current slot, fall section with standard hourly times only
- [x] Form pre-fill on revisit (including fall_notes)
- [ ] **Test: insert token → visit form → submit each option → verify DB row** ← needs prod DB
- [ ] **Test: submit twice → verify superseded + is_latest flags** ← needs prod DB
- [ ] Test: no `is_summer=TRUE` sessions → "coming soon" message
- [ ] Test: student with no existing enrolment → "No current class on file"

---

## MVP — Step 3: Link Management Dashboard ✅ CODE DONE

**Checklist:**
- [x] `generateAllParentTokens()` in `summer-actions.ts`
- [x] `fetchParentLinkRows()` in `summer-data.ts` — includes alternate_name, alternate_email
- [x] `app/dashboard/summer/page.tsx` with 3 tabs: Link Management, Responses, Summer Schedule
- [x] `LinkManagement` component — table with family, email (+ 2nd: alt email read-only), students, status
- [x] `AlternateNameCell` — inline edit for second parent name
- [x] `CopyLinkButton` — clipboard copy
- [x] Link preview button (opens in new tab)
- [x] `ExportCsvButton` — 7-column CSV: Full Name, Alternate Name, Email, Alternate Email, Students, Current Courses, Link
- [x] Missing email warning in table
- [x] `RefreshLinksButton` — busts cache + reloads (replaces Delete All Tokens)
- [x] `MarkSentButton` — marks all tokens as emailed
- [x] `nav-links.tsx` — Summer Reg nav link added
- [ ] **Test: generate all tokens → verify count** ← needs prod DB
- [ ] **Test: export CSV → confirm 7 columns, one row per family, valid URLs** ← needs prod DB
- [ ] **Test: copy link → incognito → correct family form** ← needs prod DB
- [ ] **Test: Refresh button updates table after portal sync** ← needs prod DB

---

## MVP — Step 4: Response Review Dashboard ✅ CODE DONE

**Checklist:**
- [x] `fetchSummerStats()` in `summer-data.ts`
- [x] `fetchSummerResponseRows()` in `summer-data.ts`
- [x] Stats cards — Total Families, Responded, Not Responded, Emailed, Enrolling, Pausing, No Change, Needs Followup
- [x] Filter by summer intent + request status + search by name
- [x] Response table — Student, Family, Current slot, Summer choice, Summer sessions, Fall plan, Fall sessions, Notes, Status, Submitted, Actions
- [x] Sort controls (filter dropdowns + search)
- [ ] **Test: submit a response → stats update** ← needs prod DB
- [ ] **Test: each filter shows correct rows** ← needs prod DB

---

## MVP — Step 5: Approval Flow ✅ CODE DONE

**Checklist:**
- [x] `approveSummerRequest(requestId, startDate)` — auto-inherits course, creates enrolments
- [x] `approveAllEnrolling(startDate)` — bulk approval, returns created/skipped counts
- [x] `markAllNoChangeComplete()` — bulk complete no-change (historical only, option removed from form)
- [x] `removeFromSummer(requestId)` — deletes enrolment_ids, resets to pending
- [x] `markReviewed(requestId)` and `markNeedsFollowup(requestId)`
- [x] `ApproveRequestModal` — start_date picker, shown only for enrolling requests
- [x] `ApproveAllModal` — start_date + enrolling count
- [x] `RemoveFromSummerButton` — inline confirm
- [ ] **Test full cycle: submit → approve → verify enrolment in DB + on summer schedule tab** ← needs prod DB
- [ ] **Test: approve → remove → enrolment gone, request row kept** ← needs prod DB
- [ ] **Test: student with no existing enrolment → error shown** ← needs prod DB

---

## MVP — Step 6: Summer Schedule Tab ✅ CODE DONE

- [x] `fetchSummerSchedule()` in `summer-data.ts` — sessions WHERE is_summer=TRUE with student rosters
- [x] `SummerScheduleTab` component — session cards with weekday, time, enrolled students + courses
- [x] Tab wired into `/dashboard/summer?tab=schedule`
- [ ] **Test: approve summer enrolments → tab shows updated roster** ← needs prod DB
- [ ] **Test: flip is_summer=FALSE on a session → disappears from tab** ← needs prod DB

---

## Operational — Pre-Send Setup
**Target: May 4**

- [ ] **Amanda: confirm which sessions should have `is_summer=TRUE`**
- [ ] Apply migrations 008–014 to production DB
- [ ] Run portal sync (`/jobs/scrape-now`) → verify `customers.portal_parent_id` populated
- [ ] Verify dual-parent families have `alternate_name` + `alternate_email` populated
- [ ] Flip `is_summer=TRUE` on confirmed summer sessions
- [ ] Run "Generate All Tokens" → confirm count matches expected active families
- [ ] Export CSV → spot-check 5–10 rows: names, emails, valid links, alternate names
- [ ] Preview selected family links while logged in
- [ ] Audit blank/missing `email` rows before CC import
- [ ] **Amanda: confirm response deadline date** — add to email copy

**Constant Contact:**
- [ ] Log into Constant Contact account
- [ ] Create list "Summer Schedule 2026" — import CSV
- [ ] Verify CC field mapping: Full Name → name, Email Address → email, Alternate Email, Students, Link
- [ ] Create campaign — subject: "Choose your child's summer class schedule"
- [ ] Build email with `{{Full Name}}`, `{{Students}}`, `{{Link}}`
- [ ] Preview campaign with test contact
- [ ] Internal test send (see below)

**Internal Test Send:**
- [ ] Add internal staff email as test contact in CC with real token link
- [ ] Send test email → click link → confirm form loads with correct student
- [ ] Submit form (try Enroll + No Change)
- [ ] Open `/dashboard/summer` → confirm response appears
- [ ] Approve enrolling response → confirm student on Summer Schedule tab
- [ ] Fix any issues before live send

---

## Operational — First Send
**Target: May 5–7**

- [ ] Final review of CC campaign with Amanda
- [ ] Send campaign to "Summer Schedule 2026" list
- [ ] Confirm delivery stats in CC (sent/opened/bounced)
- [ ] Flag hard bounces → update emails + resend individually
- [ ] Post link in internal staff channel so anyone can monitor responses

---

## Operational — Monitor + Approve
**Target: May 8–11**

- [ ] Check `/dashboard/summer` daily — track Responded vs Pending
- [ ] Approve enrolling students in batches using "Approve All Enrolling"
- [ ] Bulk-complete all "No Change" historical responses if any
- [ ] Review "Needs Follow-up" manually
- [ ] For non-responders by May 9 — consider manual follow-up or resend
- [ ] Verify approved students on Summer Schedule tab
- [ ] Final: all responses `completed` or `needs_manual_followup`, no active `pending` rows

---

## Deferred — Phase 3: Restart / Inactive Sibling (Post-launch)

- [ ] Confirm UX with Amanda
- [ ] Update `fetchParentFormData` to return inactive students
- [ ] Add restart section to `SummerRegForm` / `StudentCard`
- [ ] `submitSummerForm` handles `request_type='restart'`
- [ ] Dashboard shows restart requests with distinct label

---

## Deferred — Phase 4: Automated Email via Resend (Post-launch)

- [ ] Resolve DNS for zebrarobotics.com (who manages it?)
- [ ] Set up Resend account + verify domain
- [ ] `pnpm add resend @react-email/components`
- [ ] `app/lib/email/resend.ts` + `app/lib/email/summer-form-email.tsx`
- [ ] `sendSummerFormEmails` server action
- [ ] `SendSummerEmailsButton` in link management
- [ ] Test send + verify `email_sent_at` / `email_sent_count` update

---

## Deferred — Future

| Item | Notes |
|------|-------|
| Portal sync on approval | Push approved enrolments back to portal — no API contract yet |
| Billing integration | `enrolment_ids` stored on approved requests; connect later |
| Session toggle admin UI | Currently staff flip `is_summer` via direct DB edit; future: toggle on schedule tab |
| Session blocking (capacity) | Staff flip `is_summer=FALSE` to close a session; future: auto-block on coach capacity |
