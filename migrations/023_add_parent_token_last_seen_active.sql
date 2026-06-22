-- Track when a summer-link family was last seen with active enrolments.
-- This lets Link Management keep paused families available for later follow-up
-- without depending on current enrolment rows after portal sync removes them.

ALTER TABLE parent_tokens
  ADD COLUMN IF NOT EXISTS last_seen_active_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_active_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_parent_tokens_last_seen_active_at
  ON parent_tokens (last_seen_active_at);
