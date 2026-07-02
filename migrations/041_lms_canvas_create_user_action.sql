-- Manual deployment required.
-- Allow audited LMS dashboard writes that create a Canvas user account.

ALTER TABLE camp_lms_canvas_action_audit
  DROP CONSTRAINT IF EXISTS camp_lms_canvas_action_audit_action_type_check;

ALTER TABLE camp_lms_canvas_action_audit
  ADD CONSTRAINT camp_lms_canvas_action_audit_action_type_check
  CHECK (
    action_type IN (
      'add_expected_beginner',
      'activate_course',
      'inactivate_enrollment',
      'create_user'
    )
  );
