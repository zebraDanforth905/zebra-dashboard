-- Manual deployment required.
-- Stores the per-week staff ("Coaches") schedule shown on each camp week's
-- "Staff Schedule" tab. One row per editable cell, keyed by the camp week
-- (Monday week_start), the schedule row (e.g. Morning Drop Off / Coach Lunch
-- Front), and the weekday. Cell content is free-form text (names, times,
-- notes) — it is not rigidly structured. The fixed row labels (sections and
-- rooms) live in the UI, not here.

CREATE TABLE IF NOT EXISTS camp_staff_schedules (
  id SERIAL PRIMARY KEY,
  week_start date NOT NULL,
  row_key text NOT NULL,     -- e.g. 'morning_dropoff', 'coach_lunch_front'
  weekday smallint NOT NULL, -- 1 = Monday ... 5 = Friday
  content text,
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (week_start, row_key, weekday)
);

CREATE INDEX IF NOT EXISTS camp_staff_schedules_week_start_idx
  ON camp_staff_schedules (week_start);
