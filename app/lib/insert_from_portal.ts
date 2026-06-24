// app/lib/insert.ts
import postgres from "postgres";
import { ymd, assertAligned } from "./utils";
import { PortalCustomerRow } from "./normalize";
import { fetchFamilyView } from "./scraper_helpers";
import { isSummerDateRange } from "./tdsb-calendar";

// expects tables: students(student_id int PK?, first_name, last_name, lms_password?),
// sessions(id serial/bigint, weekday text/enum, start_time time, end_time time) unique(weekday,start_time,end_time),
// courses(course_code text PK/unique, display_name text),
// enrolments(id, student_id, session_id, course text),
// trials(id, session_id, first_name, last_name, course text, date date),
// makeups(id, student_id, session_id, course text, date date)

const sql = postgres(process.env.POSTGRES_URL!, { ssl: "require" });
type DbTx = typeof sql;

type PortalTx = postgres.TransactionSql<Record<string, never>>;

type NormalizedPortalEnrolmentRow = {
  day: string;
  start_date: string;
  end_date: string | null;
  start_time: string;
  end_time: string | null;
  student_id: number;
  name: string;
  course_code: string;
  trial_date: string;
  makeup_date: string;
  is_summer?: boolean;
};


function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/);
  return { first: parts[0] || "", last: parts.slice(1).join(" ") || "" };
}

async function getSessionId(tx: PortalTx, weekday: string, start: string, end: string | null, isSummer = false): Promise<string> {
  const [{ id }] = await tx<{ id: string }[]>`
    INSERT INTO sessions (weekday, start_time, end_time, is_summer)
    VALUES (${weekday}, ${start}, ${end}, ${isSummer})
    ON CONFLICT (start_time, end_time, weekday, is_summer)
      DO UPDATE SET weekday = EXCLUDED.weekday
    RETURNING id;
  `;
  return id;
}

async function getExistingSummerSessionId(tx: PortalTx, weekday: string, start: string, end: string | null): Promise<string | null> {
  const rows = await tx<{ id: string }[]>`
    SELECT id::text
    FROM sessions
    WHERE weekday = ${weekday}
      AND start_time = ${start}::time
      AND (
        (${end}::time IS NULL AND end_time IS NULL)
        OR end_time = ${end}::time
      )
      AND is_summer = TRUE
    LIMIT 1;
  `;
  return rows[0]?.id ?? null;
}

export async function upsertSummerEnrolmentWeekFromNormalized(
  rows: NormalizedPortalEnrolmentRow[],
  range: { startDate: string; endDate: string; day?: string },
) {
  if (!rows.length) return { inserted: 0, updated: 0, seen: 0, skipped_non_summer: 0 };

  let seenRegular = false;
  let skippedNonSummer = 0;
  const cleanupDay = range.day && range.day !== "All" ? range.day : null;
  const seenEnroll = new Set<string>();
  const seenTrials = new Set<string>();
  const seenMakeup = new Set<string>();

  await sql.begin(async (tx) => {
    for (const r of rows) {
      const sessionId = await getExistingSummerSessionId(tx, r.day, r.start_time, r.end_time);
      if (!sessionId) {
        skippedNonSummer += 1;
        continue;
      }

      const trial = (r.trial_date || '').toString().trim();
      const makeup = (r.makeup_date || '').toString().trim();
      const defaultLoad = trial ? 2 : 1;

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

      if (r.course_code) {
        await tx`
          INSERT INTO courses (id, name)
          VALUES (${r.course_code}, 'Unknown Course')
          ON CONFLICT (id) DO NOTHING;
        `;
      }

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

    if (seenRegular) {
      const keys = Array.from(seenEnroll).map((k) => k.split("|"));
      const keepStudents: number[] = keys.map(([studentId]) => Number(studentId));
      const keepSessions: string[] = keys.map(([, sessionId]) => sessionId);

      await tx`
        WITH keep AS (
          SELECT *
          FROM UNNEST(${keepStudents}::int[], ${keepSessions}::uuid[])
          AS t(student_id, session_id)
        ),
        enrolments_to_delete AS (
          SELECT e.id
          FROM enrolments e
          JOIN sessions s ON s.id = e.session_id
          WHERE s.is_summer = TRUE
            AND (${cleanupDay}::text IS NULL OR s.weekday = ${cleanupDay})
            AND (e.start_date IS NULL OR e.start_date <= ${range.endDate}::date)
            AND (e.end_date IS NULL OR e.end_date >= ${range.startDate}::date)
            AND NOT EXISTS (
              SELECT 1
              FROM keep k
              WHERE k.student_id = e.student_id
                AND k.session_id = e.session_id
            )
        )
        DELETE FROM absences
        WHERE enrolment_id IN (SELECT id FROM enrolments_to_delete);
      `;

      await tx`
        WITH keep AS (
          SELECT *
          FROM UNNEST(${keepStudents}::int[], ${keepSessions}::uuid[])
          AS t(student_id, session_id)
        )
        DELETE FROM enrolments e
        USING sessions s
        WHERE s.id = e.session_id
          AND s.is_summer = TRUE
          AND (${cleanupDay}::text IS NULL OR s.weekday = ${cleanupDay})
          AND (e.start_date IS NULL OR e.start_date <= ${range.endDate}::date)
          AND (e.end_date IS NULL OR e.end_date >= ${range.startDate}::date)
          AND NOT EXISTS (
            SELECT 1
            FROM keep k
            WHERE k.student_id = e.student_id
              AND k.session_id = e.session_id
          );
      `;
    }

    if (seenTrials.size) {
      const keys = Array.from(seenTrials).map((k) => k.split("|"));
      const keepSessions: string[] = keys.map(([sessionId]) => sessionId);
      const keepNames: string[] = keys.map(([, studentName]) => studentName);
      const keepDate: string[] = keys.map(([, , , trialDate]) => trialDate);

      await tx`
        WITH keep AS (
          SELECT *
          FROM UNNEST(${keepSessions}::uuid[], ${keepNames}::text[], ${keepDate}::date[])
          AS t(session_id, name, date)
        ),
        trials_to_delete AS (
          SELECT t.id
          FROM trials t
          JOIN sessions s ON s.id = t.session_id
          WHERE s.is_summer = TRUE
            AND (${cleanupDay}::text IS NULL OR s.weekday = ${cleanupDay})
            AND t.date BETWEEN ${range.startDate}::date AND ${range.endDate}::date
            AND NOT EXISTS (
              SELECT 1
              FROM keep k
              WHERE k.name = t.name
                AND k.session_id = t.session_id
                AND k.date = t.date
            )
        )
        DELETE FROM trial_notes
        WHERE trial_id IN (SELECT id FROM trials_to_delete);
      `;

      await tx`
        WITH keep AS (
          SELECT *
          FROM UNNEST(${keepSessions}::uuid[], ${keepNames}::text[], ${keepDate}::date[])
          AS t(session_id, name, date)
        )
        DELETE FROM trials t
        USING sessions s
        WHERE s.id = t.session_id
          AND s.is_summer = TRUE
          AND (${cleanupDay}::text IS NULL OR s.weekday = ${cleanupDay})
          AND t.date BETWEEN ${range.startDate}::date AND ${range.endDate}::date
          AND NOT EXISTS (
            SELECT 1
            FROM keep k
            WHERE k.name = t.name
              AND k.session_id = t.session_id
              AND k.date = t.date
          );
      `;
    }

    if (seenMakeup.size) {
      const keys = Array.from(seenMakeup).map((k) => k.split("|"));
      const keepStudents: number[] = keys.map(([studentId]) => Number(studentId));
      const keepSessions: string[] = keys.map(([, sessionId]) => sessionId);
      const keepDate: string[] = keys.map(([, , makeupDate]) => makeupDate);

      await tx`
        WITH keep AS (
          SELECT *
          FROM UNNEST(${keepSessions}::uuid[], ${keepStudents}::int[], ${keepDate}::date[])
          AS t(session_id, student_id, date)
        )
        DELETE FROM makeups m
        USING sessions s
        WHERE s.id = m.session_id
          AND s.is_summer = TRUE
          AND (${cleanupDay}::text IS NULL OR s.weekday = ${cleanupDay})
          AND m.date BETWEEN ${range.startDate}::date AND ${range.endDate}::date
          AND NOT EXISTS (
            SELECT 1
            FROM keep k
            WHERE k.student_id = m.student_id
              AND k.session_id = m.session_id
              AND k.date = m.date
          );
      `;
    }
  });

  return {
    inserted: rows.length - skippedNonSummer,
    updated: 0,
    seen: rows.length,
    skipped_non_summer: skippedNonSummer,
  };
}

export async function upsertEnrolmentFromNormalized(rows: NormalizedPortalEnrolmentRow[]) {
  
  if (!rows.length) return { inserted: 0, updated: 0, seen: 0 };

  let seenRegular = false;
  const regularStudentIds = new Set<number>();
  const knownStudentExists = new Map<number, boolean>();

  for (const r of rows) {
    const trial = (r.trial_date || '').toString().trim();
    const makeup = (r.makeup_date || '').toString().trim();
    if (!trial && !makeup) {
      regularStudentIds.add(Number(r.student_id));
    }
  }

  const seenEnroll = new Set<string>();
  const seenTrials = new Set<string>();
  const seenMakeup = new Set<string>();

  await sql.begin(async (tx) => {

    for (const r of rows) {
      const isSummer = r.is_summer === true;
      console.log(r.student_id, r.name, r.day, r.start_date, r.end_date, r.start_time, r.end_time, r.course_code, r.trial_date, r.makeup_date, isSummer);
      const sessionId = await getSessionId(tx, r.day, r.start_time, r.end_time, isSummer);

      const trial = (r.trial_date || '').toString().trim();
      const makeup = (r.makeup_date || '').toString().trim();
      const isRegular = !trial && !makeup;

      // Only persist students on real enrolments.
      if (isRegular) {
        await tx`
          INSERT INTO students (id, name, load)
          VALUES (${r.student_id}, ${r.name}, 1)
          ON CONFLICT (id) DO UPDATE
            SET name = EXCLUDED.name,
                load = COALESCE(students.load, EXCLUDED.load);
        `;
      }

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
        let canCreateMakeup = regularStudentIds.has(Number(r.student_id));

        if (!canCreateMakeup) {
          const cachedExists = knownStudentExists.get(Number(r.student_id));
          if (cachedExists !== undefined) {
            canCreateMakeup = cachedExists;
          } else {
            const existingStudent = await tx<{ exists: boolean }[]>`
              SELECT EXISTS (
                SELECT 1
                FROM students s
                WHERE s.id = ${r.student_id}
              ) AS exists;
            `;
            canCreateMakeup = existingStudent[0]?.exists === true;
            knownStudentExists.set(Number(r.student_id), canCreateMakeup);
          }
        }

        if (canCreateMakeup) {
          seenMakeup.add(`${r.student_id}|${sessionId}|${makeup}`);
          await tx`
            INSERT INTO makeups (student_id, session_id, course_id, date)
            VALUES (${r.student_id}, ${sessionId}, ${r.course_code}, ${makeup}::date)
            ON CONFLICT DO NOTHING;
          `;
        }
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

    // Strict enrolment reconciliation (optional & guarded)
    const STRICT_SNAPSHOT = true;

    const seenNonSummerRegular = rows.some((r) => !r.trial_date && !r.makeup_date && r.is_summer !== true);

    if (STRICT_SNAPSHOT && seenRegular && seenNonSummerRegular) {
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
                JOIN sessions se ON se.id = e.session_id
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM keep k
                    WHERE k.student_id = e.student_id
                    AND k.session_id = e.session_id
                )
                AND se.is_summer = FALSE
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
            USING sessions se
            WHERE se.id = e.session_id
            AND se.is_summer = FALSE
            AND NOT EXISTS (
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
  tx: DbTx,
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
  tx: DbTx,
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
  tx: PortalTx,
  scopeEnrolmentIds: string[],
  scopeDates: string[],
  absentEnrolmentIds: string[],
  absentDates: string[],
  startDate: string,
  endDate: string
) {
  if (!scopeEnrolmentIds.length) return;
  assertAligned("deleteAbsencesNotSeen scope", { scopeEnrolmentIds, scopeDates });
  assertAligned("deleteAbsencesNotSeen absent", { absentEnrolmentIds, absentDates });

  await tx`
    WITH scope AS (
      SELECT *
      FROM UNNEST(
        ${scopeEnrolmentIds}::uuid[],
        ${scopeDates}::date[]
      ) AS t(enrolment_id, date)
    ),
    keep AS (
      SELECT *
      FROM UNNEST(
        ${absentEnrolmentIds}::uuid[],
        ${absentDates}::date[]
      ) AS t(enrolment_id, date)
    )
    DELETE FROM absences a
    WHERE a.date BETWEEN ${ymd(startDate)}::date AND ${ymd(endDate)}::date
      AND EXISTS (
        SELECT 1
        FROM scope s
        WHERE s.enrolment_id = a.enrolment_id
          AND s.date = a.date
      )
      AND NOT EXISTS (
        SELECT 1
        FROM keep k
        WHERE k.enrolment_id = a.enrolment_id
          AND k.date = a.date
      );
  `;
}

type AttendanceApiRow = {
  date: string;
  weekday: string;
  start_time: string;
  end_time: string;
  student_id: number | string;
  is_absent: boolean;
};

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

  return await sql.begin(async (tx) => {
    // 1) resolve session ids (cache by weekday|start|end)
    const sessMap = new Map<string, string>();
    for (const r of rows) {
      const isSummer = isSummerDateRange(r.date, r.date);
      const key = `${r.weekday}|${r.start_time}|${r.end_time}|${isSummer}`;
      if (!sessMap.has(key)) {
        const sid = await getSessionId(tx, r.weekday, r.start_time, r.end_time, isSummer);
        sessMap.set(key, sid);
      }
    }

    const pairs = rows.map(r => {
      const key = `${r.weekday}|${r.start_time}|${r.end_time}|${isSummerDateRange(r.date, r.date)}`;
      const session_id = sessMap.get(key)!;
    
      return { student_id: Number(r.student_id), session_id };
    });

  
    const enrolMap = await resolveEnrolmentIds(tx, pairs);

    

    const scopeEnrolmentIds: string[] = [];
    const scopeDates: string[] = [];
    const absentEnrolmentIds: string[] = [];
    const absentDates: string[] = [];

  

    for (const r of rows) {
      const sessKey = `${r.weekday}|${r.start_time}|${r.end_time}|${isSummerDateRange(r.date, r.date)}`;
      const session_id = sessMap.get(sessKey)!;
      const enrolKey = `${Number(r.student_id)}|${session_id}`;

      const enrolment_id = enrolMap.get(enrolKey);
  

      if (!enrolment_id) {
        
       
        continue;
      }
      const date = ymd(r.date);
      scopeEnrolmentIds.push(enrolment_id);
      scopeDates.push(date);

      if (r.is_absent) {
        absentEnrolmentIds.push(enrolment_id);
        absentDates.push(date);
      }
    }


    if (!scopeEnrolmentIds.length) return {inserted: 0, seen: rows.length};


    if (absentEnrolmentIds.length) {
      try {
        await tx`
          WITH new_rows AS (
            SELECT *
            FROM UNNEST(
              ${absentEnrolmentIds}::uuid[],
              ${absentDates}::date[]
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
    }
    

    console.log("5) delete-not-seen within range, scoped to the enrolments we just touched")
    await deleteAbsencesNotSeen(tx, scopeEnrolmentIds, scopeDates, absentEnrolmentIds, absentDates, start, end);

    return {inserted: absentEnrolmentIds.length, seen: rows.length};
  });
}

// insert_camp.ts
type NormalizedCampRow = {
  student_id: number;
  student_name: string;
  dob: string;
  parent_name: string;
  parent_phone: string;
  start_date: string;
  end_date: string;
  start_time: string;
  end_time: string;
  camp_type: 'FD' | 'PM' | 'AM';
  extended_care: boolean;
  allergies: string;
  special_needs: string;
  course_id: string;
};

function normalizeCampDob(dob: string | null | undefined): string | null {
  const value = (dob ?? '').trim();
  if (!value || value === '0000-00-00') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return value;
}

type CampRosterColumnFlags = {
  parent_name: boolean;
  parent_phone: boolean;
  allergies: boolean;
};

async function getCampSessionId(
  tx: DbTx,
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

async function getCampRosterColumnFlags(tx: DbTx): Promise<CampRosterColumnFlags> {
  const columns = await tx<{ column_name: keyof CampRosterColumnFlags }[]>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'camp_enrolments'
      AND column_name IN ('parent_name', 'parent_phone', 'allergies');
  `;
  const names = new Set(columns.map((column: { column_name: keyof CampRosterColumnFlags }) => column.column_name));

  return {
    parent_name: names.has('parent_name'),
    parent_phone: names.has('parent_phone'),
    allergies: names.has('allergies'),
  };
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
    const rosterColumns = await getCampRosterColumnFlags(tx);
    const hasRosterContactColumns =
      rosterColumns.parent_name && rosterColumns.parent_phone && rosterColumns.allergies;

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
      const dobValue = normalizeCampDob(r.dob);
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
      
      const result = hasRosterContactColumns
        ? await tx`
            INSERT INTO camp_enrolments (
              student_id,
              camp_session_id,
              course_id,
              parent_name,
              parent_phone,
              allergies
            )
            VALUES (
              ${r.student_id},
              ${campSessionId}::uuid,
              ${courseId},
              ${r.parent_name || null},
              ${r.parent_phone || null},
              ${r.allergies || null}
            )
            ON CONFLICT (student_id, camp_session_id) DO UPDATE
              SET course_id = EXCLUDED.course_id,
                  parent_name = EXCLUDED.parent_name,
                  parent_phone = EXCLUDED.parent_phone,
                  allergies = EXCLUDED.allergies
            RETURNING (xmax = 0) AS inserted;
          `
        : await tx`
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
      if (c.student_ids.length === 0) {
        continue;
      }

      // Only create/update customers when at least one child is actually enrolled.
      const eligibleStudentRows = await tx<{ id: number }[]>`
        SELECT s.id
        FROM students s
        WHERE s.id = ANY(${c.student_ids}::numeric[])
          AND (
            EXISTS (SELECT 1 FROM enrolments e WHERE e.student_id = s.id)
            OR EXISTS (SELECT 1 FROM camp_enrolments ce WHERE ce.student_id = s.id)
          )
      `;

      const eligibleStudentIds = eligibleStudentRows.map((row) => Number(row.id));
      if (eligibleStudentIds.length === 0) {
        continue;
      }

      const rows = await tx<{ id: string }[]>`
        INSERT INTO customers (name, email, alternate_email, alternate_name, portal_parent_id)
        VALUES (
          ${c.name},
          ${c.email},
          ${c.alternate_email},
          NULL,
          ${c.portal_parent_id}
        )
        ON CONFLICT (portal_parent_id) WHERE portal_parent_id IS NOT NULL
        DO UPDATE SET
          name            = CASE WHEN customers.name_locked            THEN customers.name            ELSE EXCLUDED.name END,
          email           = CASE WHEN customers.email_locked           THEN customers.email           ELSE EXCLUDED.email END,
          alternate_email = CASE WHEN customers.alternate_email_locked THEN customers.alternate_email ELSE COALESCE(EXCLUDED.alternate_email, customers.alternate_email) END,
          alternate_name  = CASE WHEN customers.alternate_name_locked  THEN customers.alternate_name  ELSE COALESCE(customers.alternate_name, EXCLUDED.alternate_name) END
        RETURNING id
      `;
      if (!rows.length) continue;
      upserted++;

      const customerId = rows[0].id;

      if (eligibleStudentIds.length > 0) {
        const result = await tx<{ id: string }[]>`
          UPDATE students
          SET customer_id = ${customerId}::uuid
          WHERE id = ANY(${eligibleStudentIds}::numeric[])
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
            WHERE id = ANY(${eligibleStudentIds}::numeric[])
              AND customer_id IS NOT NULL
              AND customer_id != ${customerId}::uuid
          `;
          if (others.length === 1) {
            const primaryId = others[0].customer_id;
            const primary = await tx<{ name: string; email: string }[]>`
              SELECT name, email FROM customers WHERE id = ${primaryId}::uuid
            `;
            if (primary.length > 0) {
              const primaryEmail = primary[0].email.trim().toLowerCase();
              const primaryName = primary[0].name.trim().toLowerCase();
              const secondaryEmail = c.email.trim().toLowerCase();
              const secondaryName = c.name.trim().toLowerCase();
              const emailsDiffer = primaryEmail !== secondaryEmail;
              const namesDiffer = primaryName !== secondaryName;

              if (emailsDiffer) {
                // Bridge secondary contact → primary (alt email + alt name).
                // Lock-aware: skip when target field is locked by staff edit.
                await tx`
                  UPDATE customers
                  SET alternate_email = CASE
                        WHEN alternate_email_locked THEN alternate_email
                        ELSE COALESCE(alternate_email, ${c.email})
                      END,
                      alternate_name  = CASE
                        WHEN alternate_name_locked  THEN alternate_name
                        WHEN ${namesDiffer}::boolean THEN COALESCE(alternate_name, ${c.name})
                        ELSE alternate_name
                      END
                  WHERE id = ${primaryId}::uuid
                `;
                // Bridge primary contact → secondary
                await tx`
                  UPDATE customers
                  SET alternate_email = CASE
                        WHEN alternate_email_locked THEN alternate_email
                        ELSE COALESCE(alternate_email, ${primary[0].email})
                      END,
                      alternate_name  = CASE
                        WHEN alternate_name_locked  THEN alternate_name
                        WHEN ${namesDiffer}::boolean THEN COALESCE(alternate_name, ${primary[0].name})
                        ELSE alternate_name
                      END
                  WHERE id = ${customerId}::uuid
                `;
              }
            }
          }
        }
      }
    }
  });

  return { upserted, linked };
}

// ── Email sync from portal family-view ────────────────────────────────────────
//
// Refreshes customers.email + customers.alternate_email from the portal
// /family-view/family/{portal_parent_id} endpoint, which exposes a real
// parents[] array with primary_ind and alternate_email per parent.
//
// Portal is authoritative — overwrites both fields. Self-loop (same person
// returned as their own co-parent) or no co-parent clears alternate_email.
//
// Runs after syncCustomers in the daily scrape.
function normLower(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

export async function syncEmailsFromFamilyView(): Promise<{
  scanned: number;
  updated: number;
  fetchFailed: number;
}> {
  const customers = await sql<{
    id: string;
    email: string;
    alternate_email: string | null;
    portal_parent_id: number;
    email_locked: boolean;
    alternate_email_locked: boolean;
  }[]>`
    SELECT id::text, email, alternate_email, portal_parent_id,
           email_locked, alternate_email_locked
    FROM customers
    WHERE portal_parent_id IS NOT NULL
      AND (email_locked = FALSE OR alternate_email_locked = FALSE)
    ORDER BY portal_parent_id
  `;

  if (customers.length === 0) return { scanned: 0, updated: 0, fetchFailed: 0 };

  const BATCH = 10;
  let updated = 0;
  let fetchFailed = 0;

  for (let i = 0; i < customers.length; i += BATCH) {
    const batch = customers.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(async c => {
        const familyId = Number(c.portal_parent_id);
        const fv = await fetchFamilyView(familyId);
        // Portal returns parents in either `parents[]` or `user[]` depending on
        // record shape. Merge + dedupe by user_id so we never miss a co-parent.
        const combined = [
          ...(fv?.results?.parents ?? []),
          ...(fv?.results?.user ?? []),
        ];
        const byId = new Map<number, typeof combined[number]>();
        for (const p of combined) {
          if (p && p.user_id != null && !byId.has(Number(p.user_id))) {
            byId.set(Number(p.user_id), p);
          }
        }
        const parents = Array.from(byId.values());
        if (parents.length === 0) {
          return { kind: "fetch_failed" as const, customerId: c.id };
        }

        // Primary parent: prefer primary_ind === 1, fall back to user_id === familyId,
        // else first parent.
        const primary =
          parents.find(p => p.primary_ind === 1) ??
          parents.find(p => Number(p.user_id) === familyId) ??
          parents[0];

        // Co-parent: any parent with a different user_id (and not self-loop on email/name).
        const coParent =
          parents.find(p => Number(p.user_id) !== Number(primary.user_id)) ?? null;

        const primaryEmailLower = normLower(primary.email);
        const coEmailLower = normLower(coParent?.email);
        const selfLoop =
          !coParent ||
          (!coEmailLower && !normLower(coParent?.name)) ||
          (coEmailLower && coEmailLower === primaryEmailLower);

        // Desired values from portal. Prefer primary.alternate_email if set; otherwise
        // fall back to co-parent's primary email when present and not a self-loop.
        // Drop primary.alternate_email when it equals primary.email (portal self-loop).
        const portalEmail = primary.email?.trim().toLowerCase() || c.email;
        const primaryAltRaw = primary.alternate_email?.trim().toLowerCase() || null;
        const fromPrimaryAlt = primaryAltRaw && primaryAltRaw !== primaryEmailLower ? primaryAltRaw : null;
        const fromCoParent = !selfLoop ? coParent?.email?.trim().toLowerCase() || null : null;
        const portalAltEmail = fromPrimaryAlt ?? fromCoParent;

        // Lock-aware: keep existing value when its lock is set.
        const desiredEmail = c.email_locked ? c.email : portalEmail;
        const desiredAltEmail = c.alternate_email_locked ? c.alternate_email : portalAltEmail;

        const currentEmail = normLower(c.email);
        const currentAlt = c.alternate_email ? normLower(c.alternate_email) : null;
        const targetEmail = normLower(desiredEmail);
        const targetAlt = desiredAltEmail ? normLower(desiredAltEmail) : null;

        if (currentEmail === targetEmail && currentAlt === targetAlt) {
          return { kind: "noop" as const, customerId: c.id };
        }

        return {
          kind: "update" as const,
          customerId: c.id,
          email: desiredEmail,
          alternateEmail: desiredAltEmail,
        };
      }),
    );

    for (const r of results) {
      if (r.kind === "fetch_failed") {
        fetchFailed++;
      } else if (r.kind === "update") {
        await sql`
          UPDATE customers
          SET email = ${r.email}, alternate_email = ${r.alternateEmail}
          WHERE id = ${r.customerId}::uuid
        `;
        updated++;
      }
    }
  }

  return { scanned: customers.length, updated, fetchFailed };
}
