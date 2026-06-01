-- Migration 022: track whether summer responses were submitted by parents or internally by staff.
-- Manual deploy only.
--
-- Existing parent_requests rows are treated as internal/staff-entered because pre-email
-- launch responses were manually copied from Trello/known parent updates.

ALTER TABLE parent_requests
  ADD COLUMN IF NOT EXISTS submitted_by TEXT,
  ADD COLUMN IF NOT EXISTS submitted_by_name TEXT,
  ADD COLUMN IF NOT EXISTS added_to_portal_by TEXT;

UPDATE parent_requests
SET
  submitted_by = 'staff',
  submitted_by_name = COALESCE(submitted_by_name, NULLIF(reviewed_by, ''), 'staff')
WHERE submitted_by IS NULL;

UPDATE parent_requests
SET added_to_portal_by = COALESCE(NULLIF(reviewed_by, ''), 'staff')
WHERE added_to_portal_at IS NOT NULL
  AND added_to_portal_by IS NULL;

ALTER TABLE parent_requests
  ALTER COLUMN submitted_by SET DEFAULT 'parent',
  ALTER COLUMN submitted_by SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'parent_requests_submitted_by_check'
  ) THEN
    ALTER TABLE parent_requests
      ADD CONSTRAINT parent_requests_submitted_by_check
      CHECK (submitted_by IN ('parent', 'staff'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_parent_requests_active_submitted_by
  ON parent_requests (submitted_by)
  WHERE is_latest = TRUE
    AND removed_at IS NULL;
