-- Add multi-type support for template shifts

CREATE TABLE IF NOT EXISTS template_shift_type (
  id SERIAL PRIMARY KEY,
  template_shift_id INTEGER NOT NULL REFERENCES template_shift(id) ON DELETE CASCADE,
  shift_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(template_shift_id, shift_type),
  CONSTRAINT template_shift_type_valid_type CHECK (
    shift_type IN ('office', 'coach', 'pickup_frankland', 'pickup_jackman')
  )
);

CREATE INDEX IF NOT EXISTS idx_template_shift_type_shift
  ON template_shift_type(template_shift_id);

-- Backfill existing shifts as coach shifts if no type rows exist yet
INSERT INTO template_shift_type (template_shift_id, shift_type)
SELECT ts.id, 'coach'
FROM template_shift ts
LEFT JOIN template_shift_type tst ON tst.template_shift_id = ts.id
WHERE tst.id IS NULL;
