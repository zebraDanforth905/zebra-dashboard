# Schedule TODO

Status 2026-07-02: the earlier filter-removal experiment (drop `is_summer` +
start/end-date filters so the schedule mirrors portal-synced `enrolments`
directly, decision 2026-06-26) was **superseded** by the attendance/inactivation
work merged on main (`feature/mark-attendance`, commits 80b472a/7e7fca8):

- Schedule queries again filter by `sess.is_summer`, `e.start_date <= target`,
  and `COALESCE(e.end_date, fi.end_date) >= weekStart` where `fi` is
  `future_inactivations` (migrations 038/039).
- Pausing a summer student is now representable in the dashboard via a
  scheduled inactivation (end date), in addition to removing the class in the
  portal and re-pulling (`app/lib/insert_from_portal.ts`).

Remaining follow-ups:

- [ ] Confirm summer weeks show the intended roster now that `is_summer` is
      term-derived (`isDateInTerm(target, 'summer')`) — the old "summer Friday
      empty" symptom was caused by summer sessions having no enrolments while
      the regular Friday sessions were `is_summer = FALSE`.
- [ ] Decide whether future-dated (not yet started) enrolments should appear
      in the weekly schedule; current behavior hides them via the
      `start_date <= target` filter.
- [ ] Remove this file once the summer pausing flow is confirmed end-to-end.
