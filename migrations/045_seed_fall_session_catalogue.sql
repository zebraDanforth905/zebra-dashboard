-- SUPERSEDED — do not rely on this migration.
--
-- The nightly portal scrape (insert_from_portal.ts) deletes every non-summer session with
-- no enrolments, trials, or makeups, so the rows this seeds are pruned within a day; that
-- already happened. The fall confirmation form now takes its offered slots from the
-- hard-coded FALL_CATALOGUE_SLOTS in app/lib/fall-policy.ts, and creates a session row on
-- demand when staff actually enrol someone. Kept for history; harmless to re-run.
--
-- Manual deployment required.
--
-- Seed the fall (non-summer) session catalogue, mirroring what 011_add_summer_sessions.sql
-- did for summer.
--
-- WHY: non-summer sessions were only ever created on demand by the portal scrape
-- (getSessionId in app/lib/insert_from_portal.ts), so a fall slot existed only if a student
-- was already enrolled in it. That makes an empty slot invisible on the parent-facing fall
-- confirmation form, and therefore unbookable — nobody can be the first to choose it.
-- Seeding the real offering breaks that circularity.
--
-- Idempotent: ON CONFLICT against session_coverage (start_time, end_time, weekday, is_summer).
-- Existing non-standard rows (e.g. Tue 16:15, Fri 18:30, Sat 10:30) are deliberately left
-- alone — students are actively enrolled in them and the fall form surfaces a student's own
-- slot even when it is outside the offered grid.

INSERT INTO sessions (weekday, start_time, end_time, is_summer, is_full)
SELECT t.weekday, t.start_time::time, t.end_time::time, FALSE, FALSE
FROM (VALUES
  -- Monday–Thursday: 4–5, 5–6, 6–7
  ('Monday',    '16:00', '17:00'),
  ('Monday',    '17:00', '18:00'),
  ('Monday',    '18:00', '19:00'),
  ('Tuesday',   '16:00', '17:00'),
  ('Tuesday',   '17:00', '18:00'),
  ('Tuesday',   '18:00', '19:00'),
  ('Wednesday', '16:00', '17:00'),
  ('Wednesday', '17:00', '18:00'),
  ('Wednesday', '18:00', '19:00'),
  ('Thursday',  '16:00', '17:00'),
  ('Thursday',  '17:00', '18:00'),
  ('Thursday',  '18:00', '19:00'),
  -- Friday runs only until 6
  ('Friday',    '16:00', '17:00'),
  ('Friday',    '17:00', '18:00'),
  -- Saturday
  ('Saturday',  '09:00', '10:00'),
  ('Saturday',  '10:00', '11:00'),
  ('Saturday',  '11:00', '12:00'),
  ('Saturday',  '13:00', '14:00'),
  -- Sunday
  ('Sunday',    '10:00', '11:00'),
  ('Sunday',    '11:00', '12:00')
) AS t(weekday, start_time, end_time)
ON CONFLICT ON CONSTRAINT session_coverage DO NOTHING;
