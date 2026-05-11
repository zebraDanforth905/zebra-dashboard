-- Migration 019: preserve approval history on remove.
-- Adds removed_at timestamp so removeFromSummer marks rather than deletes.
-- Idempotent.

ALTER TABLE parent_requests
  ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ;

-- Helpful index for excluding removed requests in active queries
CREATE INDEX IF NOT EXISTS idx_parent_requests_removed_at
  ON parent_requests (removed_at)
  WHERE removed_at IS NOT NULL;
