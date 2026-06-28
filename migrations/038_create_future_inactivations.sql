-- Manual deployment required.
-- Queue of enrolment inactivations scheduled for a future date. The student
-- page lets staff "end" a portal enrolment on a chosen completion date; when
-- that date is today or in the past the portal PATCH happens immediately, but
-- when it is in the future a row lands here instead. The daily scrape cron
-- (/jobs/scrape-now) checks this table, inactivates any enrolment whose
-- end_date has arrived, and deletes the row once the portal write succeeds.
--
-- One pending inactivation per enrolment (student_batch_id is unique): the end
-- date can be edited or the whole task undone (deleted) any time before it runs.
-- student_id / course_name / sub_course_code are captured at schedule time so
-- the cron can replay the inactivation and the UI can label the row without an
-- extra portal read.

CREATE TABLE IF NOT EXISTS future_inactivations (
  id SERIAL PRIMARY KEY,
  student_id integer NOT NULL,
  student_batch_id integer NOT NULL UNIQUE,
  end_date date NOT NULL,
  course_name text,
  sub_course_code text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS future_inactivations_end_date_idx
  ON future_inactivations (end_date);

CREATE INDEX IF NOT EXISTS future_inactivations_student_id_idx
  ON future_inactivations (student_id);
