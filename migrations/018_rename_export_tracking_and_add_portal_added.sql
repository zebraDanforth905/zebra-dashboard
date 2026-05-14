-- Round 3 of Summer Reg meeting decisions (2026-05-07).
--
-- 1. Rename parent_tokens.email_sent_at → last_exported_at (column actually
--    tracks "staff exported this token's CSV row", not an email send).
--    email_sent_count → export_count.
-- 2. Add parent_requests.added_to_portal_at — replaces "Mark Reviewed" concept.
--    Staff click "Added to Portal" once they've manually entered the family's
--    summer schedule into the Zebra Portal.
--
-- Idempotent. Safe to re-run.

DO $$
BEGIN
  -- parent_tokens: rename email_sent_at → last_exported_at
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'parent_tokens' AND column_name = 'email_sent_at'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'parent_tokens' AND column_name = 'last_exported_at'
  ) THEN
    ALTER TABLE parent_tokens RENAME COLUMN email_sent_at TO last_exported_at;
  END IF;

  -- parent_tokens: rename email_sent_count → export_count
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'parent_tokens' AND column_name = 'email_sent_count'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'parent_tokens' AND column_name = 'export_count'
  ) THEN
    ALTER TABLE parent_tokens RENAME COLUMN email_sent_count TO export_count;
  END IF;

  -- parent_requests: add added_to_portal_at
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'parent_requests' AND column_name = 'added_to_portal_at'
  ) THEN
    ALTER TABLE parent_requests ADD COLUMN added_to_portal_at TIMESTAMPTZ;
  END IF;
END $$;
