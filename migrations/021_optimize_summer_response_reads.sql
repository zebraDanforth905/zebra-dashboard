-- Migration 021: speed up summer response dashboard reads.
-- Manual deploy only. Uses CONCURRENTLY, so run outside a transaction.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_parent_requests_active_submitted_at
  ON parent_requests (submitted_at DESC)
  WHERE is_latest = TRUE
    AND removed_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_parent_requests_active_token_id
  ON parent_requests (token_id)
  WHERE is_latest = TRUE
    AND removed_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_parent_requests_active_status
  ON parent_requests (status)
  WHERE is_latest = TRUE
    AND removed_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_parent_requests_active_summer_status
  ON parent_requests ((payload->>'summer_status'))
  WHERE is_latest = TRUE
    AND removed_at IS NULL
    AND request_type = 'summer_scheduling';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_enrolments_student_start_date
  ON enrolments (student_id, start_date DESC);
