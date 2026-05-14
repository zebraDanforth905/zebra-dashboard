-- New summer-only session slots. Distinct from regular evening classes.
-- Run once against dev-kyle (and later prod). Idempotent.
--
-- Step 1: relax the session_coverage unique constraint to allow summer and
-- non-summer sessions to coexist at the same weekday + time slot.
-- Step 2: insert the 13 summer slots, skipping any already present.
--
-- Includes Saturday 1:00–2:00 PM.

ALTER TABLE sessions DROP CONSTRAINT session_coverage;
ALTER TABLE sessions ADD CONSTRAINT session_coverage UNIQUE (start_time, end_time, weekday, is_summer);

INSERT INTO sessions (weekday, start_time, end_time, is_summer)
SELECT t.weekday, t.start_time::time, t.end_time::time, TRUE
FROM (VALUES
  ('Monday',    '16:15', '17:15'),
  ('Tuesday',   '16:15', '17:15'),
  ('Tuesday',   '17:15', '18:15'),
  ('Wednesday', '16:15', '17:15'),
  ('Wednesday', '17:15', '18:15'),
  ('Thursday',  '16:15', '17:15'),
  ('Thursday',  '17:15', '18:15'),
  ('Friday',    '16:15', '17:15'),
  ('Saturday',  '09:00', '10:00'),
  ('Saturday',  '10:00', '11:00'),
  ('Saturday',  '11:00', '12:00'),
  ('Saturday',  '12:00', '13:00'),
  ('Saturday',  '13:00', '14:00')
) AS t(weekday, start_time, end_time)
WHERE NOT EXISTS (
  SELECT 1 FROM sessions s
  WHERE s.weekday    = t.weekday
    AND s.start_time = t.start_time::time
    AND s.end_time   = t.end_time::time
    AND s.is_summer  = TRUE
);
