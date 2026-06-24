-- Manual deployment required.
-- Manual Canvas LMS assignment workflow for camp checklist.
-- Stores course choices and audited staff-triggered Canvas writes.
-- No Canvas credentials, API tokens, or generated passwords are stored here.

CREATE TABLE IF NOT EXISTS camp_lms_canvas_course_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_course_id TEXT NOT NULL UNIQUE,
  canvas_course_name TEXT NOT NULL,
  canvas_course_code TEXT,
  canvas_course_link TEXT,
  stream_code TEXT,
  stream_name TEXT,
  grade_label TEXT,
  version_label TEXT,
  suggested_portal_course_ids TEXT[] NOT NULL DEFAULT '{}',
  requires_verification BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_camp_lms_canvas_course_catalog_active
  ON camp_lms_canvas_course_catalog(active, sort_order, canvas_course_name);

CREATE INDEX IF NOT EXISTS idx_camp_lms_canvas_course_catalog_portal_ids
  ON camp_lms_canvas_course_catalog USING GIN(suggested_portal_course_ids);

CREATE TABLE IF NOT EXISTS camp_lms_expected_course_assignments (
  camp_enrolment_id UUID PRIMARY KEY REFERENCES camp_enrolments(id) ON DELETE CASCADE,
  catalog_course_id UUID REFERENCES camp_lms_canvas_course_catalog(id) ON DELETE SET NULL,
  canvas_course_id TEXT NOT NULL,
  canvas_course_name TEXT,
  assigned_by TEXT,
  assigned_by_name TEXT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_camp_lms_expected_course_assignments_canvas_course
  ON camp_lms_expected_course_assignments(canvas_course_id);

ALTER TABLE camp_lms_canvas_action_audit
  DROP CONSTRAINT IF EXISTS camp_lms_canvas_action_audit_action_type_check;

ALTER TABLE camp_lms_canvas_action_audit
  ADD CONSTRAINT camp_lms_canvas_action_audit_action_type_check CHECK (
    action_type IN (
      'add_expected_beginner',
      'create_canvas_user',
      'assign_expected_course',
      'add_canvas_course',
      'inactivate_enrollment'
    )
  );

INSERT INTO camp_lms_canvas_course_catalog (
  canvas_course_id,
  canvas_course_name,
  canvas_course_code,
  canvas_course_link,
  stream_code,
  stream_name,
  grade_label,
  version_label,
  suggested_portal_course_ids,
  requires_verification,
  notes,
  sort_order
)
VALUES
  ('404', 'Simple Machines', 'R120', 'https://lms.zebrarobotics.com/courses/404/gradebook', 'R100', 'Jr. Robotics Engineer', '1', NULL, ARRAY[]::text[], FALSE, NULL, 100),
  ('405', 'Simple Mechanisms', 'R140', 'https://lms.zebrarobotics.com/courses/405/gradebook', 'R100', 'Jr. Robotics Engineer', '1', NULL, ARRAY[]::text[], FALSE, NULL, 110),
  ('406', 'Complex Mechanisms', 'R160', 'https://lms.zebrarobotics.com/courses/406/gradebook', 'R100', 'Jr. Robotics Engineer', '1', NULL, ARRAY[]::text[], FALSE, NULL, 120),
  ('407', 'Motorized Mechanisms', 'R180', 'https://lms.zebrarobotics.com/courses/407/gradebook', 'R100', 'Jr. Robotics Engineer', '1', NULL, ARRAY[]::text[], FALSE, NULL, 130),
  ('465', 'Moving Models (Beginner)', 'R301', 'https://lms.zebrarobotics.com/courses/465/gradebook', 'R301', 'Moving Models (WeDo)', NULL, 'Beginner', ARRAY[]::text[], FALSE, NULL, 200),
  ('466', 'Moving Models (Intermediate)', 'R301', 'https://lms.zebrarobotics.com/courses/466/gradebook', 'R301', 'Moving Models (WeDo)', NULL, 'Intermediate', ARRAY[]::text[], FALSE, NULL, 210),
  ('467', 'Moving Models (Advanced)', 'R301', 'https://lms.zebrarobotics.com/courses/467/gradebook', 'R301', 'Moving Models (WeDo)', NULL, 'Advanced', ARRAY[]::text[], FALSE, NULL, 220),
  ('468', 'Moving Models (Expert I)', 'R301', 'https://lms.zebrarobotics.com/courses/468/gradebook', 'R301', 'Moving Models (WeDo)', NULL, 'Expert I', ARRAY[]::text[], FALSE, NULL, 230),
  ('712', 'Robotics Fundamentals', 'R420', 'https://lms.zebrarobotics.com/courses/712/gradebook', 'R400', 'Robotics Engineer I (Spike)', '4', NULL, ARRAY['Rob Eng I']::text[], FALSE, NULL, 300),
  ('720', 'Reactive Robotics', 'R440', 'https://lms.zebrarobotics.com/courses/720/gradebook', 'R400', 'Robotics Engineer I (Spike)', '4', NULL, ARRAY['Rob Eng I']::text[], FALSE, NULL, 310),
  ('728', 'Smart Robotics Navigation', 'R460', 'https://lms.zebrarobotics.com/courses/728/gradebook', 'R400', 'Robotics Engineer I (Spike)', '4', NULL, ARRAY['Rob Eng I']::text[], FALSE, NULL, 320),
  ('1017', 'Enhanced Programming', 'R520', 'https://lms.zebrarobotics.com/courses/1017/gradebook', 'R400', 'Robotics Engineer I (Spike)', '4', NULL, ARRAY['Rob Eng I']::text[], FALSE, NULL, 330),
  ('1205', 'Design Fundamentals', 'R540', 'https://lms.zebrarobotics.com/courses/1205/gradebook', 'R400', 'Robotics Engineer I (Spike)', '4', NULL, ARRAY['Rob Eng I']::text[], FALSE, NULL, 340),
  ('1597', 'Text Robotics & Navigation', 'R620', 'https://lms.zebrarobotics.com/courses/1597/gradebook', 'R600', 'Robotics Engineer II (Spike)', '6', NULL, ARRAY['Rob Eng II']::text[], FALSE, NULL, 400),
  ('1685', 'Sensor-Based Navigation', 'R640', 'https://lms.zebrarobotics.com/courses/1685/gradebook', 'R600', 'Robotics Engineer II (Spike)', '6', NULL, ARRAY['Rob Eng II']::text[], FALSE, NULL, 410),
  ('1742', 'Advanced Navigation', 'R660', 'https://lms.zebrarobotics.com/courses/1742/gradebook', 'R600', 'Robotics Engineer II (Spike)', '6', NULL, ARRAY['Rob Eng II']::text[], FALSE, NULL, 420),
  ('1275', 'Robotics Engineering Fundamentals', 'R820', 'https://lms.zebrarobotics.com/courses/1275/gradebook', 'R800', 'Sr. Robotics Engineer (Vex)', '8', NULL, ARRAY[]::text[], FALSE, NULL, 500),
  ('1287', 'Autonomous Robotics', 'R840', 'https://lms.zebrarobotics.com/courses/1287/gradebook', 'R800', 'Sr. Robotics Engineer (Vex)', '8', NULL, ARRAY[]::text[], FALSE, NULL, 510),
  ('250', 'Animation with Scratch', 'C220', 'https://lms.zebrarobotics.com/courses/250/gradebook', 'C200', 'Jr. Game Developer (Scratch)', '1', NULL, ARRAY['Scratch']::text[], FALSE, NULL, 600),
  ('251', 'Scratch Game Development', 'C320', 'https://lms.zebrarobotics.com/courses/251/gradebook', 'C200', 'Jr. Game Developer (Scratch)', '2', NULL, ARRAY['Scratch']::text[], FALSE, NULL, 610),
  ('252', 'Scratch Game Master', 'C340', 'https://lms.zebrarobotics.com/courses/252/gradebook', 'C200', 'Jr. Game Developer (Scratch)', '3', NULL, ARRAY['Scratch']::text[], FALSE, NULL, 620),
  ('632', 'Jr. Game Developer I Supplemental Projects', 'C360', 'https://lms.zebrarobotics.com/courses/632/gradebook', 'C200', 'Jr. Game Developer (Scratch)', '3', NULL, ARRAY['Scratch']::text[], FALSE, NULL, 630),
  ('273', 'Minecraft Adventures 2.0', 'C350', 'https://lms.zebrarobotics.com/courses/273/gradebook', 'C200', 'Minecraft Adventures', '3', '2.0', ARRAY['Minecraft']::text[], TRUE, 'Verify and replace with Minecraft Adventures 2.1 when the Canvas course ID is confirmed.', 640),
  ('704', 'Advanced Animation', 'C520', 'https://lms.zebrarobotics.com/courses/704/gradebook', 'C500', 'Jr. Game Developer II', '5', NULL, ARRAY['Processing']::text[], FALSE, NULL, 700),
  ('736', 'Generative Animation', 'C540', 'https://lms.zebrarobotics.com/courses/736/gradebook', 'C500', 'Jr. Game Developer II', '5', NULL, ARRAY['Processing']::text[], FALSE, NULL, 710),
  ('256', 'Web Design', 'C620', 'https://lms.zebrarobotics.com/courses/256/gradebook', 'C600', 'Web Developer', '6', NULL, ARRAY['Web Dev']::text[], FALSE, NULL, 800),
  ('1246', 'JavaScript Fundamentals 2.0', 'C640', 'https://lms.zebrarobotics.com/courses/1246/gradebook', 'C600', 'Web Developer', '6', '2.0', ARRAY['Web Dev']::text[], FALSE, NULL, 810),
  ('1261', 'Interactive JavaScript 2.0', 'C660', 'https://lms.zebrarobotics.com/courses/1261/gradebook', 'C600', 'Web Developer', '6', '2.0', ARRAY['Web Dev']::text[], FALSE, NULL, 820),
  ('1300', 'JavaScript jQuery 2.0', 'C680', 'https://lms.zebrarobotics.com/courses/1300/gradebook', 'C600', 'Web Developer', '6', '2.0', ARRAY['Web Dev']::text[], FALSE, NULL, 830),
  ('1612', 'Roblox Adventures 2.0', 'C650', 'https://lms.zebrarobotics.com/courses/1612', 'C600', 'Roblox Adventures', '6', '2.0', ARRAY['Roblox']::text[], FALSE, NULL, 840),
  ('410', '2D Game Development', 'C720', 'https://lms.zebrarobotics.com/courses/410/gradebook', 'C700', 'Sr. Game Developer (Unity)', '7', NULL, ARRAY['Unity']::text[], FALSE, NULL, 900),
  ('411', '3D Game Development', 'C740', 'https://lms.zebrarobotics.com/courses/411/gradebook', 'C700', 'Sr. Game Developer (Unity)', '7', NULL, ARRAY['Unity']::text[], FALSE, NULL, 910),
  ('260', 'Python Fundamentals', 'C820', 'https://lms.zebrarobotics.com/courses/260/gradebook', 'C800', 'Python Developer', '8', NULL, ARRAY['Python for AI Bootcamp']::text[], TRUE, 'Verify and replace with Python 1.1 beginner/intermediate course IDs when confirmed.', 1000),
  ('261', 'Data Structures & File I/O', 'C840', 'https://lms.zebrarobotics.com/courses/261/gradebook', 'C800', 'Python Developer', '8', NULL, ARRAY['Python for AI Bootcamp']::text[], TRUE, 'Verify and replace with Python 1.1 beginner/intermediate course IDs when confirmed.', 1010),
  ('262', 'Object Oriented Projects', 'C860', 'https://lms.zebrarobotics.com/courses/262/gradebook', 'C800', 'Python Developer', '8', NULL, ARRAY[]::text[], TRUE, 'Verify latest Python version before assigning.', 1020),
  ('1068', 'Advanced Data Structures', 'C880', 'https://lms.zebrarobotics.com/courses/1068/gradebook', 'C800', 'Python Developer', '9', NULL, ARRAY[]::text[], TRUE, 'Verify latest Python version before assigning.', 1030),
  ('1072', 'Java Fundamentals', 'C920', 'https://lms.zebrarobotics.com/courses/1072/gradebook', 'C900', 'Java Application Developer', '9', NULL, ARRAY[]::text[], FALSE, NULL, 1100),
  ('1073', 'Object Oriented Projects in Java', 'C940', 'https://lms.zebrarobotics.com/courses/1073/gradebook', 'C900', 'Java Application Developer', '9', NULL, ARRAY[]::text[], FALSE, NULL, 1110),
  ('1074', 'UI Development with Java', 'C960', 'https://lms.zebrarobotics.com/courses/1074/gradebook', 'C900', 'Java Application Developer', '9', NULL, ARRAY[]::text[], FALSE, NULL, 1120),
  ('1077', 'C Fundamentals', 'C1020', 'https://lms.zebrarobotics.com/courses/1077/gradebook', 'C1000', 'C Developer', '10', NULL, ARRAY[]::text[], FALSE, NULL, 1200),
  ('1080', 'Memory Allocation and File I/O', 'C1040', 'https://lms.zebrarobotics.com/courses/1080/gradebook', 'C1000', 'C Developer', '10', NULL, ARRAY[]::text[], FALSE, NULL, 1210),
  ('1082', 'Advanced Data Structures', 'C1060', 'https://lms.zebrarobotics.com/courses/1082/gradebook', 'C1000', 'C Developer', '10', NULL, ARRAY[]::text[], FALSE, NULL, 1220),
  ('1313', 'Essential Electronics I', 'T620', 'https://lms.zebrarobotics.com/courses/1313/gradebook', 'T600', 'Electronics Engineer I', NULL, NULL, ARRAY[]::text[], FALSE, NULL, 1300),
  ('1330', 'Essential Electronics II', 'T640', 'https://lms.zebrarobotics.com/courses/1330/gradebook', 'T600', 'Electronics Engineer I', NULL, NULL, ARRAY[]::text[], FALSE, NULL, 1310),
  ('996', 'Early Electronics (Beginner)', NULL, 'https://lms.zebrarobotics.com/courses/996/gradebook', 'Arduino', 'Arduino', NULL, 'Beginner', ARRAY[]::text[], FALSE, NULL, 1320),
  ('1006', 'Early Electronics (Intermediate)', NULL, 'https://lms.zebrarobotics.com/courses/1006/gradebook', 'Arduino', 'Arduino', NULL, 'Intermediate', ARRAY[]::text[], FALSE, NULL, 1330),
  ('1027', 'Early Electronics (Advanced)', NULL, 'https://lms.zebrarobotics.com/courses/1027/gradebook', 'Arduino', 'Arduino', NULL, 'Advanced', ARRAY[]::text[], FALSE, NULL, 1340),
  ('521', 'Building Enthusiasts', 'SR150', 'https://lms.zebrarobotics.com/courses/521/gradebook', 'Camp Style', 'Building Enthusiasts', '1', NULL, ARRAY['Build. Enthusiasts']::text[], FALSE, NULL, 1400),
  ('520', 'Adventures In Building', 'SR350', 'https://lms.zebrarobotics.com/courses/520/gradebook', 'Camp Style', 'Adventures In Building', '1', NULL, ARRAY['Mov. Models Camp']::text[], FALSE, 'Default for Moving Models Camp / STEM enthusiasts.', 1410),
  ('1255', 'Robotics Technician', 'SR450', 'https://lms.zebrarobotics.com/courses/1255/gradebook', 'Camp Style', 'Robotics Technician', '3', NULL, ARRAY['Robot Techs']::text[], FALSE, NULL, 1420)
ON CONFLICT (canvas_course_id) DO UPDATE
SET canvas_course_name = EXCLUDED.canvas_course_name,
    canvas_course_code = EXCLUDED.canvas_course_code,
    canvas_course_link = EXCLUDED.canvas_course_link,
    stream_code = EXCLUDED.stream_code,
    stream_name = EXCLUDED.stream_name,
    grade_label = EXCLUDED.grade_label,
    version_label = EXCLUDED.version_label,
    suggested_portal_course_ids = EXCLUDED.suggested_portal_course_ids,
    requires_verification = EXCLUDED.requires_verification,
    notes = EXCLUDED.notes,
    sort_order = EXCLUDED.sort_order,
    updated_at = NOW();
