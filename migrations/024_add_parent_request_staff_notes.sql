-- Adds staff-only follow-up notes to summer/parent responses.
-- Applied manually. Does not alter billing tables.

ALTER TABLE parent_requests
  ADD COLUMN IF NOT EXISTS staff_notes JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN parent_requests.staff_notes IS
  'Staff follow-up notes appended as JSON objects with body, created_at, and created_by.';
