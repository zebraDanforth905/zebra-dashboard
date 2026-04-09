-- Staff Scheduling core tables

CREATE TABLE IF NOT EXISTS shift_template (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS template_date_range (
  id SERIAL PRIMARY KEY,
  template_id INTEGER NOT NULL REFERENCES shift_template(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT template_date_range_valid_range CHECK (start_date <= end_date)
);

CREATE TABLE IF NOT EXISTS template_shift (
  id SERIAL PRIMARY KEY,
  template_id INTEGER NOT NULL REFERENCES shift_template(id) ON DELETE CASCADE,
  weekday TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT template_shift_valid_weekday CHECK (
    LOWER(weekday) IN ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')
  ),
  CONSTRAINT template_shift_valid_time CHECK (start_time < end_time)
);

CREATE TABLE IF NOT EXISTS assigned_staff (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  template_shift_id INTEGER NOT NULL REFERENCES template_shift(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(template_shift_id, user_id)
);

CREATE TABLE IF NOT EXISTS staff_absence (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  start_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_date DATE NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT staff_absence_valid_range CHECK (
    (start_date < end_date) OR (start_date = end_date AND start_time < end_time)
  )
);

CREATE TABLE IF NOT EXISTS untemplated_shift (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT untemplated_shift_valid_time CHECK (start_time < end_time)
);

CREATE INDEX IF NOT EXISTS idx_template_date_range_template_dates
  ON template_date_range(template_id, start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_template_shift_template_weekday
  ON template_shift(template_id, weekday);

CREATE INDEX IF NOT EXISTS idx_assigned_staff_shift
  ON assigned_staff(template_shift_id);

CREATE INDEX IF NOT EXISTS idx_staff_absence_user_dates
  ON staff_absence(user_id, start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_untemplated_shift_date
  ON untemplated_shift(date);
