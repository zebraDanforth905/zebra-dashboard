-- Add multi-type support for untemplated shifts

CREATE TABLE IF NOT EXISTS untemplated_shift_type (
  id SERIAL PRIMARY KEY,
  untemplated_shift_id INTEGER NOT NULL REFERENCES untemplated_shift(id) ON DELETE CASCADE,
  shift_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(untemplated_shift_id, shift_type),
  CONSTRAINT untemplated_shift_type_valid_type CHECK (
    shift_type IN ('office', 'coach', 'pickup_frankland', 'pickup_jackman')
  )
);

CREATE INDEX IF NOT EXISTS idx_untemplated_shift_type_shift
  ON untemplated_shift_type(untemplated_shift_id);

-- Backfill existing untemplated shifts as coach shifts if no type rows exist yet
INSERT INTO untemplated_shift_type (untemplated_shift_id, shift_type)
SELECT us.id, 'coach'
FROM untemplated_shift us
LEFT JOIN untemplated_shift_type ust ON ust.untemplated_shift_id = us.id
WHERE ust.id IS NULL;
