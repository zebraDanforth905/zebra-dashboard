-- Restore one seat_assignments row per (enrolment_id, date).
--
-- Migration 024 collapsed the table to a single row per enrolment_id, on the
-- theory that duplicate rows were accumulating. In practice the seating UI
-- and the printable schedule both read/write scoped to a specific calendar
-- date (fetchSeatAssignments(date), updateCampSeatAssignment(id, seat, date)),
-- expecting one row per day. With only one row per enrolment, saving a seat
-- for any day overwrites that enrolment's only row (moving its `date`
-- column), which makes the assignment disappear from every other day the
-- same enrolment attends - the "seating chart gets partially deleted when
-- you navigate to another day" bug.
--
-- No data cleanup is needed here: migration 024 already reduced every
-- enrolment to at most one row, so that row is trivially unique on the
-- (enrolment_id, date) pair as well.

ALTER TABLE seat_assignments DROP CONSTRAINT IF EXISTS seat_assignments_pkey;
ALTER TABLE seat_assignments ADD PRIMARY KEY (enrolment_id, date);
