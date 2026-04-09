CREATE TABLE IF NOT EXISTS staff_availability (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  weekday TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT staff_availability_valid_weekday CHECK (
    LOWER(weekday) IN ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')
  ),
  CONSTRAINT staff_availability_valid_time CHECK (start_time < end_time),
  CONSTRAINT staff_availability_unique_block UNIQUE (user_id, weekday, start_time, end_time)
);

CREATE INDEX IF NOT EXISTS idx_staff_availability_user_weekday
  ON staff_availability(user_id, weekday);
