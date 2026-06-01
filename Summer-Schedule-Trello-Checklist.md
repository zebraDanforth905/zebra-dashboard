# Summer Schedule — Trello Checklist

**Final deadline: May 11, 2026**
**Authoritative design reference:** `Summer-Schedule-Implementation.md`

**Future-week schedule plan:** `Summer-Schedule-Future-Week-Plan.md`

---

## Phase Overview

| Phase | Scope | Target |
|-------|-------|--------|
| **MVP** | Foundation + Public Form + Link Management + Response Review + Approval Flow | May 2 |
| **Operational** | Data pull, CC campaign, internal test, first send, monitor + approve | May 11 |
| **Schedule Readiness** | Week selector + portal-derived summer schedule safety | Before relying on dashboard for summer operations |
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
- [ ] **Apply migrations 008–022 to production DB** ← BLOCKED: staff action
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
- [x] `app/dashboard/summer/page.tsx` with 4 tabs: Link Management, Responses, Summer Schedule, Fall Schedule
- [x] `LinkManagement` component — table with family, email (+ 2nd: alt email read-only), students, status
- [x] `AlternateNameCell` — inline edit for second parent name
- [x] `CopyLinkButton` — clipboard copy
- [x] Link preview button (opens in new tab)
- [x] `ExportCsvButton` — current filtered CSV: Email, Alternate Email, Students, Link
- [x] Missing email warning in table
- [x] `RefreshLinksButton` — busts cache + reloads (replaces Delete All Tokens)
- [x] Export tracking — marks exported token rows with `last_exported_at` / `export_count`
- [x] `nav-links.tsx` — Summer Reg nav link added
- [ ] **Test: generate all tokens → verify count** ← needs prod DB
- [ ] **Test: export CSV → confirm 4 columns, one row per family, valid URLs** ← needs prod DB
- [ ] **Test: copy link → incognito → correct family form** ← needs prod DB
- [ ] **Test: Refresh button updates table after portal sync** ← needs prod DB

---

## MVP — Step 4: Response Review Dashboard ✅ CODE DONE

**Checklist:**
- [x] `fetchSummerStats()` in `summer-data.ts`
- [x] `fetchSummerResponseRows()` in `summer-data.ts`
- [x] Stats cards — Total Families, Responded, Not Responded, Exported, Enrolling, Pausing, No Change (historical), Needs Followup
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
- [x] `markAddedToPortal(requestId)`, `clearAddedToPortal(requestId)`, `markNeedsFollowup(requestId)`, `clearFollowup(requestId)`
- [x] `updateSummerResponseSource(requestId, source)` — parent vs staff/internal response tracking
- [x] `ApproveRequestModal` — start_date picker, shown only for enrolling requests
- [x] `ApproveAllModal` — start_date + enrolling count
- [x] Delete response action — testing/cleanup path; re-check audit/history requirements before production use
- [ ] **Test full cycle: submit → approve → verify enrolment in DB + on summer schedule tab** ← needs prod DB
- [ ] **Test: approve → remove → enrolment gone, request row kept** ← needs prod DB
- [ ] **Test: student with no existing enrolment → error shown** ← needs prod DB

---

## MVP — Step 6: Summer Schedule Tab ✅ CODE DONE

- [x] `fetchSummerSchedule()` in `summer-data.ts` — sessions WHERE is_summer=TRUE with student rosters
- [x] `SummerScheduleTab` component — session cards with weekday, time, enrolled students + courses
- [x] Tab wired into `/dashboard/summer?tab=schedule`
- [x] Fall Schedule subtab wired into `/dashboard/summer?tab=fall-schedule`
- [ ] **Test: approve summer enrolments → tab shows updated roster** ← needs prod DB
- [ ] **Test: flip is_summer=FALSE on a session → disappears from tab** ← needs prod DB

Note: this tab is a response/local-enrolment roster view. It is not yet the portal-derived week-by-week operational schedule.

---

## Operational — Pre-Send Setup
**Target: May 4**

- [ ] **Amanda: confirm which sessions should have `is_summer=TRUE`**
- [ ] Apply migrations 008–022 to production DB
- [ ] Set `BACKFILL_ALT_PARENTS_SECRET` before using `/jobs/backfill-alt-parents`
- [ ] Run portal sync (`/jobs/scrape-now`) → verify `customers.portal_parent_id` populated
- [ ] Verify dual-parent families have `alternate_name` + `alternate_email` populated
- [ ] Flip `is_summer=TRUE` on confirmed summer sessions
- [ ] Run "Generate All Tokens" → confirm count matches expected active families
- [ ] Export CSV → spot-check 5–10 rows: emails, alternate emails, student names, valid links
- [ ] Preview selected family links while logged in
- [ ] Review public-route exposure before launching summer responses: parents can remove `?token=...` from `/summer-reg`; confirm root site and schedule/dashboard routes stay behind login or show no private schedule data
- [ ] Audit blank/missing `email` rows before CC import
- [ ] **Amanda: confirm response deadline date** — add to email copy

**Constant Contact:**
- [ ] Log into Constant Contact account
- [ ] Create list "Summer Schedule 2026" — import CSV
- [ ] Verify CC field mapping: Email Address → email, Alternate Email, Students, Link
- [ ] Create campaign — subject: "Choose your child's summer class schedule"
- [ ] Build email with `{{Students}}` and `{{Link}}`
- [ ] Preview campaign with test contact
- [ ] Internal test send (see below)

**Internal Test Send:**
- [ ] Add internal staff email as test contact in CC with real token link
- [ ] Send test email → click link → confirm form loads with correct student
- [ ] Submit form (try Enroll + Pause + Custom)
- [ ] Open `/dashboard/summer` → confirm response appears
- [ ] Apply response to portal or use local approval test path → confirm tracking works
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
- [ ] Apply enrolling students to portal; local "Approve All Enrolling" remains a test/backstop path
- [ ] Bulk-complete all "No Change" historical responses if any
- [ ] Review "Needs Follow-up" manually
- [ ] For non-responders by May 9 — consider manual follow-up or resend
- [ ] Verify Added to Portal tracking and spot-check portal schedule
- [ ] Final: all responses `completed` or `needs_manual_followup`, no active `pending` rows

---

## Schedule Readiness — Week Selector + Portal Pull

- [ ] Confirm portal class report returns reliable `start_date` and `end_date` for summer classes
- [ ] Confirm whether portal summer times are true 4:15/5:15 or operational 4:00/5:00 stand-ins
- [ ] Add `/dashboard/schedule?weekStart=YYYY-MM-DD`
- [ ] Keep current no-query schedule behavior unchanged
- [ ] Preserve `weekStart` across weekday nav, session nav, and session detail links
- [ ] Make schedule counts date-aware with `start_date <= target_date` and `end_date >= target_date`
- [ ] Make student rosters date-aware with both `start_date` and `end_date`
- [ ] Decide summer-vs-regular session filter from selected week
- [ ] Update portal sync to pass `is_summer` when resolving sessions
- [ ] Scope portal-sync deletions by scraped date range and term before partial summer pulls
- [ ] Verify absences, trials, makeups, and pickups against selected summer week
- [ ] Verify `/dashboard/schedule` without `weekStart` still matches current production behavior

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
- [ ] Test send + decide separate send-tracking schema if Resend replaces CC export flow

## Deferred — August Fall-Only Form

- [ ] Add request/campaign scoping before sending new fall-only links (`fall_scheduling` and/or `campaign_id`)
- [ ] Add fall-only route or flow mode that does not require `is_summer=TRUE` sessions
- [ ] Split parent form sections so fall schedule can be shown without summer choices
- [ ] Keep same family tokens, but track exports/sends per campaign rather than overwriting summer send state
- [ ] Keep response dashboard default to latest current-flow responses; show old campaign/history only in details or audit views

---

## Deferred — Future

| Item | Notes |
|------|-------|
| Portal sync on approval | Push approved enrolments back to portal — no API contract yet |
| Portal-derived schedule pull | Active plan in `Summer-Schedule-Future-Week-Plan.md`; required before dashboard schedule is summer source of truth |
| Billing integration | `enrolment_ids` stored on approved requests; connect later |
| Session toggle admin UI | Currently staff flip `is_summer` via direct DB edit; future: toggle on schedule tab |
| Session blocking (capacity) | Staff flip `is_summer=FALSE` to close a session; future: auto-block on coach capacity |
