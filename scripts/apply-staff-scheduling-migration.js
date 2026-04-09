const fs = require('fs');
const postgres = require('postgres');

async function main() {
  const url = process.env.POSTGRES_URL;
  if (!url) {
    throw new Error('POSTGRES_URL is not set in environment');
  }

  const sql = postgres(url, { ssl: 'require' });
  try {
    const ddl = fs.readFileSync('migrations/002_create_staff_scheduling.sql', 'utf8');
    await sql.unsafe(ddl);

    const tables = await sql.unsafe(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('shift_template','template_date_range','template_shift','assigned_staff','staff_absence','untemplated_shift') ORDER BY table_name"
    );

    console.log('Created/verified tables:', tables.map((t) => t.table_name).join(', '));
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
