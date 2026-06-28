-- Manual deployment required.
-- Rename the camp Canvas read cache away from "snapshot" terminology.
-- Historic snapshots belong only to the Summer Response workflow.

DO $$
BEGIN
  IF to_regclass('public.camp_lms_canvas_sync_state') IS NULL
     AND to_regclass('public.camp_lms_canvas_snapshots') IS NOT NULL THEN
    ALTER TABLE camp_lms_canvas_snapshots RENAME TO camp_lms_canvas_sync_state;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.idx_camp_lms_canvas_sync_state_status') IS NULL
     AND to_regclass('public.idx_camp_lms_canvas_snapshots_status') IS NOT NULL THEN
    ALTER INDEX idx_camp_lms_canvas_snapshots_status RENAME TO idx_camp_lms_canvas_sync_state_status;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.idx_camp_lms_canvas_sync_state_synced_at') IS NULL
     AND to_regclass('public.idx_camp_lms_canvas_snapshots_synced_at') IS NOT NULL THEN
    ALTER INDEX idx_camp_lms_canvas_snapshots_synced_at RENAME TO idx_camp_lms_canvas_sync_state_synced_at;
  END IF;
END $$;
