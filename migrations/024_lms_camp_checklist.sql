-- Manual deployment required.
-- Dashboard-only LMS setup checklist for camp weeks.
-- No Canvas credentials, API tokens, or automated LMS writes are stored here.

ALTER TABLE camp_enrolments
  ADD COLUMN IF NOT EXISTS note TEXT;

CREATE TABLE IF NOT EXISTS camp_lms_course_mappings (
  course_id       TEXT PRIMARY KEY,
  lms_course_name TEXT NOT NULL,
  lms_course_link TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS camp_lms_status_checks (
  camp_enrolment_id UUID PRIMARY KEY REFERENCES camp_enrolments(id) ON DELETE CASCADE,
  status            TEXT NOT NULL CHECK (
    status IN (
      'verified',
      'missing_user',
      'missing_course',
      'needs_followup',
      'not_applicable'
    )
  ),
  note              TEXT,
  checked_by        TEXT,
  checked_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_camp_lms_status_checks_status
  ON camp_lms_status_checks(status);

CREATE INDEX IF NOT EXISTS idx_camp_lms_status_checks_checked_at
  ON camp_lms_status_checks(checked_at DESC);
