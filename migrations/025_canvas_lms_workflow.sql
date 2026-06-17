-- Manual deployment required.
-- Canvas-backed camp LMS audit workflow.
-- Stores Canvas read snapshots and explicit staff-triggered test-write audit logs.
-- No Canvas credentials or API tokens are stored in the database.

ALTER TABLE camp_lms_course_mappings
  ADD COLUMN IF NOT EXISTS canvas_course_family TEXT,
  ADD COLUMN IF NOT EXISTS canvas_beginner_course_id TEXT,
  ADD COLUMN IF NOT EXISTS canvas_beginner_course_name TEXT,
  ADD COLUMN IF NOT EXISTS canvas_intermediate_course_id TEXT,
  ADD COLUMN IF NOT EXISTS canvas_intermediate_course_name TEXT,
  ADD COLUMN IF NOT EXISTS canvas_advanced_course_id TEXT,
  ADD COLUMN IF NOT EXISTS canvas_advanced_course_name TEXT;

CREATE TABLE IF NOT EXISTS camp_lms_canvas_snapshots (
  camp_enrolment_id UUID PRIMARY KEY REFERENCES camp_enrolments(id) ON DELETE CASCADE,
  canvas_user_id TEXT,
  canvas_user_name TEXT,
  canvas_user_login TEXT,
  canvas_user_email TEXT,
  canvas_user_found BOOLEAN NOT NULL DEFAULT FALSE,
  canvas_user_matches JSONB NOT NULL DEFAULT '[]'::jsonb,
  active_enrollments JSONB NOT NULL DEFAULT '[]'::jsonb,
  inactive_enrollments JSONB NOT NULL DEFAULT '[]'::jsonb,
  invited_enrollments JSONB NOT NULL DEFAULT '[]'::jsonb,
  sync_status TEXT NOT NULL DEFAULT 'not_synced' CHECK (
    sync_status IN ('not_synced', 'synced', 'error')
  ),
  sync_error TEXT,
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_camp_lms_canvas_snapshots_status
  ON camp_lms_canvas_snapshots(sync_status);

CREATE INDEX IF NOT EXISTS idx_camp_lms_canvas_snapshots_synced_at
  ON camp_lms_canvas_snapshots(synced_at DESC);

CREATE TABLE IF NOT EXISTS camp_lms_canvas_action_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_enrolment_id UUID REFERENCES camp_enrolments(id) ON DELETE SET NULL,
  student_id TEXT,
  action_type TEXT NOT NULL CHECK (
    action_type IN ('add_expected_beginner', 'inactivate_enrollment')
  ),
  canvas_user_id TEXT,
  canvas_course_id TEXT,
  canvas_enrollment_id TEXT,
  requested_by TEXT,
  requested_by_name TEXT,
  before_state JSONB,
  after_state JSONB,
  request_payload JSONB,
  response_payload JSONB,
  success BOOLEAN NOT NULL DEFAULT FALSE,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE camp_lms_canvas_action_audit
  ADD COLUMN IF NOT EXISTS after_state JSONB;

CREATE INDEX IF NOT EXISTS idx_camp_lms_canvas_action_audit_enrolment
  ON camp_lms_canvas_action_audit(camp_enrolment_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_camp_lms_canvas_action_audit_created_at
  ON camp_lms_canvas_action_audit(created_at DESC);
