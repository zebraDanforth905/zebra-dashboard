const fs = require('fs');
const postgres = require('postgres');

async function main() {
  const url = process.env.POSTGRES_URL;
  if (!url) {
    throw new Error('POSTGRES_URL is not set in environment');
  }

  const sql = postgres(url, { ssl: 'require' });
  try {
    const ddl = fs.readFileSync('migrations/039_add_slot_to_future_inactivations.sql', 'utf8');
    await sql.unsafe(ddl);

    const cols = await sql.unsafe(
      "SELECT column_name FROM information_schema.columns WHERE table_name='future_inactivations' AND column_name IN ('class_day','class_start_time')"
    );

    console.log('Verified columns:', cols.map((c) => c.column_name).join(', '));
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
