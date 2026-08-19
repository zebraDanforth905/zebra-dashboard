import postgres from 'postgres';
import { cacheTag } from 'next/cache';
import {
  CurrentSessionSummary,
  FallConfirmationPayload,
  FallConfirmationStatus,
  FallFormData,
  FallFormStudentData,
  FallPickupSchool,
  FallSlotChoice,
  FallSummerPlan,
  FallResponseRow,
  ParentRequestStatus,
} from './definitions';
import {
  FALL_CATALOGUE_SLOTS,
  FALL_TERM_START_DATE,
  firstClassDateFor,
  slotKey,
  weekdayIndex,
} from './fall-policy';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

function asPickupSchool(value: unknown): FallPickupSchool | null {
  return value === 'Jackman' || value === 'Frankland' ? value : null;
}

function asIsoDate(value: unknown): string | null {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

type SummerPayloadShape = {
  fall_status?: string;
  fall_start_date?: string;
  fall_session_start_dates?: Record<string, string>;
  pickup_requested?: boolean;
  pickup_school?: string;
  fall_notes?: string;
  // The class they were in when the summer form was submitted. For families whose
  // enrolment rows have since been cleared, this is the only record of it.
  current_sessions_snapshot?: CurrentSessionSummary[];
};

/**
 * Sessions held on parent_tokens.last_active_snapshot, keyed by student id.
 * Mirrors normalizeTokenSnapshotDisplaySessions in summer-data.ts.
 */
function normalizeTokenSnapshot(value: unknown): Map<string, CurrentSessionSummary[]> {
  const byStudent = new Map<string, CurrentSessionSummary[]>();
  if (!Array.isArray(value)) return byStudent;

  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const entry = raw as Record<string, unknown>;
    const studentId = typeof entry.student_id === 'string' ? entry.student_id.trim() : '';
    const weekday = typeof entry.weekday === 'string' ? entry.weekday.trim() : '';
    const startTime = typeof entry.start_time === 'string' ? entry.start_time.trim() : '';
    if (!studentId || !weekday || !startTime) continue;

    byStudent.set(studentId, [
      ...(byStudent.get(studentId) ?? []),
      {
        weekday,
        start_time: startTime,
        pickup_school: typeof entry.pickup_school === 'string' ? entry.pickup_school : null,
        course_name: typeof entry.course_name === 'string' ? entry.course_name : null,
      },
    ]);
  }
  return byStudent;
}

/**
 * Resolves the prefill for one student, in priority order:
 *   1. their latest fall confirmation (they've answered before — show it back)
 *   2. their summer form response (the "previously filled out info" this form confirms)
 *   3. their current enrolment (never answered anything — show what they're in today)
 */
function toSlots(
  sessions: {
    weekday: string;
    start_time: string;
    start_date?: string | null;
    course_name?: string | null;
    change_course?: boolean;
  }[],
  defaultStartDate: string | null,
  // Course to assume when the slot itself has none — e.g. a change request, where the
  // student is not yet enrolled in the session they asked for.
  fallbackCourse: string | null = null,
): FallSlotChoice[] {
  const seen = new Set<string>();
  const slots: FallSlotChoice[] = [];
  for (const session of sessions) {
    if (!session?.weekday || !session?.start_time) continue;
    const key = `${session.weekday}|${session.start_time}`;
    if (seen.has(key)) continue;
    seen.add(key);
    slots.push({
      weekday: session.weekday,
      start_time: session.start_time,
      // Their own choice wins; otherwise the first instance of THIS slot's weekday
      // on or after the term start.
      start_date:
        asIsoDate(session.start_date) ?? defaultStartDate ?? firstClassDateFor(session.weekday),
      course_name: session.course_name?.trim() || fallbackCourse,
      change_course: session.change_course === true,
    });
  }
  return slots;
}

function resolvePrefill(
  fallPayload: Partial<FallConfirmationPayload> | null,
  summerPayload: SummerPayloadShape | null,
  summerFallSlots: {
    weekday: string;
    start_time: string;
    start_date?: string | null;
    course_name?: string | null;
  }[],
  currentSessions: CurrentSessionSummary[],
): Pick<
  FallFormStudentData,
  | 'prefill_slots'
  | 'prefill_start_date'
  | 'prefill_pickup_requested'
  | 'prefill_pickup_school'
  | 'prefill_source'
> {
  const knownCourse = currentSessions.find(session => session.course_name)?.course_name ?? null;

  if (fallPayload) {
    const slots = fallPayload.slots ?? [];
    return {
      prefill_slots: toSlots(slots, null, knownCourse),
      prefill_start_date: asIsoDate(slots[0]?.start_date) ?? FALL_TERM_START_DATE,
      prefill_pickup_requested: fallPayload.pickup_requested ?? false,
      prefill_pickup_school: asPickupSchool(fallPayload.pickup_school),
      prefill_source: fallPayload.prefill_source ?? 'none',
    };
  }

  if (summerPayload) {
    // fall_status='change' carries explicit session choices; every other status means
    // "whatever they're enrolled in now", so fall back to the current enrolments.
    const slots = summerFallSlots.length > 0 ? summerFallSlots : currentSessions;
    // fall_start_date is the single date from 'same'; per-session dates ride on each
    // summer slot already, so this only fills gaps.
    // null falls through to firstClassDateFor per slot weekday inside toSlots.
    const startDate =
      asIsoDate(summerPayload.fall_start_date) ??
      asIsoDate(Object.values(summerPayload.fall_session_start_dates ?? {})[0]) ??
      null;
    return {
      prefill_slots: toSlots(slots, startDate, knownCourse),
      prefill_start_date: startDate ?? FALL_TERM_START_DATE,
      prefill_pickup_requested: summerPayload.pickup_requested === true,
      prefill_pickup_school: asPickupSchool(summerPayload.pickup_school),
      prefill_source: 'summer_form',
    };
  }

  return {
    prefill_slots: toSlots(currentSessions, null, knownCourse),
    prefill_start_date: FALL_TERM_START_DATE,
    prefill_pickup_requested: Boolean(currentSessions[0]?.pickup_school),
    prefill_pickup_school: asPickupSchool(currentSessions[0]?.pickup_school),
    prefill_source: currentSessions.length > 0 ? 'current_enrolment' : 'none',
  };
}

// NO cache — public route, must always reflect current DB state.
export async function fetchFallFormData(
  token: string,
  includeInactiveStudents = false,
): Promise<FallFormData | null> {
  try {
    const tokenRows = await sql<{
      token_id: string;
      customer_id: string;
      customer_name: string;
      customer_alternate_name: string | null;
      snapshot_student_ids: string[];
      last_active_snapshot: unknown;
    }[]>`
      SELECT
        pt.id::text AS token_id,
        c.id::text AS customer_id,
        c.name AS customer_name,
        c.alternate_name AS customer_alternate_name,
        COALESCE(to_jsonb(pt)->'last_active_snapshot', '[]'::jsonb) AS last_active_snapshot,
        COALESCE(
          ARRAY(
            SELECT snapshot.student_id
            FROM jsonb_to_recordset(
              COALESCE(to_jsonb(pt)->'last_active_snapshot', '[]'::jsonb)
            ) AS snapshot(student_id TEXT)
            WHERE NULLIF(snapshot.student_id, '') IS NOT NULL
          ),
          '{}'
        ) AS snapshot_student_ids
      FROM parent_tokens pt
      JOIN customers c ON c.id = pt.customer_id
      WHERE pt.token = ${token}
      LIMIT 1
    `;
    if (tokenRows.length === 0) return null;

    const {
      token_id,
      customer_id,
      customer_name,
      customer_alternate_name,
      snapshot_student_ids,
      last_active_snapshot,
    } = tokenRows[0];
    const tokenSnapshotByStudentId = normalizeTokenSnapshot(last_active_snapshot);

    const studentRows = await sql<{
      student_id: string;
      student_name: string;
      is_active: boolean;
      current_sessions: CurrentSessionSummary[] | null;
      fall_payload: Partial<FallConfirmationPayload> | null;
      fall_status: ParentRequestStatus | null;
      fall_notes: string | null;
      fall_submitted_at: Date | null;
      summer_payload: SummerPayloadShape | null;
      summer_submitted_at: Date | null;
      summer_fall_sessions: {
        weekday: string;
        start_time: string;
        end_time: string | null;
        start_date: string | null;
        course_name: string | null;
      }[];
    }[]>`
      SELECT
        s.id::text AS student_id,
        s.name AS student_name,
        COALESCE(cs.is_active, FALSE) AS is_active,
        cs.current_sessions,
        fc.payload AS fall_payload,
        fc.status AS fall_status,
        fc.custom_notes AS fall_notes,
        fc.submitted_at AS fall_submitted_at,
        sr.payload AS summer_payload,
        sr.submitted_at AS summer_submitted_at,
        sfs.sessions AS summer_fall_sessions
      FROM students s
      LEFT JOIN LATERAL (
        SELECT
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'weekday', slots.weekday,
              'start_time', slots.start_time,
              'pickup_school', slots.pickup_school,
              'course_name', slots.course_name,
              'end_date', slots.end_date
            )
            ORDER BY slots.weekday_order, slots.start_time
          ) AS current_sessions,
          COUNT(slots.weekday)::int > 0 AS is_active
        FROM (
          SELECT DISTINCT
            se.weekday,
            se.start_time::text AS start_time,
            co.name AS course_name,
            e.end_date::text AS end_date,
            NULL::text AS pickup_school,
            CASE LOWER(TRIM(se.weekday))
              WHEN 'monday' THEN 1 WHEN 'tuesday' THEN 2 WHEN 'wednesday' THEN 3
              WHEN 'thursday' THEN 4 WHEN 'friday' THEN 5 WHEN 'saturday' THEN 6
              WHEN 'sunday' THEN 7 ELSE 8
            END AS weekday_order
          FROM enrolments e
          JOIN sessions se ON se.id = e.session_id
          LEFT JOIN courses co ON co.id = e.course_id
          -- No end_date filter, matching fetchParentFormData: last school year's
          -- enrolments have already ended by the time this form goes out in August,
          -- and they are exactly the class the family is being asked to confirm.
          WHERE e.student_id = s.id
            AND se.is_summer = FALSE
        ) slots
      ) cs ON TRUE
      LEFT JOIN LATERAL (
        SELECT pr.payload, pr.status, pr.custom_notes, pr.submitted_at
        FROM parent_requests pr
        WHERE pr.token_id = ${token_id}::uuid
          AND pr.student_id = s.id
          AND pr.request_type = 'fall_confirmation'
          AND pr.is_latest = TRUE
          AND pr.removed_at IS NULL
        ORDER BY pr.submitted_at DESC
        LIMIT 1
      ) fc ON TRUE
      LEFT JOIN LATERAL (
        SELECT pr.payload, pr.submitted_at
        FROM parent_requests pr
        WHERE pr.token_id = ${token_id}::uuid
          AND pr.student_id = s.id
          AND pr.request_type IN ('summer_scheduling', 'other')
          AND pr.is_latest = TRUE
          AND pr.removed_at IS NULL
        ORDER BY pr.submitted_at DESC
        LIMIT 1
      ) sr ON TRUE
      LEFT JOIN LATERAL (
        -- Every fall session they picked, not just the first, so the summary matches
        -- what they actually submitted when they chose more than one slot.
        SELECT COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'weekday', se.weekday,
              'start_time', se.start_time::text,
              'end_time', se.end_time::text,
              'course_name', sfc.course_name,
              -- fall_session_start_dates is keyed by session id on the summer payload
              'start_date', sr.payload->'fall_session_start_dates'->>se.id::text
            )
            ORDER BY se.weekday, se.start_time
          ),
          '[]'::json
        ) AS sessions
        FROM jsonb_array_elements_text(
          CASE
            WHEN jsonb_typeof(sr.payload->'fall_session_ids') = 'array'
              THEN sr.payload->'fall_session_ids'
            ELSE '[]'::jsonb
          END
        ) AS fid
        JOIN sessions se ON se.id::text = fid
        -- Course the student already takes in that slot, when they have one.
        LEFT JOIN LATERAL (
          SELECT co.name AS course_name
          FROM enrolments e2
          LEFT JOIN courses co ON co.id = e2.course_id
          WHERE e2.student_id = s.id AND e2.session_id = se.id
          LIMIT 1
        ) sfc ON TRUE
        -- Summer slots run at times we don't offer in fall, so a stray summer id in the
        -- payload must never become a prefill the parent could confirm.
        WHERE se.is_summer = FALSE
      ) sfs ON TRUE
      WHERE s.customer_id = ${customer_id}::uuid
        AND (
          ${includeInactiveStudents}::boolean
          OR EXISTS (SELECT 1 FROM enrolments e WHERE e.student_id = s.id)
          OR s.id::text = ANY(${snapshot_student_ids}::text[])
        )
      ORDER BY s.name
    `;

    // Only used to label a slot as full and to recover a real end time for a student's
    // own off-catalogue slot. NOT the source of which slots are offered — see
    // FALL_CATALOGUE_SLOTS for why that cannot come from this table.
    const existingRows = await sql<{
      weekday: string;
      start_time: string;
      end_time: string;
      is_full: boolean;
    }[]>`
      SELECT
        s.weekday,
        s.start_time::text AS start_time,
        MIN(s.end_time)::text AS end_time,
        BOOL_OR(COALESCE(s.is_full, FALSE)) AS is_full
      FROM sessions s
      WHERE s.is_summer = FALSE
      GROUP BY s.weekday, s.start_time
    `;
    const existingByKey = new Map(
      existingRows.map(row => [slotKey(row.weekday, row.start_time), row]),
    );

    const students: FallFormStudentData[] = studentRows.map(row => {
      // Same precedence as fetchParentFormData: live enrolments, then the token's frozen
      // roster, then the snapshot captured on the summer response. Families whose
      // enrolment rows were cleared after the school year still have a class to confirm.
      const dbCurrentSessions = row.current_sessions ?? [];
      const tokenCurrentSessions = tokenSnapshotByStudentId.get(row.student_id) ?? [];
      const payloadCurrentSessions = row.summer_payload?.current_sessions_snapshot ?? [];
      const currentSessions =
        dbCurrentSessions.length > 0
          ? dbCurrentSessions
          : tokenCurrentSessions.length > 0
            ? tokenCurrentSessions
            : payloadCurrentSessions;
      const summerSessions = row.summer_fall_sessions ?? [];
      const summerFallSlots =
        row.summer_payload?.fall_status === 'change' ? summerSessions : [];

      const summerPlan: FallSummerPlan | null = row.summer_payload
        ? {
            fall_status: row.summer_payload.fall_status ?? null,
            sessions: summerSessions,
            start_date:
              asIsoDate(row.summer_payload.fall_start_date) ??
              asIsoDate(Object.values(row.summer_payload.fall_session_start_dates ?? {})[0]),
            pickup_requested: row.summer_payload.pickup_requested === true,
            pickup_school: asPickupSchool(row.summer_payload.pickup_school),
            notes: row.summer_payload.fall_notes?.trim() || null,
            submitted_at: row.summer_submitted_at,
          }
        : null;

      return {
        student_id: row.student_id,
        student_name: row.student_name,
        is_active: row.is_active,
        current_sessions: currentSessions,
        summer_plan: summerPlan,
        ...resolvePrefill(row.fall_payload, row.summer_payload, summerFallSlots, currentSessions),
        latest_status:
          (row.fall_payload?.fall_confirmation_status as FallConfirmationStatus | undefined) ?? null,
        latest_notes: row.fall_notes,
        latest_submitted_at: row.fall_submitted_at,
      };
    });

    // The hard-coded catalogue, plus any slot a student on this token is prefilled into
    // (a previous enrolment or their stated summer preference). The extras keep "keep
    // what we have" workable for families in a non-standard time.
    const fallSlots: {
      weekday: string;
      start_time: string;
      end_time: string | null;
      is_full: boolean;
    }[] =
      FALL_CATALOGUE_SLOTS.map(slot => ({
        weekday: slot.weekday,
        start_time: slot.start_time,
        end_time: slot.end_time,
        is_full: existingByKey.get(slotKey(slot.weekday, slot.start_time))?.is_full ?? false,
      }));
    const offeredKeys = new Set(fallSlots.map(slot => slotKey(slot.weekday, slot.start_time)));

    for (const student of students) {
      // Both sources: a student who answered PAUSE has no prefill slots, but their current
      // class must still be selectable if they change their mind on this form.
      const studentSlots = [
        ...student.prefill_slots,
        ...student.current_sessions.map(session => ({
          weekday: session.weekday,
          start_time: session.start_time,
        })),
      ];
      for (const prefill of studentSlots) {
        const key = slotKey(prefill.weekday, prefill.start_time);
        if (offeredKeys.has(key)) continue;
        offeredKeys.add(key);
        const existing = existingByKey.get(key);
        fallSlots.push({
          weekday: prefill.weekday,
          start_time: prefill.start_time,
          // A pruned session leaves no end time behind. Guessing +1h printed a wrong
          // time to parents (a 10:30-12:00 class showed as 10:30-11:30), so show none.
          end_time: existing?.end_time ?? null,
          is_full: existing?.is_full ?? false,
        });
      }
    }

    fallSlots.sort(
      (a, b) =>
        weekdayIndex(a.weekday) - weekdayIndex(b.weekday) ||
        a.start_time.localeCompare(b.start_time),
    );

    return {
      token_id,
      customer_id,
      customer_name,
      customer_alternate_name,
      students,
      fall_slots: fallSlots.map(({ weekday, start_time, end_time, is_full }) => ({
        weekday,
        start_time,
        end_time,
        is_full,
      })),
      default_start_date: FALL_TERM_START_DATE,
    };
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch fall confirmation form data.');
  }
}

export async function fetchFallResponseRows(): Promise<FallResponseRow[]> {
  'use cache';
  cacheTag('fall-responses');
  try {
    return await sql<FallResponseRow[]>`
      SELECT
        pr.id::text AS request_id,
        pr.token_id::text AS token_id,
        pt.token,
        c.id::text AS customer_id,
        c.name AS customer_name,
        c.alternate_name,
        c.email,
        c.alternate_email,
        s.id::text AS student_id,
        s.name AS student_name,
        pr.status,
        pr.payload->>'fall_confirmation_status' AS fall_confirmation_status,
        COALESCE(sls.slots, '[]'::json) AS slots,
        COALESCE(sls.unmatched_slot_count, 0)::int AS unmatched_slot_count,
        COALESCE(sls.change_course_count, 0)::int AS change_course_count,
        COALESCE((pr.payload->>'pickup_requested')::boolean, FALSE) AS pickup_requested,
        pr.payload->>'pickup_school' AS pickup_school,
        pr.custom_notes AS notes,
        COALESCE(pr.submitted_by, 'parent') AS submitted_by,
        pr.submitted_by_name,
        pr.submitted_at,
        COALESCE(pr.enrolment_ids, '{}')::text[] AS enrolment_ids,
        COALESCE(cs.current_enrolments, '[]'::json) AS current_enrolments,
        COALESCE(cs.active_enrolment_count, 0)::int AS active_enrolment_count,
        COALESCE(ri.recurring_invoices, '[]'::json) AS recurring_invoices
      FROM parent_requests pr
      JOIN students s ON s.id = pr.student_id
      JOIN customers c ON c.id = s.customer_id
      JOIN parent_tokens pt ON pt.id = pr.token_id
      LEFT JOIN LATERAL (
        -- One entry per live enrolment (not per distinct slot) so each carries its own
        -- enrolment_id and can be ended individually from the responses tab.
        SELECT
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'enrolment_id', slots.enrolment_id,
              'weekday', slots.weekday,
              'start_time', slots.start_time,
              'course_name', slots.course_name,
              'end_date', slots.end_date
            )
            ORDER BY slots.weekday_order, slots.start_time, slots.course_name
          ) AS current_enrolments,
          COUNT(*)::int AS active_enrolment_count
        FROM (
          SELECT
            e.id::text AS enrolment_id,
            se.weekday,
            se.start_time::text AS start_time,
            co.name AS course_name,
            e.end_date::text AS end_date,
            CASE LOWER(TRIM(se.weekday))
              WHEN 'monday' THEN 1 WHEN 'tuesday' THEN 2 WHEN 'wednesday' THEN 3
              WHEN 'thursday' THEN 4 WHEN 'friday' THEN 5 WHEN 'saturday' THEN 6
              WHEN 'sunday' THEN 7 ELSE 8
            END AS weekday_order
          FROM enrolments e
          JOIN sessions se ON se.id = e.session_id
          LEFT JOIN courses co ON co.id = e.course_id
          WHERE e.student_id = s.id
            AND se.is_summer = FALSE
            AND COALESCE(e.end_date, DATE '9999-12-31') >= CURRENT_DATE
        ) slots
      ) cs ON TRUE
      LEFT JOIN LATERAL (
        -- Expand every requested slot and resolve it to a fall session, so staff can see
        -- at a glance which of a multi-class request are actually bookable.
        SELECT
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'weekday', el.val->>'weekday',
              'start_time', el.val->>'start_time',
              'start_date', el.val->>'start_date',
              'course_name', el.val->>'course_name',
              'change_course', COALESCE((el.val->>'change_course')::boolean, FALSE),
              'matched_session_id', ms.id,
              'is_full', COALESCE(ms.is_full, FALSE)
            )
            ORDER BY el.ord
          ) AS slots,
          COUNT(*) FILTER (WHERE ms.id IS NULL)::int AS unmatched_slot_count,
          COUNT(*) FILTER (WHERE COALESCE((el.val->>'change_course')::boolean, FALSE))::int
            AS change_course_count
        FROM jsonb_array_elements(
          CASE
            WHEN jsonb_typeof(pr.payload->'slots') = 'array' THEN pr.payload->'slots'
            ELSE '[]'::jsonb
          END
        ) WITH ORDINALITY AS el(val, ord)
        LEFT JOIN LATERAL (
          SELECT se.id::text AS id, COALESCE(se.is_full, FALSE) AS is_full
          FROM sessions se
          WHERE se.is_summer = FALSE
            AND se.weekday = el.val->>'weekday'
            AND se.start_time = (el.val->>'start_time')::time
          ORDER BY se.id
          LIMIT 1
        ) ms ON TRUE
      ) sls ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'id', r.id::text,
              'amount', r.amount,
              'every', r.every,
              'next_date', r.next_date,
              'description', r.description
            )
            ORDER BY r.next_date
          ) AS recurring_invoices
        FROM recurring_invoices r
        WHERE r.customer_id = c.id
      ) ri ON TRUE
      WHERE pr.request_type = 'fall_confirmation'
        AND pr.is_latest = TRUE
        AND pr.removed_at IS NULL
      ORDER BY c.name, s.name
    `;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch fall response rows.');
  }
}
