const fs = require('fs');
const postgres = require('postgres');

async function main() {
  const url = process.env.POSTGRES_URL;
  if (!url) {
    throw new Error('POSTGRES_URL is not set in environment');
  }

  const sql = postgres(url, { ssl: 'require' });
  try {
    const ddl = fs.readFileSync('migrations/040_restore_seat_assignments_per_day.sql', 'utf8');
    await sql.unsafe(ddl);

    const constraints = await sql.unsafe(
      "SELECT conname FROM pg_constraint WHERE conrelid = 'seat_assignments'::regclass AND contype = 'p'"
    );

    console.log('Primary key constraints on seat_assignments:', constraints.map((c) => c.conname).join(', '));
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
