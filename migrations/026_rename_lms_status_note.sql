-- Manual deployment required.
-- Rename LMS checklist note storage to avoid generic camp enrolment note naming.
-- This migration only touches camp LMS checklist tables.

ALTER TABLE camp_lms_status_checks
  ADD COLUMN IF NOT EXISTS lms_note TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'camp_lms_status_checks'
      AND column_name = 'note'
  ) THEN
    UPDATE camp_lms_status_checks
    SET lms_note = COALESCE(lms_note, note)
    WHERE lms_note IS NULL
      AND note IS NOT NULL;

    ALTER TABLE camp_lms_status_checks
      DROP COLUMN note;
  END IF;
END $$;
