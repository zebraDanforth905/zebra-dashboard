const fs = require('fs');
const postgres = require('postgres');

async function main() {
  const url = process.env.POSTGRES_URL;
  if (!url) {
    throw new Error('POSTGRES_URL is not set in environment');
  }

  const sql = postgres(url, { ssl: 'require' });
  try {
    const ddl = fs.readFileSync('migrations/038_create_future_inactivations.sql', 'utf8');
    await sql.unsafe(ddl);

    const tables = await sql.unsafe(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = 'future_inactivations'"
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
