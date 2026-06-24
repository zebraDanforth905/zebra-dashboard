-- Printable camp rosters need the parent/contact details captured from the
-- portal camp report. Applied manually.
--
-- Numbered 028 because production seat assignments and Canvas LMS workflow
-- migrations already occupy 024-027.

ALTER TABLE camp_enrolments
  ADD COLUMN IF NOT EXISTS note TEXT,
  ADD COLUMN IF NOT EXISTS parent_name TEXT,
  ADD COLUMN IF NOT EXISTS parent_phone TEXT,
  ADD COLUMN IF NOT EXISTS allergies TEXT;
