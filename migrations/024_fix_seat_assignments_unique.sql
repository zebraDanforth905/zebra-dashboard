-- Change seat_assignments to have a unique constraint on enrolment_id alone.
-- Previously the composite key (enrolment_id, date) allowed one enrolment to
-- accumulate multiple rows across different days. Now each enrolment has exactly
-- one row; the date column records when the assignment was last made.

ALTER TABLE seat_assignments DROP CONSTRAINT IF EXISTS seat_assignments_pkey;
ALTER TABLE seat_assignments DROP CONSTRAINT IF EXISTS seat_assignments_enrolment_id_date_key;

-- Remove duplicate rows, keeping the most recent date per enrolment_id before
-- applying the new constraint.
DELETE FROM seat_assignments
WHERE ctid NOT IN (
  SELECT DISTINCT ON (enrolment_id) ctid
  FROM seat_assignments
  ORDER BY enrolment_id, date DESC
);

ALTER TABLE seat_assignments ADD PRIMARY KEY (enrolment_id);
