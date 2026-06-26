-- Manual deployment required.
-- Stores the per-week "Print Log" shown on each camp week's "Print Log" tab.
-- One row per print project: which student it is for, a description of the
-- print, its ready status, and free-form notes. Rows are ordered by position.

CREATE TABLE IF NOT EXISTS camp_print_log (
  id SERIAL PRIMARY KEY,
  week_start date NOT NULL,
  position integer NOT NULL DEFAULT 0,
  student text,
  print_description text,
  status text,            -- '' | 'ready' | 'printing' | 'done'
  notes text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS camp_print_log_week_start_idx
  ON camp_print_log (week_start);
