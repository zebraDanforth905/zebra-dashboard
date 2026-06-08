-- Track staff workflow checkpoints separately from legacy "Added to Portal".
-- Applied manually. Does not alter billing tables.

ALTER TABLE parent_requests
  ADD COLUMN IF NOT EXISTS adjusted_for_summer_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS adjusted_for_summer_by TEXT,
  ADD COLUMN IF NOT EXISTS adjusted_for_fall_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS adjusted_for_fall_by TEXT;

COMMENT ON COLUMN parent_requests.adjusted_for_summer_at IS
  'Staff marked the response as adjusted for summer scheduling/billing workflow.';

COMMENT ON COLUMN parent_requests.adjusted_for_fall_at IS
  'Staff marked the response as adjusted for fall scheduling workflow.';
