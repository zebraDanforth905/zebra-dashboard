// app/lib/insert.ts
import postgres from "postgres";
import { ymd, assertAligned } from "./utils";
import { normalizeAbsencesFromAttendance, PortalCustomerRow } from "./normalize";

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
    INSERT INTO sessions (weekday, start_time, end_time, is_summer)
    VALUES (${weekday}, ${start}, ${end}, FALSE)
    ON CONFLICT (start_time, end_time, weekday, is_summer)
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

      const trial = (r.trial_date || '').toString().trim();
      const makeup = (r.makeup_date || '').toString().trim();
      const defaultLoad = trial ? 2 : 1;

      // student
      await tx`
        INSERT INTO students (id, name, load)
        VALUES (${r.student_id}, ${r.name}, ${defaultLoad})
        ON CONFLICT (id) DO UPDATE
          SET name = EXCLUDED.name,
              load = CASE
                WHEN students.load IS NULL THEN EXCLUDED.load
                WHEN ${trial !== ''} AND students.load = 1 THEN 2
                ELSE students.load
              END;
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

    // Delete non-summer sessions with no students (no enrolments, trials, or makeups)
    await tx`
      DELETE FROM sessions s
      WHERE s.is_summer = FALSE
      AND NOT EXISTS (
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

// insert_camp.ts
type NormalizedCampRow = {
  student_id: number;
  student_name: string;
  dob: string;
  start_date: string;
  end_date: string;
  start_time: string;
  end_time: string;
  camp_type: 'FD' | 'PM' | 'AM';
  extended_care: boolean;
  special_needs: string;
  course_id: string;
};

async function getCampSessionId(
  tx: any,
  startDate: string,
  endDate: string,
  extendedCare: boolean,
  campType: 'FD' | 'PM' | 'AM'
): Promise<string> {
  const result = await tx<{ id: string }[]>`
    INSERT INTO camp_sessions (start_date, end_date, extended_care, camp_type)
    VALUES (${startDate}::date, ${endDate}::date, ${extendedCare}, ${campType})
    ON CONFLICT (start_date, end_date, camp_type, extended_care) 
      DO UPDATE SET extended_care = EXCLUDED.extended_care
    RETURNING id;
  `;
  return result[0].id;
}

export async function insertCampEnrolments(
  rows: NormalizedCampRow[], 
  dateRange?: { startDate: string; endDate: string }
) {
  // Determine date range - either from data or from explicit parameters
  let minDate: Date;
  let maxDate: Date;
  
  if (dateRange) {
    minDate = new Date(dateRange.startDate);
    maxDate = new Date(dateRange.endDate);
  } else if (rows.length > 0) {
    const dates = rows.map(r => new Date(r.start_date));
    minDate = new Date(Math.min(...dates.map(d => d.getTime())));
    maxDate = new Date(Math.max(...rows.map(r => new Date(r.end_date).getTime())));
  } else {
    // No data and no date range - nothing to do
    return { inserted: 0, updated: 0, seen: 0 };
  }
  
  const seenEnrolments = new Set<string>();
  let insertedCount = 0;
  let updatedCount = 0;

  await sql.begin(async (tx) => {
    for (const r of rows) {
      console.log(
        r.student_id,
        r.student_name,
        r.start_date,
        r.end_date,
        r.camp_type,
        r.extended_care
      );

      // Get or create camp session
      const campSessionId = await getCampSessionId(
        tx,
        r.start_date,
        r.end_date,
        r.extended_care,
        r.camp_type
      );

      // Update student with name, dob, and special_needs
      const dobValue = r.dob ? r.dob : null;
      await tx`
        INSERT INTO students (id, name, dob, special_needs)
        VALUES (${r.student_id}, ${r.student_name}, ${dobValue}::date, ${r.special_needs})
        ON CONFLICT (id) DO UPDATE
          SET name = EXCLUDED.name,
              dob = COALESCE(EXCLUDED.dob, students.dob),
              special_needs = EXCLUDED.special_needs;
      `;

      // Check if this student already has an enrolment for this camp week (same dates)
      // Delete any duplicate enrolments for the same student in overlapping camp sessions
      await tx`
        DELETE FROM camp_enrolments ce
        WHERE ce.student_id = ${r.student_id}
        AND EXISTS (
          SELECT 1 FROM camp_sessions cs
          WHERE cs.id = ce.camp_session_id
          AND cs.start_date = ${r.start_date}::date
          AND cs.end_date = ${r.end_date}::date
          AND ce.camp_session_id != ${campSessionId}::uuid
        );
      `;

      // Insert or update camp enrolment
      seenEnrolments.add(`${r.student_id}|${campSessionId}`);
      
      // Handle course_id: create course if it doesn't exist
      let courseId = null;
      if (r.course_id && r.course_id.trim() !== '') {
        const trimmedCourseId = r.course_id.trim();
        
        // Check if course exists, if not create it
        await tx`
          INSERT INTO courses (id, name)
          VALUES (${trimmedCourseId}, ${trimmedCourseId})
          ON CONFLICT (id) DO NOTHING
        `;
        
        courseId = trimmedCourseId;
      }
      
      const result = await tx`
        INSERT INTO camp_enrolments (student_id, camp_session_id, course_id)
        VALUES (${r.student_id}, ${campSessionId}::uuid, ${courseId})
        ON CONFLICT (student_id, camp_session_id) DO UPDATE
          SET course_id = EXCLUDED.course_id
        RETURNING (xmax = 0) AS inserted;
      `;
      
      if (result[0].inserted) {
        insertedCount++;
      } else {
        updatedCount++;
      }
    }

    // Delete enrolments within the scraped date range that are not in the current data
    // This runs even if no rows were scraped, allowing deletion of all enrolments in the range
    const keys = Array.from(seenEnrolments).map((k) => k.split("|"));
    const keepStudents: number[] = keys.map(([studentId]) => Number(studentId));
    const keepSessions: string[] = keys.map(([, sessionId]) => sessionId);

    if (seenEnrolments.size > 0) {
      await tx`
        WITH keep AS (
          SELECT *
          FROM UNNEST(${keepStudents}::int[], ${keepSessions}::uuid[])
          AS t(student_id, camp_session_id)
        )
        DELETE FROM camp_enrolments e
        WHERE EXISTS (
          SELECT 1 FROM camp_sessions cs
          WHERE cs.id = e.camp_session_id
          AND cs.start_date >= ${minDate.toISOString().split('T')[0]}::date
          AND cs.end_date <= ${maxDate.toISOString().split('T')[0]}::date
        )
        AND NOT EXISTS (
          SELECT 1
          FROM keep k
          WHERE k.student_id = e.student_id
            AND k.camp_session_id = e.camp_session_id
        );
      `;
    } else {
      // No enrolments in scraped data - delete all enrolments in the date range
      await tx`
        DELETE FROM camp_enrolments e
        WHERE EXISTS (
          SELECT 1 FROM camp_sessions cs
          WHERE cs.id = e.camp_session_id
          AND cs.start_date >= ${minDate.toISOString().split('T')[0]}::date
          AND cs.end_date <= ${maxDate.toISOString().split('T')[0]}::date
        );
      `;
    }

    // Delete camp sessions with no enrolments
    await tx`
      DELETE FROM camp_sessions cs
      WHERE NOT EXISTS (
        SELECT 1 FROM camp_enrolments ce WHERE ce.camp_session_id = cs.id
      );
    `;
  });

  return { inserted: insertedCount, updated: updatedCount, seen: rows.length };
}

// ── Customer sync ─────────────────────────────────────────────────────────────

// Upserts customer records from portal parent data and links unassigned students.
// Uses portal_parent_id as the stable conflict key.
// Only links students that currently have no customer_id (never overrides manual assignments).
export async function syncCustomers(customers: PortalCustomerRow[]): Promise<{ upserted: number; linked: number }> {
  if (!customers.length) return { upserted: 0, linked: 0 };

  let upserted = 0;
  let linked = 0;

  await sql.begin(async tx => {
    for (const c of customers) {
      const rows = await tx<{ id: string }[]>`
        INSERT INTO customers (name, email, alternate_email, alternate_name, portal_parent_id)
        VALUES (
          ${c.name},
          ${c.email},
          ${c.alternate_email},
          ${c.alternate_name},
          ${c.portal_parent_id}
        )
        ON CONFLICT (portal_parent_id) WHERE portal_parent_id IS NOT NULL
        DO UPDATE SET
          name            = EXCLUDED.name,
          email           = EXCLUDED.email,
          alternate_email = COALESCE(EXCLUDED.alternate_email, customers.alternate_email),
          alternate_name  = COALESCE(customers.alternate_name, EXCLUDED.alternate_name)
        RETURNING id
      `;
      if (!rows.length) continue;
      upserted++;

      const customerId = rows[0].id;

      if (c.student_ids.length > 0) {
        const result = await tx<{ id: string }[]>`
          UPDATE students
          SET customer_id = ${customerId}::uuid
          WHERE id = ANY(${c.student_ids}::numeric[])
            AND customer_id IS NULL
          RETURNING id
        `;
        linked += result.length;

        // If none of this parent's students were unlinked, they may already belong to
        // a co-parent's customer row. Detect that case and bridge this parent's contact
        // info onto the primary record as alternate contact data.
        if (result.length === 0) {
          const others = await tx<{ customer_id: string }[]>`
            SELECT DISTINCT customer_id
            FROM students
            WHERE id = ANY(${c.student_ids}::numeric[])
              AND customer_id IS NOT NULL
              AND customer_id != ${customerId}::uuid
          `;
          if (others.length === 1) {
            const primaryId = others[0].customer_id;
            // Bridge secondary → primary
            await tx`
              UPDATE customers
              SET
                alternate_email = COALESCE(alternate_email, ${c.email}),
                alternate_name  = COALESCE(alternate_name,  ${c.name})
              WHERE id = ${primaryId}::uuid
            `;
            // Bridge primary → secondary (so both rows know about each other)
            const primary = await tx<{ name: string; email: string }[]>`
              SELECT name, email FROM customers WHERE id = ${primaryId}::uuid
            `;
            if (primary.length > 0) {
              await tx`
                UPDATE customers
                SET
                  alternate_email = COALESCE(alternate_email, ${primary[0].email}),
                  alternate_name  = COALESCE(alternate_name,  ${primary[0].name})
                WHERE id = ${customerId}::uuid
              `;
            }
          }
        }
      }
    }
  });

  return { upserted, linked };
}
