-- Staff qualifications for coach/course matching

CREATE TABLE IF NOT EXISTS staff_qualification (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_staff_qualification_user
  ON staff_qualification(user_id);

CREATE INDEX IF NOT EXISTS idx_staff_qualification_course
  ON staff_qualification(course_id);
