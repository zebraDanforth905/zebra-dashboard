-- Manual deployment required.
-- Persist staff edits for printable camp student list cells.

CREATE TABLE IF NOT EXISTS camp_print_student_list_overrides (
  week_start date NOT NULL,
  week_end date NOT NULL,
  student_id numeric NOT NULL,
  field text NOT NULL CHECK (
    field IN (
      'student',
      'parent',
      'type',
      'camp',
      'days',
      'room',
      'medical',
      'notes'
    )
  ),
  value text NOT NULL DEFAULT '',
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (week_start, week_end, student_id, field)
);

CREATE INDEX IF NOT EXISTS idx_camp_print_student_list_overrides_week
  ON camp_print_student_list_overrides (week_start, week_end);
