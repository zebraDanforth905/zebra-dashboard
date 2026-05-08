-- Staff-controlled "full" flag on sessions.
-- When TRUE, the session is shown grayed-out with a "Full" label on the parent form
-- and the checkbox is disabled. Prevents new selections without removing the session
-- from the schedule entirely (which is_summer=FALSE would do).
--
-- Non-breaking: existing rows default to FALSE.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS is_full BOOLEAN NOT NULL DEFAULT FALSE;
