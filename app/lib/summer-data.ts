'use server';

import postgres from 'postgres';
import { cacheTag } from 'next/cache';
import {
  ParentFormData,
  ParentFormStudentData,
  ParentLinkRow,
  Session,
  StudentCourseEntry,
  SubmittedChoices,
  SummerResponseRow,
  SummerScheduleRow,
  SummerStats,
} from './definitions';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

// NO cache — public route, must always reflect current DB state
export async function fetchParentFormData(token: string): Promise<ParentFormData | null> {
  try {
    const tokenRows = await sql<{
      token_id: string;
      customer_id: string;
      customer_name: string;
      customer_alternate_name: string | null;
    }[]>`
      SELECT
        pt.id::text   AS token_id,
        c.id::text    AS customer_id,
        c.name        AS customer_name,
        c.alternate_name AS customer_alternate_name
      FROM parent_tokens pt
      JOIN customers c ON c.id = pt.customer_id
      WHERE pt.token = ${token}
      LIMIT 1
    `;
    if (tokenRows.length === 0) return null;

    const { token_id, customer_id, customer_name, customer_alternate_name } = tokenRows[0];

    const studentRows = await sql<{
      student_id: string;
      student_name: string;
      current_weekday: string | null;
      current_start_time: string | null;
      latest_request_id: string | null;
      latest_request: unknown;
      latest_request_status: string | null;
    }[]>`
      SELECT
        s.id::text AS student_id,
        s.name AS student_name,
        le.weekday AS current_weekday,
        le.start_time AS current_start_time,
        pr.id::text AS latest_request_id,
        pr.payload AS latest_request,
        pr.status AS latest_request_status
      FROM students s
      JOIN LATERAL (
        SELECT se.weekday, se.start_time
        FROM enrolments e
        JOIN sessions se ON se.id = e.session_id
        WHERE e.student_id = s.id
        ORDER BY e.start_date DESC NULLS LAST
        LIMIT 1
      ) le ON true
      LEFT JOIN LATERAL (
        SELECT pr2.id, pr2.payload, pr2.status
        FROM parent_requests pr2
        WHERE pr2.token_id = ${token_id}::uuid
          AND pr2.student_id = s.id
          AND pr2.request_type = 'summer_scheduling'
          AND pr2.is_latest = TRUE
        LIMIT 1
      ) pr ON true
      WHERE s.customer_id = ${customer_id}::uuid
      ORDER BY s.name
    `;

    const [summerSessions, fallSessions] = await Promise.all([
      sql<(Session & { is_summer: boolean })[]>`
        SELECT id::text, weekday, start_time, end_time, is_summer, is_full
        FROM sessions
        WHERE is_summer = TRUE
        ORDER BY weekday, start_time
      `,
      // Group by weekday+start_time to merge duplicate sessions; sum enrolment counts
      sql<(Session & { student_count: number; coach_capacity: number })[]>`
        SELECT
          MIN(s.id::text) AS id,
          s.weekday,
          s.start_time,
          MIN(s.end_time) AS end_time,
          BOOL_OR(s.is_full) AS is_full,
          COUNT(e.id)::int AS student_count,
          0::int AS coach_capacity
        FROM sessions s
        LEFT JOIN enrolments e ON e.session_id = s.id
        WHERE s.is_summer = FALSE
        GROUP BY s.weekday, s.start_time
        ORDER BY s.weekday, s.start_time
      `,
    ]);

    const students: ParentFormStudentData[] = studentRows.map(r => ({
      student_id: r.student_id,
      student_name: r.student_name,
      current_weekday: r.current_weekday,
      current_start_time: r.current_start_time,
      latest_request: r.latest_request as ParentFormStudentData['latest_request'],
      latest_request_id: r.latest_request_id,
      latest_request_status: r.latest_request_status as ParentFormStudentData['latest_request_status'],
    }));

    const WEEKDAY_HOURS = new Set([16, 17, 18]); // 4, 5, 6 PM
    const SATURDAY_HOURS = new Set([9, 10, 11, 13]); // 9, 10, 11 AM, 1 PM

    const filteredFallSessions = fallSessions.filter(s => {
      const [h, m] = s.start_time.split(':').map(Number);
      if (s.weekday === 'Saturday') {
        if (m !== 0) return false;
        return SATURDAY_HOURS.has(h);
      }
      if (s.weekday === 'Sunday') {
        if (s.student_count > 0) return true;
        if (m !== 0) return false;
        return h !== 12;
      }
      if (m !== 0) return false;
      return WEEKDAY_HOURS.has(h);
    });

    return { token_id, customer_id, customer_name, customer_alternate_name, students, summer_sessions: summerSessions, fall_sessions: filteredFallSessions };
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch parent form data.');
  }
}

export async function fetchParentLinkRows(): Promise<ParentLinkRow[]> {
  'use cache';
  cacheTag('summer-tokens');
  cacheTag('summer-responses');
  try {
    const rows = await sql<{
      token_id: string;
      customer_id: string;
      customer_name: string;
      alternate_name: string | null;
      email: string;
      alternate_email: string | null;
      name_locked: boolean;
      email_locked: boolean;
      alternate_email_locked: boolean;
      alternate_name_locked: boolean;
      token: string;
      last_exported_at: Date | null;
      export_count: number;
      student_names: string[];
      student_courses: StudentCourseEntry[];
      has_responded: boolean;
    }[]>`
      SELECT
        pt.id::text AS token_id,
        c.id::text AS customer_id,
        c.name AS customer_name,
        c.alternate_name,
        c.email,
        c.alternate_email,
        c.name_locked,
        c.email_locked,
        c.alternate_email_locked,
        c.alternate_name_locked,
        pt.token,
        pt.last_exported_at,
        pt.export_count,
        COALESCE(sn.student_names, '{}') AS student_names,
        COALESCE(sc.student_courses, '[]'::json) AS student_courses,
        EXISTS (
          SELECT 1 FROM parent_requests pr
          WHERE pr.token_id = pt.id AND pr.is_latest = TRUE
        ) AS has_responded
      FROM parent_tokens pt
      JOIN customers c ON c.id = pt.customer_id
      LEFT JOIN LATERAL (
        SELECT ARRAY_AGG(DISTINCT s.name ORDER BY s.name) AS student_names
        FROM students s
        WHERE s.customer_id = c.id
          AND EXISTS (SELECT 1 FROM enrolments e WHERE e.student_id = s.id)
      ) sn ON true
      LEFT JOIN LATERAL (
        SELECT json_agg(
          json_build_object(
            'student_name', student_name,
            'course_name', course_name,
            'weekday', weekday,
            'start_time', start_time
          ) ORDER BY student_name, weekday, start_time
        ) AS student_courses
        FROM (
          SELECT DISTINCT
            s.name AS student_name,
            co.name AS course_name,
            se.weekday,
            se.start_time
          FROM students s
          JOIN enrolments e ON e.student_id = s.id
          JOIN sessions se ON se.id = e.session_id
          JOIN courses co ON co.id = e.course_id
          WHERE s.customer_id = c.id
        ) distinct_courses
      ) sc ON true
      WHERE COALESCE(array_length(sn.student_names, 1), 0) > 0
      ORDER BY c.name
    `;
    return rows;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch parent link rows.');
  }
}

export async function fetchSummerStats(): Promise<SummerStats> {
  'use cache';
  cacheTag('summer-responses');
  cacheTag('summer-tokens');
  try {
    const rows = await sql<SummerStats[]>`
      SELECT
        (SELECT COUNT(*)::int FROM parent_tokens)                                                                           AS total_families,
        (SELECT COUNT(DISTINCT token_id)::int FROM parent_requests WHERE is_latest = TRUE)                                  AS responded,
        (SELECT COUNT(*)::int FROM parent_requests WHERE is_latest = TRUE AND request_type = 'summer_scheduling' AND payload->>'summer_status' = 'enrolling')  AS enrolling,
        (SELECT COUNT(*)::int FROM parent_requests WHERE is_latest = TRUE AND request_type = 'summer_scheduling' AND payload->>'summer_status' = 'pausing')   AS pausing,
        (SELECT COUNT(*)::int FROM parent_requests WHERE is_latest = TRUE AND request_type = 'summer_scheduling' AND payload->>'summer_status' = 'no_change') AS no_change,
        (SELECT COUNT(*)::int FROM parent_requests WHERE is_latest = TRUE AND status = 'pending')                           AS pending,
        (SELECT COUNT(*)::int FROM parent_requests WHERE is_latest = TRUE AND status = 'needs_manual_followup')             AS needs_followup,
        (SELECT COUNT(*)::int FROM parent_tokens WHERE export_count > 0)                                                    AS exported
    `;
    return rows[0];
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch summer stats.');
  }
}

export async function fetchSummerResponseRows(): Promise<SummerResponseRow[]> {
  'use cache';
  cacheTag('summer-responses');
  try {
    return await sql<SummerResponseRow[]>`
      SELECT
        pr.id::text                                                          AS request_id,
        s.id::text                                                           AS student_id,
        s.name                                                               AS student_name,
        c.name                                                               AS parent_name,
        c.email                                                              AS parent_email,
        COALESCE(pr.payload->>'summer_status', 'other')                      AS summer_status,
        COALESCE(sl.session_labels, '{}')                                    AS session_labels,
        COALESCE((pr.payload->>'pickup_requested')::boolean, FALSE)          AS pickup_requested,
        pr.payload->>'pickup_school'                                         AS pickup_school,
        pr.payload->>'pickup_school_other'                                   AS pickup_school_other,
        pr.payload->>'fall_status'                                           AS fall_status,
        COALESCE(fsl.fall_session_labels, '{}')                              AS fall_session_labels,
        le.weekday                                                           AS current_weekday,
        le.start_time                                                        AS current_start_time,
        pr.status,
        pr.custom_notes,
        pr.submitted_at,
        pr.added_to_portal_at
      FROM parent_requests pr
      JOIN students s  ON s.id  = pr.student_id
      JOIN customers c ON c.id  = s.customer_id
      LEFT JOIN LATERAL (
        SELECT ARRAY_AGG(
          se.weekday || ' ' || to_char(se.start_time, 'FMHH12:MI AM')
          || COALESCE(
               ' (start ' ||
               to_char((pr.payload->'session_start_dates'->>(se.id::text))::date, 'Mon DD')
               || ')',
               ''
             )
          ORDER BY se.weekday, se.start_time
        ) AS session_labels
        FROM jsonb_array_elements_text(pr.payload->'session_ids') AS sid
        JOIN sessions se ON se.id = sid::uuid
      ) sl ON true
      LEFT JOIN LATERAL (
        SELECT ARRAY_AGG(
          se.weekday || ' ' || to_char(se.start_time, 'FMHH12:MI AM')
          || COALESCE(
               ' (start ' ||
               to_char((pr.payload->'fall_session_start_dates'->>(se.id::text))::date, 'Mon DD')
               || ')',
               ''
             )
          ORDER BY se.weekday, se.start_time
        ) AS fall_session_labels
        FROM jsonb_array_elements_text(pr.payload->'fall_session_ids') AS fsid
        JOIN sessions se ON se.id = fsid::uuid
      ) fsl ON true
      LEFT JOIN LATERAL (
        SELECT se.weekday, se.start_time
        FROM enrolments e
        JOIN sessions se ON se.id = e.session_id
        WHERE e.student_id = s.id
        ORDER BY e.start_date DESC NULLS LAST
        LIMIT 1
      ) le ON true
      WHERE pr.is_latest = TRUE
      ORDER BY pr.submitted_at DESC
    `;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch summer response rows.');
  }
}

export async function fetchSummerSessions(): Promise<(Session & { is_summer: boolean })[]> {
  'use cache';
  cacheTag('schedule');
  try {
    return await sql<(Session & { is_summer: boolean })[]>`
      SELECT id::text, weekday, start_time, end_time, is_summer, is_full
      FROM sessions
      WHERE is_summer = TRUE
      ORDER BY weekday, start_time
    `;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch summer sessions.');
  }
}

// NO cache — called immediately after submit redirect; must be fresh
export async function fetchSubmittedChoices(token: string): Promise<SubmittedChoices | null> {
  try {
    const header = await sql<{ customer_name: string; customer_alternate_name: string | null }[]>`
      SELECT c.name AS customer_name, c.alternate_name AS customer_alternate_name
      FROM parent_tokens pt
      JOIN customers c ON c.id = pt.customer_id
      WHERE pt.token = ${token}
      LIMIT 1
    `;
    if (!header.length) return null;

    const students = await sql<{
      student_name: string;
      summer_status: string;
      session_labels: string[];
      pickup_requested: boolean;
      pickup_school: string | null;
      pickup_school_other: string | null;
      fall_status: string | null;
      fall_session_labels: string[];
      custom_notes: string | null;
    }[]>`
      SELECT
        s.name AS student_name,
        COALESCE(pr.payload->>'summer_status', 'other') AS summer_status,
        COALESCE(sl.session_labels, '{}') AS session_labels,
        COALESCE((pr.payload->>'pickup_requested')::boolean, FALSE) AS pickup_requested,
        pr.payload->>'pickup_school' AS pickup_school,
        pr.payload->>'pickup_school_other' AS pickup_school_other,
        pr.payload->>'fall_status' AS fall_status,
        COALESCE(fsl.fall_session_labels, '{}') AS fall_session_labels,
        pr.custom_notes
      FROM parent_tokens pt
      JOIN parent_requests pr ON pr.token_id = pt.id AND pr.is_latest = TRUE
      JOIN students s ON s.id = pr.student_id
      LEFT JOIN LATERAL (
        SELECT ARRAY_AGG(
          se.weekday || ' ' || to_char(se.start_time, 'FMHH12:MI AM')
          || COALESCE(
               ' (start ' ||
               to_char((pr.payload->'session_start_dates'->>(se.id::text))::date, 'Mon DD')
               || ')',
               ''
             )
          ORDER BY se.weekday, se.start_time
        ) AS session_labels
        FROM jsonb_array_elements_text(pr.payload->'session_ids') AS sid
        JOIN sessions se ON se.id = sid::uuid
      ) sl ON true
      LEFT JOIN LATERAL (
        SELECT ARRAY_AGG(
          se.weekday || ' ' || to_char(se.start_time, 'FMHH12:MI AM')
          || COALESCE(
               ' (start ' ||
               to_char((pr.payload->'fall_session_start_dates'->>(se.id::text))::date, 'Mon DD')
               || ')',
               ''
             )
          ORDER BY se.weekday, se.start_time
        ) AS fall_session_labels
        FROM jsonb_array_elements_text(pr.payload->'fall_session_ids') AS fsid
        JOIN sessions se ON se.id = fsid::uuid
      ) fsl ON true
      WHERE pt.token = ${token}
      ORDER BY s.name
    `;

    return {
      customer_name: header[0].customer_name,
      customer_alternate_name: header[0].customer_alternate_name,
      students,
    };
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch submitted choices.');
  }
}

export async function fetchSummerSchedule(): Promise<SummerScheduleRow[]> {
  'use cache';
  cacheTag('summer-responses');
  cacheTag('schedule');
  try {
    const rows = await sql<{
      session_id: string;
      weekday: string;
      start_time: string;
      end_time: string;
      is_full: boolean;
      student_count: number;
      students: SummerScheduleRow['students'];
    }[]>`
      SELECT
        s.id::text AS session_id,
        s.weekday,
        s.start_time,
        s.end_time,
        s.is_full,
        COUNT(e.id)::int AS student_count,
        COALESCE(
          json_agg(
            json_build_object('name', st.name, 'course', c.name)
            ORDER BY st.name
          ) FILTER (WHERE st.id IS NOT NULL),
          '[]'::json
        ) AS students
      FROM sessions s
      LEFT JOIN enrolments e ON e.session_id = s.id
      LEFT JOIN students st ON st.id = e.student_id
      LEFT JOIN courses c ON c.id = e.course_id
      WHERE s.is_summer = TRUE
      GROUP BY s.id, s.weekday, s.start_time, s.end_time, s.is_full
      ORDER BY
        ARRAY_POSITION(
          ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'],
          s.weekday
        ),
        s.start_time
    `;
    return rows;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch summer schedule.');
  }
}

export async function fetchFallSchedule(): Promise<SummerScheduleRow[]> {
  'use cache';
  cacheTag('summer-responses');
  cacheTag('schedule');
  try {
    const rows = await sql<{
      session_id: string;
      weekday: string;
      start_time: string;
      end_time: string;
      is_full: boolean;
      student_count: number;
      students: SummerScheduleRow['students'];
    }[]>`
      SELECT
        s.id::text AS session_id,
        s.weekday,
        s.start_time,
        s.end_time,
        s.is_full,
        COUNT(e.id)::int AS student_count,
        COALESCE(
          json_agg(
            json_build_object('name', st.name, 'course', c.name)
            ORDER BY st.name
          ) FILTER (WHERE st.id IS NOT NULL),
          '[]'::json
        ) AS students
      FROM sessions s
      LEFT JOIN enrolments e ON e.session_id = s.id
      LEFT JOIN students st ON st.id = e.student_id
      LEFT JOIN courses c ON c.id = e.course_id
      WHERE s.is_summer = FALSE
      GROUP BY s.id, s.weekday, s.start_time, s.end_time, s.is_full
      ORDER BY
        ARRAY_POSITION(
          ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'],
          s.weekday
        ),
        s.start_time
    `;
    return rows;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch fall schedule.');
  }
}
