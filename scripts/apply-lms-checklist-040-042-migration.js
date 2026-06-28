// Brings a target db up to date for the LMS checklist + camp prep flow.
// Applies (idempotent, safe to re-run): 033 app_settings, 040 PA day-camp
// assignments, 041 create_user action, 042 sync_state rename. Then reports
// the exact schema_ready gate the dashboard uses.
//
// Optional Canvas token seeding (check-first: only writes if no row exists):
//   CANVAS_SEED_TOKEN='<token>' node scripts/apply-lms-checklist-040-042-migration.js
//
// Run in a shell where POSTGRES_URL points at the TARGET db (kyle-dev):
//   node scripts/apply-lms-checklist-040-042-migration.js
const fs = require('fs');
const postgres = require('postgres');

// Full LMS chain, in dependency order. All idempotent. 026 creates the
// canvas snapshots table; 042 renames it to camp_lms_canvas_sync_state.
const FILES = [
  'migrations/025_lms_camp_checklist.sql',
  'migrations/026_canvas_lms_workflow.sql',
  'migrations/027_rename_lms_status_note.sql',
  'migrations/030_lms_canvas_activate_course_action.sql',
  'migrations/032_lms_mapping_additional_courses.sql',
  'migrations/033_create_app_settings.sql',
  'migrations/040_pa_day_camp_course_assignments.sql',
  'migrations/041_lms_canvas_create_user_action.sql',
  'migrations/042_rename_lms_canvas_sync_state.sql',
];

const CANVAS_TOKEN_KEY = 'CANVAS_API_TOKEN';

function mask(token) {
  if (!token) return null;
  if (token.length <= 8) return '****';
  return `${token.slice(0, 4)}…${token.slice(-4)} (len ${token.length})`;
}

async function main() {
  const url = process.env.POSTGRES_URL;
  if (!url) throw new Error('POSTGRES_URL is not set in environment');

  let host = '(unknown)';
  try { host = new URL(url).host; } catch { /* ignore */ }
  console.log('target db host:', host);

  const sql = postgres(url, { ssl: 'require' });
  try {
    if (process.env.PREFLIGHT) {
      const [s] = await sql.unsafe(`SELECT to_regclass('public.camp_lms_canvas_sync_state') IS NOT NULL AS sync_state, to_regclass('public.app_settings') IS NOT NULL AS app_settings, to_regclass('public.camp_pa_day_course_assignments') IS NOT NULL AS pa_day`);
      console.log('PREFLIGHT (no writes). current:', s);
      return;
    }

    for (const file of FILES) {
      const ddl = fs.readFileSync(file, 'utf8');
      await sql.unsafe(ddl);
      console.log('applied:', file);
    }

    // Canvas token: check first, only seed if absent.
    const existing = await sql.unsafe(
      `SELECT setting_value FROM app_settings WHERE setting_key = '${CANVAS_TOKEN_KEY}' LIMIT 1`
    );
    if (existing[0]?.setting_value) {
      console.log('canvas token: already in db ->', mask(existing[0].setting_value), '(left as-is)');
    } else {
      const seed = (process.env.CANVAS_SEED_TOKEN || '').trim();
      if (seed) {
        await sql`
          INSERT INTO app_settings (setting_key, setting_value, updated_at)
          VALUES (${CANVAS_TOKEN_KEY}, ${seed}, NOW())
          ON CONFLICT (setting_key) DO UPDATE
          SET setting_value = EXCLUDED.setting_value, updated_at = NOW()
        `;
        console.log('canvas token: seeded ->', mask(seed));
      } else {
        console.log('canvas token: NOT in db; set CANVAS_SEED_TOKEN to seed it');
      }
    }

    const [schema] = await sql.unsafe(`
      SELECT (
        to_regclass('public.camp_lms_course_mappings') IS NOT NULL
        AND to_regclass('public.camp_lms_status_checks') IS NOT NULL
        AND to_regclass('public.camp_lms_canvas_sync_state') IS NOT NULL
        AND to_regclass('public.camp_lms_canvas_action_audit') IS NOT NULL
        AND to_regclass('public.camp_pa_day_course_assignments') IS NOT NULL
        AND EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='camp_lms_status_checks' AND column_name='lms_note')
        AND EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='camp_lms_course_mappings' AND column_name='canvas_beginner_course_id')
        AND EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='camp_lms_course_mappings' AND column_name='canvas_additional_course_ids')
        AND EXISTS (SELECT 1 FROM pg_constraint c
          JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
          WHERE n.nspname='public' AND t.relname='camp_lms_canvas_action_audit'
            AND c.contype='c' AND pg_get_constraintdef(c.oid) LIKE '%create_user%')
      ) AS schema_ready;
    `);
    console.log('schema_ready:', schema.schema_ready);

    if (!schema.schema_ready) {
      const [d] = await sql.unsafe(`
        SELECT
          to_regclass('public.camp_lms_course_mappings') IS NOT NULL AS mappings,
          to_regclass('public.camp_lms_status_checks') IS NOT NULL AS status_checks,
          to_regclass('public.camp_lms_canvas_sync_state') IS NOT NULL AS sync_state,
          to_regclass('public.camp_lms_canvas_action_audit') IS NOT NULL AS audit,
          to_regclass('public.camp_pa_day_course_assignments') IS NOT NULL AS pa_day,
          EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='camp_lms_status_checks' AND column_name='lms_note') AS lms_note_col,
          EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='camp_lms_course_mappings' AND column_name='canvas_beginner_course_id') AS beginner_col,
          EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='camp_lms_course_mappings' AND column_name='canvas_additional_course_ids') AS additional_col,
          EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND t.relname='camp_lms_canvas_action_audit' AND c.contype='c' AND pg_get_constraintdef(c.oid) LIKE '%create_user%') AS create_user_constraint
      `);
      console.log('missing pieces ->', Object.entries(d).filter(([, v]) => v === false).map(([k]) => k).join(', ') || '(none — check failed for another reason)');
    }
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
