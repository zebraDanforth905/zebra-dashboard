-- Manual deployment required.
-- Fall confirmation flow: a lightweight per-student "confirm / unenroll / pause" response
-- collected from parents at /fall-confirm, reusing parent_tokens for family identity.

-- 1. Allow the new request_type. The original CHECK from 008 has an implicit name.
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT con.conname INTO constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'parent_requests'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%request_type%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE parent_requests DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE parent_requests
  ADD CONSTRAINT parent_requests_request_type_check
  CHECK (request_type IN ('summer_scheduling', 'restart', 'other', 'fall_confirmation'));

-- 2. Fall export tracking, kept separate from the summer export columns so staff can
--    export the fall email without clobbering summer export history.
ALTER TABLE parent_tokens
  ADD COLUMN IF NOT EXISTS fall_exported_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fall_export_count   INTEGER NOT NULL DEFAULT 0;

-- 3. Latest-response lookups for the fall tab.
CREATE INDEX IF NOT EXISTS idx_parent_requests_fall_latest
  ON parent_requests(token_id, student_id)
  WHERE request_type = 'fall_confirmation' AND is_latest = TRUE;
