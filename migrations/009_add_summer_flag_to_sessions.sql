-- Staff flip is_summer=true on session rows to make them appear on the parent form.
-- Removing the flag (or deleting the session) makes it disappear immediately.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS is_summer BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX idx_sessions_is_summer ON sessions(is_summer) WHERE is_summer = TRUE;
