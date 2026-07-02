import postgres from 'postgres';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

const migrationStatements = [
  {
    file: '025_lms_camp_checklist.sql',
    sql: `
      CREATE TABLE IF NOT EXISTS camp_lms_course_mappings (
        course_id       TEXT PRIMARY KEY,
        lms_course_name TEXT NOT NULL,
        lms_course_link TEXT,
        notes           TEXT,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS camp_lms_status_checks (
        camp_enrolment_id UUID PRIMARY KEY REFERENCES camp_enrolments(id) ON DELETE CASCADE,
        status            TEXT NOT NULL CHECK (
          status IN (
            'verified',
            'missing_user',
            'missing_course',
            'needs_followup',
            'not_applicable'
          )
        ),
        lms_note          TEXT,
        checked_by        TEXT,
        checked_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_camp_lms_status_checks_status
        ON camp_lms_status_checks(status);

      CREATE INDEX IF NOT EXISTS idx_camp_lms_status_checks_checked_at
        ON camp_lms_status_checks(checked_at DESC);
    `,
  },
  {
    file: '026_canvas_lms_workflow.sql',
    sql: `
      ALTER TABLE camp_lms_course_mappings
        ADD COLUMN IF NOT EXISTS canvas_course_family TEXT,
        ADD COLUMN IF NOT EXISTS canvas_beginner_course_id TEXT,
        ADD COLUMN IF NOT EXISTS canvas_beginner_course_name TEXT,
        ADD COLUMN IF NOT EXISTS canvas_intermediate_course_id TEXT,
        ADD COLUMN IF NOT EXISTS canvas_intermediate_course_name TEXT,
        ADD COLUMN IF NOT EXISTS canvas_advanced_course_id TEXT,
        ADD COLUMN IF NOT EXISTS canvas_advanced_course_name TEXT;

      CREATE TABLE IF NOT EXISTS camp_lms_canvas_snapshots (
        camp_enrolment_id UUID PRIMARY KEY REFERENCES camp_enrolments(id) ON DELETE CASCADE,
        canvas_user_id TEXT,
        canvas_user_name TEXT,
        canvas_user_login TEXT,
        canvas_user_email TEXT,
        canvas_user_found BOOLEAN NOT NULL DEFAULT FALSE,
        canvas_user_matches JSONB NOT NULL DEFAULT '[]'::jsonb,
        active_enrollments JSONB NOT NULL DEFAULT '[]'::jsonb,
        inactive_enrollments JSONB NOT NULL DEFAULT '[]'::jsonb,
        invited_enrollments JSONB NOT NULL DEFAULT '[]'::jsonb,
        sync_status TEXT NOT NULL DEFAULT 'not_synced' CHECK (
          sync_status IN ('not_synced', 'synced', 'error')
        ),
        sync_error TEXT,
        synced_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_camp_lms_canvas_snapshots_status
        ON camp_lms_canvas_snapshots(sync_status);

      CREATE INDEX IF NOT EXISTS idx_camp_lms_canvas_snapshots_synced_at
        ON camp_lms_canvas_snapshots(synced_at DESC);

      CREATE TABLE IF NOT EXISTS camp_lms_canvas_action_audit (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        camp_enrolment_id UUID REFERENCES camp_enrolments(id) ON DELETE SET NULL,
        student_id TEXT,
        action_type TEXT NOT NULL CHECK (
          action_type IN ('add_expected_beginner', 'inactivate_enrollment')
        ),
        canvas_user_id TEXT,
        canvas_course_id TEXT,
        canvas_enrollment_id TEXT,
        requested_by TEXT,
        requested_by_name TEXT,
        before_state JSONB,
        after_state JSONB,
        request_payload JSONB,
        response_payload JSONB,
        success BOOLEAN NOT NULL DEFAULT FALSE,
        error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      ALTER TABLE camp_lms_canvas_action_audit
        ADD COLUMN IF NOT EXISTS after_state JSONB;

      CREATE INDEX IF NOT EXISTS idx_camp_lms_canvas_action_audit_enrolment
        ON camp_lms_canvas_action_audit(camp_enrolment_id, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_camp_lms_canvas_action_audit_created_at
        ON camp_lms_canvas_action_audit(created_at DESC);
    `,
  },
  {
    file: '027_rename_lms_status_note.sql',
    sql: `
      ALTER TABLE camp_lms_status_checks
        ADD COLUMN IF NOT EXISTS lms_note TEXT;

      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'camp_lms_status_checks'
            AND column_name = 'note'
        ) THEN
          UPDATE camp_lms_status_checks
          SET lms_note = COALESCE(lms_note, note)
          WHERE lms_note IS NULL
            AND note IS NOT NULL;

          ALTER TABLE camp_lms_status_checks
            DROP COLUMN note;
        END IF;
      END $$;
    `,
  },
  {
    file: '030_lms_canvas_activate_course_action.sql',
    sql: `
      ALTER TABLE camp_lms_canvas_action_audit
        DROP CONSTRAINT IF EXISTS camp_lms_canvas_action_audit_action_type_check;

      ALTER TABLE camp_lms_canvas_action_audit
        ADD CONSTRAINT camp_lms_canvas_action_audit_action_type_check
        CHECK (
          action_type IN (
            'add_expected_beginner',
            'activate_course',
            'inactivate_enrollment'
          )
        );
    `,
  },
  {
    file: '032_lms_mapping_additional_courses.sql',
    sql: `
      ALTER TABLE camp_lms_course_mappings
        ADD COLUMN IF NOT EXISTS canvas_additional_course_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

      ALTER TABLE camp_lms_course_mappings
        DROP CONSTRAINT IF EXISTS camp_lms_course_mappings_additional_ids_array_check;

      ALTER TABLE camp_lms_course_mappings
        ADD CONSTRAINT camp_lms_course_mappings_additional_ids_array_check
        CHECK (jsonb_typeof(canvas_additional_course_ids) = 'array');
    `,
  },
  {
    file: '041_lms_canvas_create_user_action.sql',
    sql: `
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
    `,
  },
  {
    file: '042_rename_lms_canvas_sync_state.sql',
    sql: `
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
    `,
  },
  {
    file: '040_pa_day_camp_course_assignments.sql',
    sql: `
      CREATE TABLE IF NOT EXISTS camp_pa_day_course_assignments (
        camp_enrolment_id UUID PRIMARY KEY REFERENCES camp_enrolments(id) ON DELETE CASCADE,
        assigned_course_id TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_camp_pa_day_course_assignments_course
        ON camp_pa_day_course_assignments (assigned_course_id);
    `,
  },
];

async function schemaStatus() {
  const [schema] = await sql<{
    mappings: boolean;
    status_checks: boolean;
    sync_state: boolean;
    audit: boolean;
    pa_day: boolean;
    lms_note_col: boolean;
    beginner_col: boolean;
    additional_col: boolean;
    create_user_constraint: boolean;
    schema_ready: boolean;
  }[]>`
    SELECT
      to_regclass('public.camp_lms_course_mappings') IS NOT NULL AS mappings,
      to_regclass('public.camp_lms_status_checks') IS NOT NULL AS status_checks,
      to_regclass('public.camp_lms_canvas_sync_state') IS NOT NULL AS sync_state,
      to_regclass('public.camp_lms_canvas_action_audit') IS NOT NULL AS audit,
      to_regclass('public.camp_pa_day_course_assignments') IS NOT NULL AS pa_day,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public'
          AND table_name='camp_lms_status_checks'
          AND column_name='lms_note'
      ) AS lms_note_col,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public'
          AND table_name='camp_lms_course_mappings'
          AND column_name='canvas_beginner_course_id'
      ) AS beginner_col,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public'
          AND table_name='camp_lms_course_mappings'
          AND column_name='canvas_additional_course_ids'
      ) AS additional_col,
      EXISTS (
        SELECT 1 FROM pg_constraint c
        JOIN pg_class t ON t.oid=c.conrelid
        JOIN pg_namespace n ON n.oid=t.relnamespace
        WHERE n.nspname='public'
          AND t.relname='camp_lms_canvas_action_audit'
          AND c.contype='c'
          AND pg_get_constraintdef(c.oid) LIKE '%create_user%'
      ) AS create_user_constraint,
      (
        to_regclass('public.camp_lms_course_mappings') IS NOT NULL
        AND to_regclass('public.camp_lms_status_checks') IS NOT NULL
        AND to_regclass('public.camp_lms_canvas_sync_state') IS NOT NULL
        AND to_regclass('public.camp_lms_canvas_action_audit') IS NOT NULL
        AND to_regclass('public.camp_pa_day_course_assignments') IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema='public'
            AND table_name='camp_lms_status_checks'
            AND column_name='lms_note'
        )
        AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema='public'
            AND table_name='camp_lms_course_mappings'
            AND column_name='canvas_beginner_course_id'
        )
        AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema='public'
            AND table_name='camp_lms_course_mappings'
            AND column_name='canvas_additional_course_ids'
        )
        AND EXISTS (
          SELECT 1 FROM pg_constraint c
          JOIN pg_class t ON t.oid=c.conrelid
          JOIN pg_namespace n ON n.oid=t.relnamespace
          WHERE n.nspname='public'
            AND t.relname='camp_lms_canvas_action_audit'
            AND c.contype='c'
            AND pg_get_constraintdef(c.oid) LIKE '%create_user%'
        )
      ) AS schema_ready;
  `;

  return schema;
}

export async function POST() {
  const before = await schemaStatus();
  const applied: string[] = [];

  for (const migration of migrationStatements) {
    await sql.unsafe(migration.sql);
    applied.push(migration.file);
  }

  const after = await schemaStatus();

  return Response.json({
    ok: Boolean(after?.schema_ready),
    applied,
    before,
    after,
  });
}
