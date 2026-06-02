'use server';

import postgres from 'postgres';
import { cacheTag } from 'next/cache';
import {
  Course,
  CurrentSessionSummary,
  ParentFormData,
  ParentFormStudentData,
  ParentLinkRow,
  Session,
  StudentCourseEntry,
  SubmittedChoices,
  SummerSchedulingPayload,
  SummerResponseRow,
  SummerScheduleRow,
  SummerStats,
} from './definitions';
import { normalizeSessionSelection } from './session-selection';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

type TokenStudentSnapshot = CurrentSessionSummary & {
  student_id?: string;
};

function cleanSnapshotString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeTokenStudentSnapshots(value: unknown): Map<string, CurrentSessionSummary[]> {
  const map = new Map<string, CurrentSessionSummary[]>();
  if (!Array.isArray(value)) return map;

  for (const rawSession of value) {
    if (!rawSession || typeof rawSession !== 'object') continue;
    const session = rawSession as Partial<TokenStudentSnapshot>;
    const studentId = cleanSnapshotString(session.student_id);
    const weekday = cleanSnapshotString(session.weekday);
    const startTime = cleanSnapshotString(session.start_time);
    if (!studentId || !weekday || !/^\d{2}:\d{2}(:\d{2})?$/.test(startTime)) continue;

    const pickupSchool = cleanSnapshotString(session.pickup_school);
    const courseName = cleanSnapshotString(session.course_name);
    const currentSession: CurrentSessionSummary = {
      weekday,
      start_time: startTime,
      pickup_school: pickupSchool || null,
      ...(courseName ? { course_name: courseName } : {}),
    };
    map.set(studentId, [...(map.get(studentId) ?? []), currentSession]);
  }

  return map;
}

async function fetchCanonicalFallSessionIds(sessionIds: string[]): Promise<Map<string, string>> {
  const ids = Array.from(new Set(sessionIds));
  if (ids.length === 0) return new Map();

  const rows = await sql<{ id: string; canonical_id: string }[]>`
    WITH selected AS (
      SELECT id::text AS id, weekday, start_time
      FROM sessions
      WHERE id = ANY(${ids}::uuid[])
        AND is_summer = FALSE
    )
    SELECT
      selected.id,
      MIN(canonical.id::text) AS canonical_id
    FROM selected
    JOIN sessions canonical
      ON canonical.is_summer = FALSE
      AND canonical.weekday = selected.weekday
      AND canonical.start_time = selected.start_time
    GROUP BY selected.id
  `;

  return new Map(rows.map(row => [row.id, row.canonical_id]));
}

function normalizeLatestRequest(
  payload: unknown,
  canonicalFallIdById: Map<string, string>,
  visibleFallSessionIds: Set<string>,
): Partial<SummerSchedulingPayload> | null {
  if (!payload || typeof payload !== 'object') return null;

  const request = payload as Partial<SummerSchedulingPayload>;
  if (request.fall_status !== 'change') {
    return {
      ...request,
      fall_session_ids: [],
      fall_waitlist_session_ids: [],
      fall_session_start_dates: undefined,
    };
  }

  const fallSessionIds = (request.fall_session_ids ?? []).filter(id => canonicalFallIdById.has(id));
  const fallWaitlistSessionIds = (request.fall_waitlist_session_ids ?? []).filter(id => canonicalFallIdById.has(id));
  const normalizedFall = normalizeSessionSelection(
    fallSessionIds,
    request.fall_session_start_dates,
    canonicalFallIdById,
  );
  const normalizedFallWaitlist = normalizeSessionSelection(
    fallWaitlistSessionIds,
    undefined,
    canonicalFallIdById,
  );
  const visibleFallIds = normalizedFall.ids.filter(id => visibleFallSessionIds.has(id));
  const visibleFallWaitlistIds = normalizedFallWaitlist.ids.filter(id => visibleFallSessionIds.has(id));
  const visibleStartDates = visibleFallIds.reduce<Record<string, string>>((dates, id) => {
    const date = normalizedFall.startDates?.[id];
    if (date) dates[id] = date;
    return dates;
  }, {});

  return {
    ...request,
    fall_session_ids: visibleFallIds,
    fall_waitlist_session_ids: visibleFallWaitlistIds,
    fall_session_start_dates: Object.keys(visibleStartDates).length > 0 ? visibleStartDates : undefined,
  };
}

// NO cache — public route, must always reflect current DB state
export async function fetchParentFormData(token: string, includeInactiveStudents = false): Promise<ParentFormData | null> {
  try {
    const tokenRows = await sql<{
      token_id: string;
      customer_id: string;
      customer_name: string;
      customer_alternate_name: string | null;
      last_active_snapshot: unknown;
    }[]>`
      SELECT
        pt.id::text   AS token_id,
        c.id::text    AS customer_id,
        c.name        AS customer_name,
        c.alternate_name AS customer_alternate_name,
        COALESCE(to_jsonb(pt)->'last_active_snapshot', '[]'::jsonb) AS last_active_snapshot
      FROM parent_tokens pt
      JOIN customers c ON c.id = pt.customer_id
      WHERE pt.token = ${token}
      LIMIT 1
    `;
    if (tokenRows.length === 0) return null;

    const { token_id, customer_id, customer_name, customer_alternate_name, last_active_snapshot } = tokenRows[0];
    const tokenSnapshotByStudentId = normalizeTokenStudentSnapshots(last_active_snapshot);
    const tokenSnapshotStudentIds = Array.from(tokenSnapshotByStudentId.keys());

    const studentRows = await sql<{
      student_id: string;
      student_name: string;
      current_sessions: CurrentSessionSummary[] | null;
      current_weekday: string | null;
      current_start_time: string | null;
      current_pickup_school: string | null;
      latest_request_id: string | null;
      latest_request_type: string | null;
      latest_request: unknown;
      latest_request_status: string | null;
      latest_custom_notes: string | null;
    }[]>`
      SELECT
        s.id::text AS student_id,
        s.name AS student_name,
        cs.current_sessions AS current_sessions,
        cs.current_weekday AS current_weekday,
        cs.current_start_time AS current_start_time,
        cs.current_pickup_school AS current_pickup_school,
        pr.id::text AS latest_request_id,
        pr.request_type AS latest_request_type,
        pr.payload AS latest_request,
        pr.status AS latest_request_status,
        pr.custom_notes AS latest_custom_notes
      FROM students s
      LEFT JOIN LATERAL (
        SELECT
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'weekday', slots.weekday,
              'start_time', slots.start_time,
              'pickup_school', slots.pickup_school,
              'course_name', slots.course_name
            )
            ORDER BY slots.weekday_order, slots.start_time
          ) AS current_sessions,
          (ARRAY_AGG(slots.weekday ORDER BY slots.weekday_order, slots.start_time))[1] AS current_weekday,
          (ARRAY_AGG(slots.start_time ORDER BY slots.weekday_order, slots.start_time))[1] AS current_start_time,
          (ARRAY_AGG(slots.pickup_school ORDER BY slots.weekday_order, slots.start_time) FILTER (WHERE slots.pickup_school IS NOT NULL))[1] AS current_pickup_school
        FROM (
          SELECT DISTINCT
            se.weekday,
            se.start_time,
            co.name AS course_name,
            cp.school_name AS pickup_school,
            CASE LOWER(TRIM(se.weekday))
              WHEN 'monday' THEN 1
              WHEN 'tuesday' THEN 2
              WHEN 'wednesday' THEN 3
              WHEN 'thursday' THEN 4
              WHEN 'friday' THEN 5
              WHEN 'saturday' THEN 6
              WHEN 'sunday' THEN 7
              ELSE 8
            END AS weekday_order
          FROM enrolments e
          JOIN sessions se ON se.id = e.session_id
          LEFT JOIN courses co ON co.id = e.course_id
          LEFT JOIN LATERAL (
            SELECT p.school_name
            FROM pickups p
            WHERE p.student_id = s.id
              AND LOWER(TRIM(p.weekday)) = LOWER(TRIM(se.weekday))
            ORDER BY p.id
            LIMIT 1
          ) cp ON true
          WHERE e.student_id = s.id
        ) slots
      ) cs ON true
      LEFT JOIN LATERAL (
        SELECT pr2.id, pr2.request_type, pr2.payload, pr2.status, pr2.custom_notes
        FROM parent_requests pr2
        WHERE pr2.token_id = ${token_id}::uuid
          AND pr2.student_id = s.id
          AND pr2.request_type IN ('summer_scheduling', 'other')
          AND pr2.is_latest = TRUE
          AND pr2.removed_at IS NULL
        ORDER BY pr2.submitted_at DESC
        LIMIT 1
      ) pr ON true
      WHERE s.customer_id = ${customer_id}::uuid
        AND (
          ${includeInactiveStudents}::boolean
          OR (
            EXISTS (
              SELECT 1
              FROM enrolments e
              WHERE e.student_id = s.id
            )
            OR s.id::text = ANY(${tokenSnapshotStudentIds}::text[])
          )
        )
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

    const courseOptions = await sql<Course[]>`
      SELECT c.id::text, c.name, c.description
      FROM courses c
      LEFT JOIN enrolments e ON e.course_id = c.id
      WHERE c.name !~* 'day\\s*camp'
        AND (
          c.name ~ '\\([A-Za-z]+[0-9]+\\)'
          OR c.name ~* 'stripe'
          OR c.name = 'Vex Robotics Competition'
        )
      GROUP BY c.id, c.name, c.description
      ORDER BY
        COALESCE(substring(c.name from '\\(([A-Za-z]+)[0-9]+\\)'), c.name),
        COALESCE((substring(c.name from '\\([A-Za-z]+([0-9]+)\\)'))::int, 0),
        c.name
    `;

    const WEEKDAY_HOURS = new Set([16, 17, 18]); // 4, 5, 6 PM
    const SUMMER_SATURDAY_HOURS = new Set([9, 10, 11, 12]); // Summer: 9 AM through 12 PM
    const FALL_SATURDAY_HOURS = new Set([9, 10, 11, 13]); // Fall: 9, 10, 11 AM, 1 PM

    const filteredSummerSessions = summerSessions.filter(s => {
      const [h, m] = s.start_time.split(':').map(Number);
      if (s.weekday !== 'Saturday') return true;
      if (m !== 0) return false;
      return SUMMER_SATURDAY_HOURS.has(h);
    });

    const filteredFallSessions = fallSessions.filter(s => {
      const [h, m] = s.start_time.split(':').map(Number);
      if (s.weekday === 'Saturday') {
        if (m !== 0) return false;
        return FALL_SATURDAY_HOURS.has(h);
      }
      if (s.weekday === 'Sunday') {
        if (h === 10 && m === 30) return false;
        if (s.student_count > 0) return true;
        if (m !== 0) return false;
        return h !== 12;
      }
      if (m !== 0) return false;
      return WEEKDAY_HOURS.has(h);
    });
    const visibleFallSessionIds = new Set(filteredFallSessions.map(session => session.id));

    const latestFallSessionIds = studentRows.flatMap(r => {
      const request = r.latest_request as SummerSchedulingPayload | null;
      return request?.fall_status === 'change'
        ? [...(request.fall_session_ids ?? []), ...(request.fall_waitlist_session_ids ?? [])]
        : [];
    });
    const canonicalFallIdById = await fetchCanonicalFallSessionIds(latestFallSessionIds);

    const students: ParentFormStudentData[] = studentRows.map(r => {
      const latestRequest = normalizeLatestRequest(r.latest_request, canonicalFallIdById, visibleFallSessionIds);
      const latestCurrentSessions = latestRequest?.current_sessions_snapshot ?? [];
      const dbCurrentSessions = r.current_sessions ?? [];
      const tokenCurrentSessions = tokenSnapshotByStudentId.get(r.student_id) ?? [];
      const currentSessions = dbCurrentSessions.length > 0
        ? dbCurrentSessions
        : tokenCurrentSessions.length > 0
          ? tokenCurrentSessions
          : latestCurrentSessions;
      const firstCurrentSession = currentSessions[0];

      return {
        student_id: r.student_id,
        student_name: r.student_name,
        current_sessions: currentSessions,
        current_weekday: firstCurrentSession?.weekday ?? r.current_weekday,
        current_start_time: firstCurrentSession?.start_time ?? r.current_start_time,
        current_pickup_school: firstCurrentSession?.pickup_school ?? r.current_pickup_school,
        latest_request: latestRequest,
        latest_request_type: r.latest_request_type as ParentFormStudentData['latest_request_type'],
        latest_request_id: r.latest_request_id,
        latest_request_status: r.latest_request_status as ParentFormStudentData['latest_request_status'],
        latest_custom_notes: r.latest_custom_notes,
      };
    });

    return {
      token_id,
      customer_id,
      customer_name,
      customer_alternate_name,
      students,
      summer_sessions: filteredSummerSessions,
      fall_sessions: filteredFallSessions,
      course_options: courseOptions,
    };
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
      last_seen_active_at: Date | null;
      export_count: number;
      student_names: string[];
      student_courses: StudentCourseEntry[];
      student_count: number;
      active_student_count: number;
      has_responded: boolean;
      has_internal_response: boolean;
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
        (to_jsonb(pt)->>'last_seen_active_at')::timestamptz AS last_seen_active_at,
        pt.export_count,
        COALESCE(sn.student_names, '{}') AS student_names,
        COALESCE(sn.student_count, 0)::int AS student_count,
        COALESCE(sn.active_student_count, 0)::int AS active_student_count,
        CASE
          WHEN COALESCE(sn.active_student_count, 0) > 0 THEN COALESCE(sc.student_courses, '[]'::jsonb)
          ELSE COALESCE(NULLIF(to_jsonb(pt)->'last_active_snapshot', '[]'::jsonb), sc.student_courses, '[]'::jsonb)
        END AS student_courses,
        EXISTS (
          SELECT 1
          FROM parent_requests pr
          JOIN students prs ON prs.id = pr.student_id
          WHERE prs.customer_id = c.id
            AND pr.is_latest = TRUE
            AND pr.removed_at IS NULL
            AND pr.request_type IN ('summer_scheduling', 'other')
        ) AS has_responded,
        EXISTS (
          SELECT 1
          FROM parent_requests pr
          JOIN students prs ON prs.id = pr.student_id
          WHERE prs.customer_id = c.id
            AND pr.is_latest = TRUE
            AND pr.removed_at IS NULL
            AND pr.request_type IN ('summer_scheduling', 'other')
            AND pr.submitted_by = 'staff'
        ) AS has_internal_response
      FROM parent_tokens pt
      JOIN customers c ON c.id = pt.customer_id
      LEFT JOIN LATERAL (
        SELECT
          ARRAY_AGG(DISTINCT s.name ORDER BY s.name) AS student_names,
          COUNT(*)::int AS student_count,
          COUNT(*) FILTER (
            WHERE EXISTS (
              SELECT 1
              FROM enrolments e
              WHERE e.student_id = s.id
            )
          )::int AS active_student_count
        FROM students s
        WHERE s.customer_id = c.id
      ) sn ON true
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(
          jsonb_build_object(
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
      ORDER BY c.name
    `;
    return rows;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch parent link rows.');
  }
}

export async function fetchUntokenizedActiveFamilyCount(): Promise<number> {
  'use cache';
  cacheTag('summer-tokens');
  try {
    const rows = await sql<{ count: number }[]>`
      SELECT COUNT(DISTINCT c.id)::int AS count
      FROM customers c
      JOIN students s ON s.customer_id = c.id
      JOIN enrolments e ON e.student_id = s.id
      WHERE NOT EXISTS (
        SELECT 1
        FROM parent_tokens pt
        WHERE pt.customer_id = c.id
      )
    `;
    return rows[0]?.count ?? 0;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch untokenized active family count.');
  }
}

export async function fetchSummerStats(): Promise<SummerStats> {
  'use cache';
  cacheTag('summer-responses');
  cacheTag('summer-tokens');
  try {
    const rows = await sql<SummerStats[]>`
      WITH token_stats AS (
        SELECT
          COUNT(*)::int AS total_families,
          COUNT(*) FILTER (WHERE export_count > 0)::int AS exported
        FROM parent_tokens
      ),
      active_requests AS (
        SELECT s.customer_id, pr.request_type, pr.status, pr.payload, pr.submitted_by
        FROM parent_requests pr
        JOIN students s ON s.id = pr.student_id
        WHERE pr.is_latest = TRUE
          AND pr.removed_at IS NULL
          AND pr.request_type IN ('summer_scheduling', 'other')
      )
      SELECT
        token_stats.total_families,
        COUNT(DISTINCT active_requests.customer_id)::int AS responded,
        COUNT(*) FILTER (
          WHERE active_requests.request_type = 'summer_scheduling'
            AND active_requests.payload->>'summer_status' = 'enrolling'
        )::int AS enrolling,
        COUNT(*) FILTER (
          WHERE active_requests.request_type = 'summer_scheduling'
            AND active_requests.payload->>'summer_status' = 'pausing'
        )::int AS pausing,
        COUNT(*) FILTER (
          WHERE active_requests.request_type = 'summer_scheduling'
            AND active_requests.payload->>'summer_status' = 'no_change'
        )::int AS no_change,
        COUNT(*) FILTER (WHERE active_requests.status = 'pending')::int AS pending,
        COUNT(*) FILTER (WHERE active_requests.status = 'needs_manual_followup')::int AS needs_followup,
        token_stats.exported,
        COUNT(DISTINCT active_requests.customer_id) FILTER (WHERE active_requests.submitted_by = 'parent')::int AS parent_submitted,
        COUNT(DISTINCT active_requests.customer_id) FILTER (WHERE active_requests.submitted_by = 'staff')::int AS staff_submitted
      FROM token_stats
      LEFT JOIN active_requests ON TRUE
      GROUP BY token_stats.total_families, token_stats.exported
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
        c.alternate_email                                                    AS parent_alternate_email,
        COALESCE(pr.payload->>'summer_status', 'other')                      AS summer_status,
        COALESCE(sl.session_labels, '{}')                                    AS session_labels,
        COALESCE(sl.session_choices, '[]'::json)                             AS session_choices,
        COALESCE(wl.waitlist_session_labels, '{}')                           AS waitlist_session_labels,
        COALESCE((pr.payload->>'pickup_requested')::boolean, FALSE)          AS pickup_requested,
        pr.payload->>'pickup_school'                                         AS pickup_school,
        pr.payload->>'pickup_school_other'                                   AS pickup_school_other,
        pr.payload->>'fall_status'                                           AS fall_status,
        COALESCE(fsl.fall_session_labels, '{}')                              AS fall_session_labels,
        COALESCE(fsl.fall_session_choices, '[]'::json)                       AS fall_session_choices,
        COALESCE(fwl.fall_waitlist_session_labels, '{}')                     AS fall_waitlist_session_labels,
        pr.payload->>'fall_notes'                                             AS fall_notes,
        le.weekday                                                           AS current_weekday,
        le.start_time                                                        AS current_start_time,
        COALESCE(pr.payload->'current_sessions_snapshot', '[]'::jsonb)       AS current_sessions_snapshot,
        pr.status,
        pr.custom_notes,
        COALESCE(pr.submitted_by, 'parent')                                  AS submitted_by,
        pr.submitted_by_name,
        pr.submitted_at,
        pt.last_exported_at                                                   AS token_last_exported_at,
        COALESCE(pt.export_count, 0)::int                                     AS token_export_count,
        pr.added_to_portal_at,
        pr.added_to_portal_by,
        COALESCE(history.previous_submission_count, 0)::int                 AS previous_submission_count,
        history.previous_submitted_at,
        COALESCE(history.submission_history, '[]'::json)                    AS submission_history
      FROM parent_requests pr
      JOIN students s  ON s.id  = pr.student_id
      JOIN customers c ON c.id  = s.customer_id
      LEFT JOIN parent_tokens pt ON pt.id = pr.token_id
      LEFT JOIN LATERAL (
        SELECT
          ARRAY_AGG(
            se.weekday || ' ' || to_char(se.start_time, 'FMHH12:MI AM')
            || COALESCE(
                 ' (start ' ||
                 to_char((pr.payload->'session_start_dates'->>(se.id::text))::date, 'Mon DD')
                 || ')',
                 ''
               )
            ORDER BY se.weekday, se.start_time
          ) AS session_labels,
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'session_id', se.id::text,
              'weekday', se.weekday,
              'start_time', se.start_time,
              'start_date', pr.payload->'session_start_dates'->>(se.id::text)
            )
            ORDER BY se.weekday, se.start_time
          ) AS session_choices
        FROM jsonb_array_elements_text(COALESCE(pr.payload->'session_ids', '[]'::jsonb)) AS sid
        JOIN sessions se ON se.id = sid::uuid
      ) sl ON true
      LEFT JOIN LATERAL (
        SELECT
          ARRAY_AGG(
            se.weekday || ' ' || to_char(se.start_time, 'FMHH12:MI AM')
            ORDER BY se.weekday, se.start_time
          ) AS waitlist_session_labels
        FROM jsonb_array_elements_text(COALESCE(pr.payload->'waitlist_session_ids', '[]'::jsonb)) AS sid
        JOIN sessions se ON se.id = sid::uuid
      ) wl ON true
      LEFT JOIN LATERAL (
        SELECT
          ARRAY_AGG(slot.label ORDER BY slot.weekday, slot.start_time) AS fall_session_labels,
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'session_id', slot.session_id,
              'weekday', slot.weekday,
              'start_time', slot.start_time,
              'start_date', slot.start_date
            )
            ORDER BY slot.weekday, slot.start_time
          ) AS fall_session_choices
        FROM (
          SELECT DISTINCT ON (se.weekday, se.start_time)
            se.id::text AS session_id,
            se.weekday,
            se.start_time,
            pr.payload->'fall_session_start_dates'->>(se.id::text) AS start_date,
            se.weekday || ' ' || to_char(se.start_time, 'FMHH12:MI AM')
            || COALESCE(
                 ' (start ' ||
                 to_char((pr.payload->'fall_session_start_dates'->>(se.id::text))::date, 'Mon DD')
                 || ')',
                 ''
               ) AS label
          FROM jsonb_array_elements_text(COALESCE(pr.payload->'fall_session_ids', '[]'::jsonb)) WITH ORDINALITY AS fsid(id, ordinality)
          JOIN sessions se ON se.id = fsid.id::uuid
          ORDER BY
            se.weekday,
            se.start_time,
            (pr.payload->'fall_session_start_dates'->>(se.id::text)) IS NULL,
            fsid.ordinality DESC
        ) slot
      ) fsl ON true
      LEFT JOIN LATERAL (
        SELECT ARRAY_AGG(slot.label ORDER BY slot.weekday, slot.start_time) AS fall_waitlist_session_labels
        FROM (
          SELECT DISTINCT ON (se.weekday, se.start_time)
            se.weekday,
            se.start_time,
            se.weekday || ' ' || to_char(se.start_time, 'FMHH12:MI AM') AS label
          FROM jsonb_array_elements_text(COALESCE(pr.payload->'fall_waitlist_session_ids', '[]'::jsonb)) WITH ORDINALITY AS fsid(id, ordinality)
          JOIN sessions se ON se.id = fsid.id::uuid
          ORDER BY
            se.weekday,
            se.start_time,
            fsid.ordinality DESC
        ) slot
      ) fwl ON true
      LEFT JOIN LATERAL (
        SELECT se.weekday, se.start_time
        FROM enrolments e
        JOIN sessions se ON se.id = e.session_id
        WHERE e.student_id = s.id
        ORDER BY e.start_date DESC NULLS LAST
        LIMIT 1
      ) le ON true
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)::int AS previous_submission_count,
          MAX(h.submitted_at) AS previous_submitted_at,
          COALESCE(
            JSON_AGG(
              JSON_BUILD_OBJECT(
                'request_id', h.id::text,
                'request_type', h.request_type,
                'summer_status', COALESCE(h.payload->>'summer_status', 'other'),
                'session_labels', COALESCE(hsl.session_labels, '{}'),
                'waitlist_session_labels', COALESCE(hwl.waitlist_session_labels, '{}'),
                'pickup_requested', COALESCE((h.payload->>'pickup_requested')::boolean, FALSE),
                'pickup_school', h.payload->>'pickup_school',
                'pickup_school_other', h.payload->>'pickup_school_other',
                'fall_status', h.payload->>'fall_status',
                'fall_session_labels', COALESCE(hfsl.fall_session_labels, '{}'),
                'fall_waitlist_session_labels', COALESCE(hfwl.fall_waitlist_session_labels, '{}'),
                'fall_notes', h.payload->>'fall_notes',
                'status', h.status,
                'custom_notes', h.custom_notes,
                'submitted_by', COALESCE(h.submitted_by, 'parent'),
                'submitted_by_name', h.submitted_by_name,
                'submitted_at', h.submitted_at,
                'added_to_portal_at', h.added_to_portal_at,
                'added_to_portal_by', h.added_to_portal_by
              )
              ORDER BY h.submitted_at DESC
            ) FILTER (WHERE h.id IS NOT NULL),
            '[]'::json
          ) AS submission_history
        FROM parent_requests h
        LEFT JOIN LATERAL (
          SELECT ARRAY_AGG(
            se.weekday || ' ' || to_char(se.start_time, 'FMHH12:MI AM')
            || COALESCE(
                 ' (start ' ||
                 to_char((h.payload->'session_start_dates'->>(se.id::text))::date, 'Mon DD')
                 || ')',
                 ''
               )
            ORDER BY se.weekday, se.start_time
          ) AS session_labels
          FROM jsonb_array_elements_text(COALESCE(h.payload->'session_ids', '[]'::jsonb)) AS sid
          JOIN sessions se ON se.id = sid::uuid
        ) hsl ON true
        LEFT JOIN LATERAL (
          SELECT ARRAY_AGG(
            se.weekday || ' ' || to_char(se.start_time, 'FMHH12:MI AM')
            ORDER BY se.weekday, se.start_time
          ) AS waitlist_session_labels
          FROM jsonb_array_elements_text(COALESCE(h.payload->'waitlist_session_ids', '[]'::jsonb)) AS sid
          JOIN sessions se ON se.id = sid::uuid
        ) hwl ON true
        LEFT JOIN LATERAL (
          SELECT ARRAY_AGG(slot.label ORDER BY slot.weekday, slot.start_time) AS fall_session_labels
          FROM (
            SELECT DISTINCT ON (se.weekday, se.start_time)
              se.weekday,
              se.start_time,
              se.weekday || ' ' || to_char(se.start_time, 'FMHH12:MI AM')
              || COALESCE(
                   ' (start ' ||
                   to_char((h.payload->'fall_session_start_dates'->>(se.id::text))::date, 'Mon DD')
                   || ')',
                   ''
                 ) AS label
            FROM jsonb_array_elements_text(COALESCE(h.payload->'fall_session_ids', '[]'::jsonb)) WITH ORDINALITY AS fsid(id, ordinality)
            JOIN sessions se ON se.id = fsid.id::uuid
            ORDER BY
              se.weekday,
              se.start_time,
              (h.payload->'fall_session_start_dates'->>(se.id::text)) IS NULL,
              fsid.ordinality DESC
          ) slot
        ) hfsl ON true
        LEFT JOIN LATERAL (
          SELECT ARRAY_AGG(slot.label ORDER BY slot.weekday, slot.start_time) AS fall_waitlist_session_labels
          FROM (
            SELECT DISTINCT ON (se.weekday, se.start_time)
              se.weekday,
              se.start_time,
              se.weekday || ' ' || to_char(se.start_time, 'FMHH12:MI AM') AS label
            FROM jsonb_array_elements_text(COALESCE(h.payload->'fall_waitlist_session_ids', '[]'::jsonb)) WITH ORDINALITY AS fsid(id, ordinality)
            JOIN sessions se ON se.id = fsid.id::uuid
            ORDER BY
              se.weekday,
              se.start_time,
              fsid.ordinality DESC
          ) slot
        ) hfwl ON true
        WHERE h.token_id = pr.token_id
          AND h.student_id = pr.student_id
          AND h.id <> pr.id
          AND h.request_type IN ('summer_scheduling', 'other')
          AND h.removed_at IS NULL
      ) history ON true
      WHERE pr.is_latest = TRUE
        AND pr.removed_at IS NULL
        AND pr.request_type IN ('summer_scheduling', 'other')
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
      current_weekday: string | null;
      current_start_time: string | null;
      current_sessions_snapshot: CurrentSessionSummary[];
      summer_status: string;
      session_labels: string[];
      waitlist_session_labels: string[];
      pickup_requested: boolean;
      pickup_school: string | null;
      pickup_school_other: string | null;
      fall_status: string | null;
      fall_session_labels: string[];
      fall_waitlist_session_labels: string[];
      fall_notes: string | null;
      custom_notes: string | null;
      previous_submission_count: number;
    }[]>`
      SELECT
        s.name AS student_name,
        le.weekday AS current_weekday,
        le.start_time AS current_start_time,
        COALESCE(pr.payload->'current_sessions_snapshot', '[]'::jsonb) AS current_sessions_snapshot,
        COALESCE(pr.payload->>'summer_status', 'other') AS summer_status,
        COALESCE(sl.session_labels, '{}') AS session_labels,
        COALESCE(wl.waitlist_session_labels, '{}') AS waitlist_session_labels,
        COALESCE((pr.payload->>'pickup_requested')::boolean, FALSE) AS pickup_requested,
        pr.payload->>'pickup_school' AS pickup_school,
        pr.payload->>'pickup_school_other' AS pickup_school_other,
        pr.payload->>'fall_status' AS fall_status,
        COALESCE(fsl.fall_session_labels, '{}') AS fall_session_labels,
        COALESCE(fwl.fall_waitlist_session_labels, '{}') AS fall_waitlist_session_labels,
        pr.payload->>'fall_notes' AS fall_notes,
        pr.custom_notes,
        COALESCE(history.previous_submission_count, 0)::int AS previous_submission_count
      FROM parent_tokens pt
      JOIN parent_requests pr ON pr.token_id = pt.id AND pr.is_latest = TRUE AND pr.removed_at IS NULL AND pr.request_type IN ('summer_scheduling', 'other')
      JOIN students s ON s.id = pr.student_id
      LEFT JOIN LATERAL (
        SELECT se.weekday, se.start_time
        FROM enrolments e
        JOIN sessions se ON se.id = e.session_id
        WHERE e.student_id = s.id
        ORDER BY e.start_date DESC NULLS LAST
        LIMIT 1
      ) le ON true
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
          ORDER BY se.weekday, se.start_time
        ) AS waitlist_session_labels
        FROM jsonb_array_elements_text(COALESCE(pr.payload->'waitlist_session_ids', '[]'::jsonb)) AS sid
        JOIN sessions se ON se.id = sid::uuid
      ) wl ON true
      LEFT JOIN LATERAL (
        SELECT ARRAY_AGG(slot.label ORDER BY slot.weekday, slot.start_time) AS fall_session_labels
        FROM (
          SELECT DISTINCT ON (se.weekday, se.start_time)
            se.weekday,
            se.start_time,
            se.weekday || ' ' || to_char(se.start_time, 'FMHH12:MI AM')
            || COALESCE(
                 ' (start ' ||
                 to_char((pr.payload->'fall_session_start_dates'->>(se.id::text))::date, 'Mon DD')
                 || ')',
                 ''
               ) AS label
          FROM jsonb_array_elements_text(COALESCE(pr.payload->'fall_session_ids', '[]'::jsonb)) WITH ORDINALITY AS fsid(id, ordinality)
          JOIN sessions se ON se.id = fsid.id::uuid
          ORDER BY
            se.weekday,
            se.start_time,
            (pr.payload->'fall_session_start_dates'->>(se.id::text)) IS NULL,
            fsid.ordinality DESC
        ) slot
      ) fsl ON true
      LEFT JOIN LATERAL (
        SELECT ARRAY_AGG(slot.label ORDER BY slot.weekday, slot.start_time) AS fall_waitlist_session_labels
        FROM (
          SELECT DISTINCT ON (se.weekday, se.start_time)
            se.weekday,
            se.start_time,
            se.weekday || ' ' || to_char(se.start_time, 'FMHH12:MI AM') AS label
          FROM jsonb_array_elements_text(COALESCE(pr.payload->'fall_waitlist_session_ids', '[]'::jsonb)) WITH ORDINALITY AS fsid(id, ordinality)
          JOIN sessions se ON se.id = fsid.id::uuid
          ORDER BY
            se.weekday,
            se.start_time,
            fsid.ordinality DESC
        ) slot
      ) fwl ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS previous_submission_count
        FROM parent_requests h
        WHERE h.token_id = pr.token_id
          AND h.student_id = pr.student_id
          AND h.id <> pr.id
          AND h.request_type IN ('summer_scheduling', 'other')
          AND h.removed_at IS NULL
      ) history ON true
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
