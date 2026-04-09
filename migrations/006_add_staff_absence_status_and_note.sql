ALTER TABLE staff_absence
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved';

ALTER TABLE staff_absence
  ADD COLUMN IF NOT EXISTS note TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'staff_absence_status_check'
      AND conrelid = 'staff_absence'::regclass
  ) THEN
    ALTER TABLE staff_absence
      ADD CONSTRAINT staff_absence_status_check
      CHECK (status IN ('requested', 'approved'));
  END IF;
END $$;
