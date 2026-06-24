-- Manual deployment required.
-- Allow camp LMS mappings to include additional acceptable Canvas course IDs
-- beyond the beginner/intermediate/advanced columns.

ALTER TABLE camp_lms_course_mappings
  ADD COLUMN IF NOT EXISTS canvas_additional_course_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE camp_lms_course_mappings
  DROP CONSTRAINT IF EXISTS camp_lms_course_mappings_additional_ids_array_check;

ALTER TABLE camp_lms_course_mappings
  ADD CONSTRAINT camp_lms_course_mappings_additional_ids_array_check
  CHECK (jsonb_typeof(canvas_additional_course_ids) = 'array');
