-- Printable camp rosters need the parent/contact details captured from the
-- portal camp report. Applied manually.

ALTER TABLE camp_enrolments
  ADD COLUMN IF NOT EXISTS parent_name TEXT,
  ADD COLUMN IF NOT EXISTS parent_phone TEXT,
  ADD COLUMN IF NOT EXISTS allergies TEXT;
