-- Printable camp rosters need the parent/contact details captured from the
-- portal camp report. Applied manually.
--
-- Numbered 027 to avoid the Canvas LMS workflow migrations 025/026 on
-- codex/summer-lms-checklist.

ALTER TABLE camp_enrolments
  ADD COLUMN IF NOT EXISTS note TEXT,
  ADD COLUMN IF NOT EXISTS parent_name TEXT,
  ADD COLUMN IF NOT EXISTS parent_phone TEXT,
  ADD COLUMN IF NOT EXISTS allergies TEXT;
