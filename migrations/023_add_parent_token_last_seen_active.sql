-- Track when a summer-link family was last seen with active enrolments.
-- This lets Link Management keep paused families available for later follow-up
-- without depending on current enrolment rows after portal sync removes them.

ALTER TABLE parent_tokens
  ADD COLUMN IF NOT EXISTS last_seen_active_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_active_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb;

WITH active_family_snapshot AS (
  SELECT
    s.customer_id,
    JSONB_AGG(
      DISTINCT JSONB_BUILD_OBJECT(
        'student_id', s.id::text,
        'student_name', s.name,
        'course_name', co.name,
        'weekday', se.weekday,
        'start_time', se.start_time,
        'pickup_school', cp.school_name
      )
    ) AS snapshot
  FROM students s
  JOIN enrolments e ON e.student_id = s.id
  JOIN sessions se ON se.id = e.session_id
  LEFT JOIN courses co ON co.id = e.course_id
  LEFT JOIN LATERAL (
    SELECT p.school_name
    FROM pickups p
    WHERE p.student_id = s.id
      AND LOWER(TRIM(p.weekday)) = LOWER(TRIM(se.weekday))
    ORDER BY p.id
    LIMIT 1
  ) cp ON true
  GROUP BY s.customer_id
)
UPDATE parent_tokens pt
SET
  last_seen_active_at = COALESCE(pt.last_seen_active_at, NOW()),
  last_active_snapshot = active_family_snapshot.snapshot
FROM active_family_snapshot
WHERE active_family_snapshot.customer_id = pt.customer_id;

CREATE INDEX IF NOT EXISTS idx_parent_tokens_last_seen_active_at
  ON parent_tokens (last_seen_active_at);
