-- Manual deployment required.
-- Stores the per-week activity schedule shown on each camp week's
-- "Activity Schedule" tab. One row per editable cell, keyed by the camp week
-- (Monday week_start), the time block, the room, and the weekday. The fixed
-- structural rows (DROPOFF, LUNCH, EXTENDED CARE) live in the UI, not here.

CREATE TABLE IF NOT EXISTS camp_activity_schedules (
  id SERIAL PRIMARY KEY,
  week_start date NOT NULL,
  block_key text NOT NULL,   -- 'morning' | 'afternoon'
  room text NOT NULL,        -- 'Front' | 'Back'
  weekday smallint NOT NULL, -- 1 = Monday ... 5 = Friday
  activity text,
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (week_start, block_key, room, weekday)
);

CREATE INDEX IF NOT EXISTS camp_activity_schedules_week_start_idx
  ON camp_activity_schedules (week_start);
