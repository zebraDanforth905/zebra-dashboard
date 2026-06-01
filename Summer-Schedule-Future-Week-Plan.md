# Summer Schedule Future Week Plan

Last reviewed: 2026-05-29

## Answer

Summer responses do not need a structural change to make a summer schedule functional, as long as the portal can return clean class rows with student, class time, start date, and end date. The current form already captures the key summer data staff need to apply responses to the portal:

- selected summer session IDs
- per-session summer start dates
- fall plan and per-session fall start dates
- custom notes for exceptions
- parent-vs-staff submission source
- "Added to Portal" tracking

The schedule work belongs after that handoff: portal becomes source of truth, and dashboard schedule views must become week-aware so future summer weeks can be inspected without changing the current schedule.

## Current Code State

- `parent_requests.payload.session_ids` and `session_start_dates` store summer choices.
- `parent_requests.payload.fall_session_ids` and `fall_session_start_dates` store fall choices.
- `/dashboard/summer?tab=schedule` shows summer sessions by reading local `enrolments` for `sessions.is_summer = TRUE`.
- `/dashboard/schedule` only shows regular sessions because `fetchSessionsForDay` filters `s.is_summer = FALSE`.
- Current schedule counts mostly ignore `enrolments.end_date`; some student lists check `start_date`, but counts need the full date window.
- Portal sync currently inserts/fetches class sessions through `getSessionId(..., is_summer = FALSE)`, so summer portal rows would be misclassified unless sync is updated.
- Portal sync deletion logic is snapshot-style. It must be scoped before any partial summer week/range scrape is used.

## Data Contract Needed From Portal

Preferred portal row shape:

```text
student_id
student_name
course_id or course_abbr
weekday
start_time
end_time
start_date
end_date
trial_date, if applicable
make_up_date, if applicable
parent_id / customer_id
parent email fields
```

If portal returns one continuous date range per student/session, the existing `enrolments.start_date` and `enrolments.end_date` model works.

If portal returns non-contiguous attendance weeks for the same student/session, do not overload `enrolments`. Add a separate occurrence table such as `student_session_occurrences(student_id, session_id, date)` or a scheduling override table. The current unique `(student_id, session_id)` pattern cannot represent gaps.

## Week Selector Behavior

Default behavior stays the same:

- no selected week means the regular schedule behaves as it does today
- current-day redirect still lands on today's weekday
- current regular schedule is not affected by future summer data

Opt-in behavior:

- add `weekStart=YYYY-MM-DD` to `/dashboard/schedule`
- the selected week determines each weekday's target date
- session counts and rosters use that target date
- summer weeks can show summer sessions and summer class times
- non-summer weeks keep regular sessions

## Implementation Steps

1. Add shared date helpers for week parsing, weekday-to-date mapping, and summer-term detection.
2. Add a schedule week selector UI to `/dashboard/schedule`.
3. Preserve `weekStart` through daily nav links, session nav links, dashboard overview links, and detail pages.
4. Pass the selected target date into `fetchSessionsForDay`, `fetchSessionStudents`, `fetchUpcomingSessionMakeups`, `fetchUpcomingSessionTrials`, `fetchPickupsForDay`, and `fetchTodaySummary` where applicable.
5. Update all schedule enrolment queries to use:

```sql
(e.start_date IS NULL OR e.start_date <= target_date)
AND (e.end_date IS NULL OR e.end_date >= target_date)
```

6. Select session term by date:
   - default/current view: `s.is_summer = FALSE`
   - selected summer week: `s.is_summer = TRUE`
   - selected non-summer future week: `s.is_summer = FALSE`
7. Update portal sync to classify sessions as summer or regular based on the row date/range, not just time.
8. Scope portal sync deletes to the scrape range and term before using date-range summer pulls.
9. Verify attendance, trials, makeups, absences, and pickup views against selected weeks.

## Portal Sync Changes

Required before portal-derived summer schedule goes live:

- change `getSessionId(tx, weekday, start, end)` to accept `isSummer`
- classify a row as summer when its class date/range overlaps the configured summer term
- pass `isSummer` into enrolment, trial, makeup, and absence sync paths
- avoid deleting regular enrolments when scraping only summer rows
- avoid deleting summer enrolments when scraping only regular rows
- if scraping a specific date range, delete only rows whose date window overlaps that range

## Response Launch Gate

These are enough to launch response collection:

- migrations through the current summer response set are applied
- summer sessions are visible on the form
- `tdsb-calendar.ts` dates and closed dates are confirmed
- Constant Contact CSV export is spot-checked
- staff can submit on behalf of a parent
- "Added to Portal" tracking is working
- staff know that responses are not the live schedule source

Week selector is not required for response launch.

## Summer Schedule Launch Gate

These are required before relying on the dashboard schedule for summer operations:

- portal response application workflow is confirmed
- portal report returns usable start/end dates for summer classes
- portal sync safely distinguishes summer and regular sessions
- selected-week schedule queries are date-aware
- current schedule with no week selector is unchanged
- summer week schedule shows summer sessions only
- regular week schedule shows regular sessions only
- absences, trials, makeups, and pickups are checked for selected week behavior

## Acceptance Criteria

- Opening `/dashboard/schedule` with no query param behaves like current production.
- Opening `/dashboard/schedule?weekStart=2026-07-06` shows the selected summer week.
- Monday through Sunday nav keeps the selected week.
- Session counts match students active for that exact date.
- Students starting later in summer do not appear before their start date.
- Students ending before a week do not appear after their end date.
- Portal-synced summer sessions do not appear in current regular schedule.
- Portal-synced regular sessions do not appear in summer weeks.
- No billing tables are read or written by this work.

## Open Questions

- Does the portal class report return summer class `end_date` reliably?
- Does the portal use true 4:15/5:15 times, or existing 4:00/5:00 sessions as operational stand-ins?
- Should `/dashboard` daily overview get the same week selector now, or remain current-day only until staff requests it?
- Are pickups relevant during summer weeks, or should pickup views remain regular-school-year only?
- Do VEX/flex students need a separate occurrence model?
