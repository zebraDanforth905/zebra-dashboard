# Schedule TODO

## Summer schedule = regular/fall behavior (current state)

`app/lib/data.ts` — `fetchSessionStudents` and `fetchSessionsForDay` no longer filter by:
1. enrolment `start_date` / `end_date`, and
2. the `is_summer` term split (removed per decision 2026-06-26).

Schedule now reflects exactly what the portal sync wrote to `enrolments`. Portal = source of
truth. Summer pausing is handled in the portal (remove the class, then re-pull), so the app
does no term-based filtering of its own.

Source of truth = portal sync (`app/lib/insert_from_portal.ts`), which inserts and cleans up
the active enrolment set. Summer pull = `scrapeSummerEnrolmentWeek` (separate per-week scrape,
`ZEBRA_DATE_RANGE_ACTIVE_ID`); regular pull = `scrapeEnrolmentNow`.

### Consequence of dropping the term split
Summer weeks and regular weeks now show the **same** roster (all non-empty sessions for that
weekday). Only date-specific overlays (makeups/trials/absences, matched on the selected week's
date) still vary by week. `fetchSessionsForDay` keeps an unused `options.isSummer` param for
now — left in place so callers don't need changing.

### Accepted side effect (revisit later)
Future-dated enrolments (e.g. fall pre-regs with `start_date > today`) now appear in the
regular view too — they were previously hidden by the `start_date <= target` filter.
As of 2026-06-26: ~5 such regular enrolments (fall 2026), 0 hidden summer.

### To adjust later
- [ ] Decide whether not-yet-started enrolments (`start_date` in future) should be hidden.
- [ ] If yes, scope the hide so it does NOT reintroduce summer per-week batch filtering.
