'use server';

import postgres from 'postgres';
import { cacheTag } from 'next/cache';
import {
  ParentFormData,
  ParentFormStudentData,
  ParentLinkRow,
  Session,
  StudentCourseEntry,
  SummerResponseRow,
  SummerStats,
} from './definitions';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

// NO cache — public route, must always reflect current DB state
export async function fetchParentFormData(token: string): Promise<ParentFormData | null> {
  try {
    const tokenRows = await sql<{ token_id: string; customer_id: string; customer_name: string }[]>`
      SELECT pt.id::text AS token_id, c.id::text AS customer_id, c.name AS customer_name
      FROM parent_tokens pt
      JOIN customers c ON c.id = pt.customer_id
      WHERE pt.token = ${token}
      LIMIT 1
    `;
    if (tokenRows.length === 0) return null;

    const { token_id, customer_id, customer_name } = tokenRows[0];

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
      LEFT JOIN LATERAL (
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
        SELECT id::text, weekday, start_time, end_time, is_summer
        FROM sessions
        WHERE is_summer = TRUE
        ORDER BY weekday, start_time
      `,
      sql<(Session & { student_count: number; coach_capacity: number })[]>`
        WITH session_capacities AS (
          SELECT
            s.id,
            COALESCE(SUM(COALESCE(u.coach_capacity, 6)), 0)::int AS total_capacity
          FROM sessions s
          JOIN template_shift ts ON
            ts.weekday = LOWER(s.weekday)
            AND ts.start_time < s.end_time::time
            AND ts.end_time > s.start_time::time
          JOIN template_shift_type tst ON
            tst.template_shift_id = ts.id
            AND tst.shift_type = 'coach'
          JOIN assigned_staff asf ON asf.template_shift_id = ts.id
          JOIN users u ON u.id::text = asf.user_id::text
          GROUP BY s.id
        )
        SELECT
          s.id::text,
          s.weekday,
          s.start_time,
          s.end_time,
          COUNT(e.id)::int AS student_count,
          COALESCE(sc.total_capacity, 0)::int AS coach_capacity
        FROM sessions s
        LEFT JOIN enrolments e ON e.session_id = s.id
        LEFT JOIN session_capacities sc ON sc.id = s.id
        WHERE s.is_summer = FALSE
        GROUP BY s.id, s.weekday, s.start_time, s.end_time, sc.total_capacity
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

    return { token_id, customer_id, customer_name, students, summer_sessions: summerSessions, fall_sessions: fallSessions };
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
      email: string;
      alternate_email: string | null;
      token: string;
      email_sent_at: Date | null;
      email_sent_count: number;
      student_names: string[];
      student_courses: StudentCourseEntry[];
      has_responded: boolean;
    }[]>`
      SELECT
        pt.id::text AS token_id,
        c.id::text AS customer_id,
        c.name AS customer_name,
        c.email,
        c.alternate_email,
        pt.token,
        pt.email_sent_at,
        pt.email_sent_count,
        COALESCE(sn.student_names, '{}') AS student_names,
        COALESCE(sc.student_courses, '[]'::json) AS student_courses,
        EXISTS (
          SELECT 1 FROM parent_requests pr
          WHERE pr.token_id = pt.id AND pr.is_latest = TRUE
        ) AS has_responded
      FROM parent_tokens pt
      JOIN customers c ON c.id = pt.customer_id
      LEFT JOIN LATERAL (
        SELECT ARRAY_AGG(s.name ORDER BY s.name) AS student_names
        FROM students s
        WHERE s.customer_id = c.id
      ) sn ON true
      LEFT JOIN LATERAL (
        SELECT json_agg(
          json_build_object(
            'student_name', s.name,
            'course_name', co.name,
            'weekday', se.weekday,
            'start_time', se.start_time
          ) ORDER BY s.name, se.weekday, se.start_time
        ) AS student_courses
        FROM students s
        JOIN enrolments e ON e.student_id = s.id
        JOIN sessions se ON se.id = e.session_id
        JOIN courses co ON co.id = e.course_id
        WHERE s.customer_id = c.id
      ) sc ON true
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
        (SELECT COUNT(*)::int FROM parent_tokens WHERE email_sent_count > 0)                                                AS emailed
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
        pr.payload->>'fall_status'                                           AS fall_status,
        COALESCE(fsl.fall_session_labels, '{}')                              AS fall_session_labels,
        le.weekday                                                           AS current_weekday,
        le.start_time                                                        AS current_start_time,
        pr.status,
        pr.custom_notes,
        pr.submitted_at
      FROM parent_requests pr
      JOIN students s  ON s.id  = pr.student_id
      JOIN customers c ON c.id  = s.customer_id
      LEFT JOIN LATERAL (
        SELECT ARRAY_AGG(
          se.weekday || ' ' || to_char(se.start_time, 'FMHH12:MI AM')
          ORDER BY se.weekday, se.start_time
        ) AS session_labels
        FROM jsonb_array_elements_text(pr.payload->'session_ids') AS sid
        JOIN sessions se ON se.id = sid::uuid
      ) sl ON true
      LEFT JOIN LATERAL (
        SELECT ARRAY_AGG(
          se.weekday || ' ' || to_char(se.start_time, 'FMHH12:MI AM')
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
      SELECT id::text, weekday, start_time, end_time, is_summer
      FROM sessions
      WHERE is_summer = TRUE
      ORDER BY weekday, start_time
    `;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch summer sessions.');
  }
}
