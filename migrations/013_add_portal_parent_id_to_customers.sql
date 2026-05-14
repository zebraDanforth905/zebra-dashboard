-- Stable portal-side numeric ID for each parent/guardian account.
-- Used as the upsert key when syncing customer records from portal scrapes.
-- Non-breaking: existing rows receive NULL until next portal sync.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS portal_parent_id BIGINT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_portal_parent_id
  ON customers(portal_parent_id)
  WHERE portal_parent_id IS NOT NULL;
