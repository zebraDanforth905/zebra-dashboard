-- Manual effective camp assignment for campers enrolled through PA Day Camp.
-- The assignment is only used by dashboard camp prep/slip generation when the
-- original camp enrolment course is PA Day Camp.

CREATE TABLE IF NOT EXISTS camp_pa_day_course_assignments (
  camp_enrolment_id UUID PRIMARY KEY REFERENCES camp_enrolments(id) ON DELETE CASCADE,
  assigned_course_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_camp_pa_day_course_assignments_course
  ON camp_pa_day_course_assignments (assigned_course_id);
