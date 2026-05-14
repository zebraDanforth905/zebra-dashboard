-- Migration 020: per-field locks on customers so staff edits survive
-- portal sync. Once a field is locked (UI edit), portal sync skips that
-- field on subsequent runs. Unlock from UI restores portal-managed behavior.
--
-- Idempotent.

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS name_locked BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS email_locked BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS alternate_email_locked BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS alternate_name_locked BOOLEAN NOT NULL DEFAULT FALSE;
