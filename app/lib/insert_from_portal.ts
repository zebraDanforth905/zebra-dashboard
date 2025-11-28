// app/lib/insert.ts
import postgres from "postgres";
import { ymd, assertAligned } from "./utils";
import { normalizeAbsencesFromAttendance } from "./normalize";

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

async function getSessionId(tx: any, weekday: string, start: string, end: string): Promise<string> {
  const [{ id }] = await tx<{ id: string }[]>`
    INSERT INTO sessions (weekday, start_time, end_time)
    VALUES (${weekday}, ${start}, ${end})
    ON CONFLICT (weekday, start_time, end_time)
      DO UPDATE SET weekday = EXCLUDED.weekday
    RETURNING id;
  `;
  return id;
}

export async function upsertEnrolmentFromNormalized(rows: any[]) {
  
  if (!rows.length) return { inserted: 0, updated: 0, seen: 0 };

  let seenRegular = false;
  const seenEnroll = new Set<string>();
  const seenTrials = new Set<string>();
  const seenMakeup = new Set<string>();

  await sql.begin(async (tx) => {

    for (const r of rows) {
      console.log(r.student_id, r.name, r.day, r.start_date, r.end_date, r.start_time, r.end_time, r.course_code, r.trial_date, r.makeup_date);
      const sessionId = await getSessionId(tx, r.day, r.start_time, r.end_time);

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
          INSERT INTO enrolments (student_id, course_id, session_id, start_date, end_date)
          VALUES (${r.student_id}, ${r.course_code}, ${sessionId}, ${r.start_date}::date, ${r.end_date}::date)
          ON CONFLICT (student_id, session_id) DO UPDATE
            SET course_id = EXCLUDED.course_id, start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date;
        `;
      }
    }

    // Snapshot deletions (optional & guarded)
    const STRICT_SNAPSHOT = true;

    if (STRICT_SNAPSHOT && seenRegular) {
        const keys = Array.from(seenEnroll).map((k) => k.split("|"));

        const keepStudents: number[] = keys.map(([studentId]) => Number(studentId));    // ints
        const keepSessions: string[] = keys.map(([, sessionId]) => sessionId);  // uuids
        
        // First, delete absences for enrolments that will be deleted
        await tx`
            WITH keep AS (
                SELECT *
                FROM UNNEST(${keepStudents}::int[], ${keepSessions}::uuid[])
                AS t(student_id, session_id)
            )
            DELETE FROM absences
            WHERE enrolment_id IN (
                SELECT e.id
                FROM enrolments e
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM keep k
                    WHERE k.student_id = e.student_id
                    AND k.session_id = e.session_id
                )
            );
        `;
        
        // Then delete the enrolments
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
            ),
            trials_to_delete AS (
                SELECT e.id
                FROM trials e
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM keep k
                    WHERE k.name = e.name
                    AND k.session_id = e.session_id
                    AND k.date = e.date
                )
            )
            DELETE FROM trial_notes
            WHERE trial_id IN (SELECT id FROM trials_to_delete);
            `;

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

    // Delete sessions with no students (no enrolments, trials, or makeups)
    await tx`
      DELETE FROM sessions s
      WHERE NOT EXISTS (
        SELECT 1 FROM enrolments e WHERE e.session_id = s.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM trials t WHERE t.session_id = s.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM makeups m WHERE m.session_id = s.id
      );
    `;
  });

  return { inserted: rows.length, updated: 0, seen: rows.length };
}

// enrolment_resolver.ts
type Pair = { student_id: number; session_id: string };

export async function resolveEnrolmentIds(
  tx: any,
  pairs: Pair[]
): Promise<Map<string, string>> {
  if (!pairs.length) return new Map();

  // dedupe pairs
  const uniqKey = (p: Pair) => `${Number(p.student_id)}|${p.session_id}`;
  const uniq = Array.from(new Map(pairs.map(p => [uniqKey(p), p])).values());

  const studentIds = uniq.map(p => Number(p.student_id));
  const sessionIds = uniq.map(p => p.session_id);

  const rows = await tx<{ id: string; student_id: number; session_id: string }[]>`
    WITH q AS (
      SELECT *
      FROM UNNEST(
        ${studentIds}::numeric[],  -- enrolments.student_id is NUMERIC(10,2)
        ${sessionIds}::uuid[]
      ) AS t(student_id, session_id)
    )
    SELECT e.id, e.student_id::numeric AS student_id, e.session_id::uuid AS session_id
    FROM enrolments e
    JOIN q ON q.student_id = e.student_id AND q.session_id = e.session_id
  `;

  const map = new Map<string, string>();
  for (const r of rows) map.set(`${Number(r.student_id)}|${r.session_id}`, r.id);
  return map;
}

// upsert_absences.ts

export async function upsertAbsences(
  tx: any,
  enrolmentIds: string[],
  dates: string[]
) {
  if (!enrolmentIds.length) return;
  assertAligned("upsertAbsences", { enrolmentIds, dates });

  await tx`
    WITH new_rows AS (
      SELECT *
      FROM UNNEST(
        ${enrolmentIds}::uuid[],
        ${dates}::date[]
      ) AS t(enrolment_id, date)
    )
    INSERT INTO absences (enrolment_id, date)
    SELECT enrolment_id, date
    FROM new_rows
    ON CONFLICT (enrolment_id, date) DO NOTHING;
  `;
}


export async function deleteAbsencesNotSeen(
  tx: any,
  enrolmentIds: string[],
  dates: string[],
  startDate: string,
  endDate: string
) {
  if (!enrolmentIds.length) return;
  assertAligned("deleteAbsencesNotSeen", { enrolmentIds, dates });

  const scopeEnrolments = Array.from(new Set(enrolmentIds));

  await tx`
    WITH keep AS (
      SELECT *
      FROM UNNEST(
        ${enrolmentIds}::uuid[],
        ${dates}::date[]
      ) AS t(enrolment_id, date)
    )
    DELETE FROM absences a
    WHERE a.date BETWEEN ${ymd(startDate)}::date AND ${ymd(endDate)}::date
      AND a.enrolment_id = ANY(${scopeEnrolments}::uuid[])
      AND NOT EXISTS (
        SELECT 1
        FROM keep k
        WHERE k.enrolment_id = a.enrolment_id
          AND k.date = a.date
      );
  `;
}

type AttendanceApiRow = any; // your raw attendance result type

export async function syncAbsencesForRange(opts: {
  attendanceResults: AttendanceApiRow[];
  startDate: string | Date;          // inclusive
  endDate: string | Date;            // inclusive
}) {

  
  const { attendanceResults } = opts;
  const start = ymd(opts.startDate);
  const end   = ymd(opts.endDate);


  const rows = attendanceResults.filter(r => r.date >= start && r.date <= end);


  
  if (rows.length == 0) return {inserted: 0, seen: 0};

  return await sql.begin(async (tx: any) => {
    // 1) resolve session ids (cache by weekday|start|end)
    const sessMap = new Map<string, string>();
    for (const r of rows) {
      const key = `${r.weekday}|${r.start_time}|${r.end_time}`;
      if (!sessMap.has(key)) {
        const sid = await getSessionId(tx, r.weekday, r.start_time, r.end_time);
        sessMap.set(key, sid);
      }
    }

    const pairs = rows.map(r => {
      const key = `${r.weekday}|${r.start_time}|${r.end_time}`;
      const session_id = sessMap.get(key)!;
    
      return { student_id: Number(r.student_id), session_id };
    });

  
    const enrolMap = await resolveEnrolmentIds(tx, pairs);

    

 
    const enrolmentIds: string[] = [];
    const dates: string[] = [];

  

    for (const r of rows) {
      const sessKey = `${r.weekday}|${r.start_time}|${r.end_time}`;
      const session_id = sessMap.get(sessKey)!;
      const enrolKey = `${Number(r.student_id)}|${session_id}`;

      const enrolment_id = enrolMap.get(enrolKey);
  

      if (!enrolment_id) {
        
       
        continue;
      }
      enrolmentIds.push(enrolment_id);
      dates.push(ymd(r.date));
    }


    if (!enrolmentIds.length) return {inserted: 0, seen: rows.length};


    try {
      await tx`
        WITH new_rows AS (
          SELECT *
          FROM UNNEST(
            ${enrolmentIds}::uuid[],
            ${dates}::date[]
          ) AS t(enrolment_id, date)
        )
        INSERT INTO absences (enrolment_id, date)
        SELECT enrolment_id, date
        FROM new_rows
        ON CONFLICT (enrolment_id, date) DO NOTHING;
      `;
    } catch (e){
        console.error("error upserting snapshot", e)
    }
    

    console.log("5) delete-not-seen within range, scoped to the enrolments we just touched")
    await deleteAbsencesNotSeen(tx, enrolmentIds, dates, start, end);

    return {inserted: enrolmentIds.length, seen: rows.length};
  });
}




