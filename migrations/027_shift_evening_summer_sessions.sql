-- Move Tue/Wed/Thu late summer sessions earlier so they end at 6:00 PM.
-- Keeps existing session ids intact for submitted parent form choices.

UPDATE sessions
SET
  start_time = '17:00'::time,
  end_time = '18:00'::time
WHERE is_summer = TRUE
  AND weekday IN ('Tuesday', 'Wednesday', 'Thursday')
  AND start_time = '17:15'::time
  AND end_time = '18:15'::time;
