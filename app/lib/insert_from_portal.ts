// app/lib/insert.ts
import postgres from "postgres";

// expects tables: students(student_id int PK?, first_name, last_name, lms_password?),
// sessions(id serial/bigint, weekday text/enum, start_time time, end_time time) unique(weekday,start_time,end_time),
// courses(course_code text PK/unique, display_name text),
// enrolments(id, student_id, session_id, course text),
// trials(id, session_id, first_name, last_name, course text, date date),
// makeups(id, student_id, session_id, course text, date date)

const sql = postgres(process.env.POSTGRES_URL!, { ssl: "require" });


function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/);
  return { first: parts[0] || "", last: parts.slice(1).join(" ") || "" };
}

export async function upsertFromNormalized(rows: any[]) {
  if (!rows.length) return { inserted: 0, updated: 0, seen: 0 };

  let seenRegular = false;
  const seenEnroll = new Set<string>();
  const seenTrials = new Set<string>();
  const seenMakeup = new Set<string>();

  await sql.begin(async (tx) => {
    // helper: get/create session by (weekday,start,end)
    async function getSessionId(weekday: string, start: string, end: string): Promise<number> {
      const [{ id }] = await tx<{ id: number }[]>`
        INSERT INTO sessions (weekday, start_time, end_time)
        VALUES (${weekday}, ${start}, ${end})
        ON CONFLICT (weekday, start_time, end_time) DO UPDATE
            SET weekday = EXCLUDED.weekday
        RETURNING id;
      `;
      return id;
    }

    for (const r of rows) {
      console.log(r.student_id, r.name, r.day, r.start_time, r.end_time, r.course_code, r.trial_date, r.makeup_date);
      const sessionId = await getSessionId(r.day, r.start_time, r.end_time);

      // student
      await tx`
        INSERT INTO students (id, name)
        VALUES (${r.student_id}, ${r.name})
        ON CONFLICT (id) DO UPDATE
          SET name = EXCLUDED.name;
      `;

      // course
      if (r.course_code) {
        await tx`
          INSERT INTO courses (id, name)
          VALUES (${r.course_code}, 'Unknown Course')
          ON CONFLICT (id) DO NOTHING;
        `;
      }

      // trial / makeup / regular enrolment
      const trial = (r.trial_date || "").toString().trim();
      const makeup = (r.makeup_date || "").toString().trim();

      if (trial) {
        seenTrials.add(`${sessionId}|${r.name}|${r.course_code}|${trial}`);
        await tx`
          INSERT INTO trials (session_id, name, course_id, date)
          VALUES (${sessionId}, ${r.name}, ${r.course_code}, ${trial}::date)
          ON CONFLICT DO NOTHING;
        `;
      } else if (makeup) {
        seenMakeup.add(`${r.student_id}|${sessionId}|${makeup}`);
        await tx`
          INSERT INTO makeups (student_id, session_id, course_id, date)
          VALUES (${r.student_id}, ${sessionId}, ${r.course_code}, ${makeup}::date)
          ON CONFLICT DO NOTHING;
        `;
      } else {
        seenRegular = true;
        seenEnroll.add(`${r.student_id}|${sessionId}`);
        await tx`
          INSERT INTO enrolments (student_id, course_id, session_id)
          VALUES (${r.student_id}, ${r.course_code}, ${sessionId})
          ON CONFLICT (student_id, session_id) DO UPDATE
            SET course_id = EXCLUDED.course_id;
        `;
      }
    }

    // Snapshot deletions (optional & guarded)
    const STRICT_SNAPSHOT = true;

    if (STRICT_SNAPSHOT && seenRegular) {
        const keys = Array.from(seenEnroll).map((k) => k.split("|"));

        const keepStudents: number[] = keys.map(([studentId]) => Number(studentId));    // ints
        const keepSessions: string[] = keys.map(([, sessionId]) => sessionId);  // uuids
        await tx`
            WITH keep AS (
                SELECT *
                FROM UNNEST(${keepStudents}::int[], ${keepSessions}::uuid[])
                AS t(student_id, session_id)  -- zip pairs correctly
            )
            DELETE FROM enrolments e
            WHERE NOT EXISTS (
                SELECT 1
                FROM keep k
                WHERE k.student_id = e.student_id
                AND k.session_id = e.session_id
            );
            `;
    }

    if (STRICT_SNAPSHOT && seenTrials.size) {
      // delete trials not seen

        const keys = Array.from(seenTrials).map((k) => k.split("|"))
        const keepSessions: string[] = keys.map(([sessionId , , , ]) => sessionId)
        const keepNames: string[] = keys.map(([, studentName, ,]) => studentName)
        const keepDate: string[] = keys.map(([ , , , trialDate]) => trialDate)

        

        await tx`
            WITH keep AS (
                SELECT *
                FROM UNNEST(${keepSessions}::uuid[], ${keepNames}::text[], ${keepDate}::date[])
                AS t(session_id, name, date)  -- zip pairs correctly
            )
            DELETE FROM trials e
            WHERE NOT EXISTS (
                SELECT 1
                FROM keep k
                WHERE k.name = e.name
                AND k.session_id = e.session_id
                AND k.date = e.date
            );
            `;
    }

    if (STRICT_SNAPSHOT && seenMakeup.size) {
      // delete makeups not seen

        const keys = Array.from(seenMakeup).map((k) => k.split("|"))
        const keepStudents: number[] = keys.map(([studentId , , ]) => Number(studentId))
        const keepSessions: string[] = keys.map(([, sessionId, ]) => sessionId)
        const keepDate: string[] = keys.map(([ , , makeupDate]) => makeupDate)

      
        await tx`
            WITH keep AS (
                SELECT *
                FROM UNNEST(${keepSessions}::uuid[], ${keepStudents}::int[], ${keepDate}::date[])
                AS t(session_id, student_id, date)  -- zip pairs correctly
            )
            DELETE FROM makeups e
            WHERE NOT EXISTS (
                SELECT 1
                FROM keep k
                WHERE k.student_id = e.student_id
                AND k.session_id = e.session_id
                AND k.date = e.date
            );
            `;
    }
  });

  return { inserted: rows.length, updated: 0, seen: rows.length };
}
