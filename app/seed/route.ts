// app/seed/route.ts
import postgres from 'postgres';
import {customers, users, invoices, payments, students, sessions, enrolments, courses} from '../lib/test-data';
import bcrypt from 'bcrypt';
import { revalidatePath } from 'next/cache';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

export async function GET() {
  try {
    await sql.begin(async (tx) => {
      // 1) One-time setup (no parallel DDL)
      await tx`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`;
      // await tx`DROP TABLE IF EXISTS payments`;
      // await tx`DROP TABLE IF EXISTS invoices`;
      // await tx`DROP TABLE IF EXISTS students`; 
      // await tx`DROP TABLE IF EXISTS customers`;
      // await tx`DROP TABLE IF EXISTS users`;
      
      // await tx`
      // CREATE TABLE IF NOT EXISTS recurring_invoices (
      //   id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
      //   customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
      //   day_of_month NUMERIC(10, 2) NOT NULL,
      //   every NUMERIC (10, 2) NOT NULL,
      //   start_date DATE NOT NULL,
      //   end_after NUMERIC(10, 2)
      // );`;

      // await tx`
      //   CREATE TABLE IF NOT EXISTS users (
      //     id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
      //     name VARCHAR(255) NOT NULL,
      //     email TEXT NOT NULL,
      //     password TEXT NOT NULL
      //   );
      // `;

      // await tx`
      //   CREATE TABLE IF NOT EXISTS customers (
      //     id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
      //     name VARCHAR(255) NOT NULL,
      //     email TEXT NOT NULL
      //   );
      // `;

      // await tx`
      //   CREATE TABLE IF NOT EXISTS students (
      //     id NUMERIC(10, 2) PRIMARY KEY,
      //     name VARCHAR(255) NOT NULL,
      //     customer_id UUID REFERENCES customers(id) ON DELETE CASCADE
      //   );
      // `;

      // const cols = await tx`
      //   SELECT column_name, data_type
      //   FROM information_schema.columns
      //   WHERE table_schema = 'public' AND table_name = 'students'
      //   ORDER BY ordinal_position;
      // `;

      // await tx`
      //   CREATE TABLE IF NOT EXISTS invoices (
      //     id UUID DEFAULT (uuid_generate_v4()) PRIMARY KEY,
      //     customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
      //     amount NUMERIC(10, 2) NOT NULL,
      //     date DATE NOT NULL
      //   );
      // `;

      // await tx`
      //   CREATE TABLE IF NOT EXISTS payments (
      //     id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
      //     customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
      //     amount NUMERIC(10, 2) NOT NULL,
      //     date DATE NOT NULL,
      //     status VARCHAR(255) NOT NULL
      //   );
      // `;

      // await tx`CREATE TABLE IF NOT EXISTS enrolments (
      //   id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
      //   student_id NUMERIC(10, 2) REFERENCES students(id) ON DELETE CASCADE,
      //   course_id VARCHAR(255) REFERENCES courses(id) ON DELETE CASCADE,
      //   session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
      //   start_date DATE DEFAULT CURRENT_DATE
      // );`;

      // await tx`CREATE TABLE IF NOT EXISTS pickups (
      //   id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
      //   student_id NUMERIC(10, 2) REFERENCES students(id) ON DELETE CASCADE,
      //   weekday VARCHAR(20) NOT NULL,
      //   waiver_signed BOOLEAN NOT NULL,
      //   school_name VARCHAR(255) NOT NULL,
      //   teacher_name VARCHAR(255) NOT NULL,
      //   room_number NUMERIC(10, 2) NOT NULL
      // );`;

      // await tx`CREATE TABLE IF NOT EXISTS courses (
      //   id VARCHAR(255) PRIMARY KEY,
      //   name VARCHAR(255) NOT NULL,
      //   description TEXT
      // );`;

      // await tx`CREATE TABLE IF NOT EXISTS sessions (
      //   id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
      //   start_time TIME NOT NULL,
      //   end_time TIME NOT NULL,
      //   weekday VARCHAR(20) NOT NULL
      // );`;

      // await tx`CREATE TABLE IF NOT EXISTS trials (
      //   id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
      //   name TEXT,
      //   session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
      //   course_id VARCHAR(255) REFERENCES courses(id) ON DELETE CASCADE,
      //   date DATE
      // );
      // `;

      // await tx`CREATE TABLE IF NOT EXISTS makeups (
      //   id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
      //   student_id NUMERIC(10, 2) REFERENCES students(id) ON DELETE CASCADE,
      //   session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
      //   course_id VARCHAR(255) REFERENCES courses(id) ON DELETE CASCADE,
      //   date DATE
      // );
      // `;


      // // // 2) Inserts (you can parallelize per-table rows)
      for (const u of users) {
        const hashed = await bcrypt.hash(u.password, 10);

        await tx`
          INSERT INTO users (name, email, password)
          VALUES (${u.name}, ${u.email}, ${hashed})
          ON CONFLICT (id) DO NOTHING;
        `;
      }
      // for (const c of customers) {
      //   await tx`
      //     INSERT INTO customers (name, email)
      //     VALUES (${c.name}, ${c.email})
      //     ON CONFLICT (id) DO NOTHING;
      //   `;
      // }

      // for (const i of invoices) {
      //   await tx`
      //     INSERT INTO invoices (customer_id, amount, date)
      //     VALUES (${i.customer_id}, ${i.amount}, ${i.date});
      //   `;
      // } 
      // for (const p of payments) {
      //   await tx`
      //     INSERT INTO payments (customer_id, amount, date, status)
      //     VALUES (${p.customer_id}, ${p.amount}, ${p.date}, ${p.status});
      //   `;
      // }

      // for (const s of students) {
      //   await tx`
      //     INSERT INTO students (id, name, customer_id)
      //     VALUES (${s.student_id}, ${s.first_name + " " + s.last_name}, NULL)
      //     ON CONFLICT (id) DO NOTHING;
      //   `;
      // }

      // for (const s of sessions) {
      //   await tx`
      //     INSERT INTO sessions (start_time, end_time, weekday)
      //     VALUES (${s.start_time}, ${s.end_time}, ${s.weekday}) 
      //     ON CONFLICT (id) DO NOTHING;
      //   `;
      // }

      // for (const c of courses) {
      //   await tx`
      //     INSERT INTO courses (id, name, description)
      //     VALUES (${c.course_code}, ${c.display_name}, NULL) 
      //     ON CONFLICT (id) DO NOTHING;
      //   `;
      // }

      // for (const e of enrolments) {
      //   await tx`
      //     INSERT INTO enrolments (student_id, course_id, session_id)
      //     VALUES (${e.student_id}, ${e.course}, NULL) 
      //     ON CONFLICT (id) DO NOTHING;
      //   `;
      // }
    });

    revalidatePath('/dashboard/billing');

    return Response.json({ message: 'Database seeded successfully' });
  } catch (err: any) {
    return Response.json({ error: String(err?.message ?? err) }, { status: 500 });
  }
}
