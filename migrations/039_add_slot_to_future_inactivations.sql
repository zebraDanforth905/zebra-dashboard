-- Manual deployment required.
-- Adds the class slot (weekday + start time) of the enrolment to each queued
-- inactivation. The enrolments table the schedule reads from stores no portal
-- student_batch_id, so the only reliable way to link a queued inactivation to a
-- scheduled enrolment is the student + slot (a student can't be in two classes
-- at the same weekday/time). The schedule uses this to treat a queued end date
-- as the enrolment's effective end date *before* the inactivation actually
-- fires and the scrape syncs end_date — otherwise a student stays on the
-- schedule for weeks after their chosen end date.

ALTER TABLE future_inactivations
  ADD COLUMN IF NOT EXISTS class_day text,
  ADD COLUMN IF NOT EXISTS class_start_time text;
