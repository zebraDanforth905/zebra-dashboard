// app/seed/route.ts
import postgres from 'postgres';
import {users} from '../lib/test-data';
import bcrypt from 'bcrypt';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

export async function GET() {
  try {
    await sql.begin(async (tx) => {
      // 1) One-time setup (no parallel DDL)
      await tx`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`;

      await tx`
        CREATE TABLE IF NOT EXISTS users (
          id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          email TEXT NOT NULL UNIQUE,
          password TEXT NOT NULL
        );
      `;

      // 2) Inserts (you can parallelize per-table rows)
      for (const u of users) {
        const hashed = await bcrypt.hash(u.password, 10);
        await tx`
          INSERT INTO users (id, name, email, password)
          VALUES (${u.id}, ${u.name}, ${u.email}, ${hashed})
          ON CONFLICT (id) DO NOTHING;
        `;
      }

    });

    return Response.json({ message: 'Database seeded successfully' });
  } catch (err: any) {
    return Response.json({ error: String(err?.message ?? err) }, { status: 500 });
  }
}
