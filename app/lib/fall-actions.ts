'use server';

import postgres from 'postgres';
import { revalidatePath, revalidateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import {
  FallConfirmationPayload,
  FallConfirmationStatus,
  FallPickupSchool,
  FallSlotChoice,
} from './definitions';
import {
  buildCourseResolvers,
  catalogueEndTime,
  FALL_PICKUP_SCHOOLS,
  isCatalogueSlot,
} from './fall-policy';
import {
  createEnrolment,
  fetchCourseBatches,
  fetchCourseFees,
  fetchPrograms,
} from './scraper_helpers';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });
type PostgresJsonValue = Parameters<typeof sql.json>[0];

type SessionUserWithType = {
  name?: string | null;
  email?: string | null;
  user_type?: string;
};

async function requireAdmin(): Promise<void> {
  const session = await auth();
  const userType = (session?.user as SessionUserWithType | undefined)?.user_type;
  if (userType !== 'admin') {
    throw new Error('Forbidden: admin access required');
  }
}

async function staffDisplayName(): Promise<string> {
  const session = await auth();
  const sessionUser = session?.user as SessionUserWithType | undefined;
  return sessionUser?.name?.trim() || sessionUser?.email?.trim() || 'staff';
}

function revalidateFall(): void {
  revalidateTag('fall-responses', 'max');
  revalidateTag('summer-tokens', 'max');
  // The tag alone left the rendered tab stale after enrolling: the new enrolment exists,
  // but the "Currently in" column is server-rendered and the route was not re-run.
  revalidatePath('/dashboard/summer');
}

const VALID_STATUSES = new Set<FallConfirmationStatus>(['confirmed', 'not_returning', 'paused']);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

type FallFormEntry = {
  student_id: string;
  fall_confirmation_status: FallConfirmationStatus;
  slots?: FallSlotChoice[];
  start_date?: string | null;
  pickup_requested?: boolean;
  pickup_school?: string | null;
  notes?: string | null;
  prefill_source?: FallConfirmationPayload['prefill_source'];
};

// ---------------------------------------------------------------------------
// Parent-facing submission
// ---------------------------------------------------------------------------

export async function submitFallConfirmation(
  prevState: { error: string } | undefined,
  formData: FormData,
): Promise<{ error: string } | undefined> {
  const token = formData.get('token');
  if (!token || typeof token !== 'string') return { error: 'Invalid link.' };

  const tokenRows = await sql<{ id: string; customer_id: string }[]>`
    SELECT id, customer_id FROM parent_tokens WHERE token = ${token} LIMIT 1
  `;
  if (tokenRows.length === 0) return { error: 'Link not found or has expired.' };
  const tokenId = tokenRows[0].id;
  const customerId = tokenRows[0].customer_id;

  const studentsJson = formData.get('students');
  if (!studentsJson || typeof studentsJson !== 'string') return { error: 'Missing submission data.' };

  let entries: FallFormEntry[];
  try {
    entries = JSON.parse(studentsJson) as FallFormEntry[];
  } catch {
    return { error: 'Malformed submission data.' };
  }
  if (!Array.isArray(entries) || entries.length === 0) {
    return { error: 'No student data submitted.' };
  }

  const staffEntryRequested = formData.get('staff_entry') === '1';
  const session = staffEntryRequested ? await auth() : null;
  const sessionUser = session?.user as SessionUserWithType | undefined;
  const isStaffEntry = staffEntryRequested && sessionUser?.user_type === 'admin';
  const submittedBy = isStaffEntry ? 'staff' : 'parent';
  const submittedByName = isStaffEntry
    ? sessionUser?.name?.trim() || sessionUser?.email?.trim() || 'staff'
    : null;

  if (entries.some(entry => !VALID_STATUSES.has(entry.fall_confirmation_status))) {
    return { error: 'One or more choices are invalid. Please reload and try again.' };
  }

  // Only students belonging to this token's family may be submitted.
  const eligible = await sql<{ id: string }[]>`
    SELECT s.id::text AS id FROM students s WHERE s.customer_id = ${customerId}::uuid
  `;
  const eligibleIds = new Set(eligible.map(row => row.id));
  const submittedIds = entries.map(entry => String(entry.student_id));
  if (new Set(submittedIds).size !== submittedIds.length) {
    return { error: 'Duplicate students in submission. Please reload and try again.' };
  }
  if (submittedIds.some(id => !eligibleIds.has(id))) {
    return { error: 'One or more students are not valid for this link. Please reload and try again.' };
  }

  // Confirmed students need at least one real slot and a start date.
  const confirmed = entries.filter(entry => entry.fall_confirmation_status === 'confirmed');
  for (const entry of confirmed) {
    const slots = Array.isArray(entry.slots) ? entry.slots : [];
    if (slots.length === 0) {
      return { error: 'Please choose at least one class time for every student you are confirming.' };
    }
    if (slots.some(slot => !slot?.weekday || !slot?.start_time)) {
      return { error: 'One or more class selections are incomplete. Please reload and try again.' };
    }
    const keys = slots.map(slot => `${slot.weekday}|${slot.start_time}`);
    if (new Set(keys).size !== keys.length) {
      return { error: 'The same class time was selected twice. Please reload and try again.' };
    }
    if (slots.some(slot => !slot.start_date || !ISO_DATE.test(slot.start_date))) {
      return { error: 'Please choose a first class date for every class you are confirming.' };
    }
    if (
      entry.pickup_requested &&
      !FALL_PICKUP_SCHOOLS.includes(entry.pickup_school as FallPickupSchool)
    ) {
      return { error: 'Please choose a pickup school, or select no pickup.' };
    }
  }

  // A slot is acceptable if it is in the hard-coded catalogue, or if this family has a
  // history with it (a past enrolment, the token's frozen roster, or the class recorded on
  // their summer response). Deliberately NOT checked against the sessions table: the
  // nightly scrape prunes empty non-summer sessions, so a catalogue slot nobody is in yet
  // has no row and a table check would reject every first enrolment.
  const allSlots = confirmed.flatMap(entry => entry.slots ?? []);
  const offCatalogue = allSlots.filter(slot => !isCatalogueSlot(slot.weekday, slot.start_time));
  if (offCatalogue.length > 0) {
    const historical = await sql<{ weekday: string; start_time: string }[]>`
      -- Past or present enrolments, at any date.
      SELECT DISTINCT se.weekday, se.start_time::text AS start_time
      FROM enrolments e
      JOIN sessions se ON se.id = e.session_id
      JOIN students s ON s.id = e.student_id
      WHERE s.customer_id = ${customerId}::uuid
        AND se.is_summer = FALSE
      UNION
      -- The token's frozen last-school-year roster.
      SELECT DISTINCT snapshot.weekday, snapshot.start_time
      FROM parent_tokens pt,
        jsonb_to_recordset(COALESCE(to_jsonb(pt)->'last_active_snapshot', '[]'::jsonb))
          AS snapshot(weekday TEXT, start_time TEXT)
      WHERE pt.id = ${tokenId}::uuid
        AND NULLIF(snapshot.weekday, '') IS NOT NULL
        AND NULLIF(snapshot.start_time, '') IS NOT NULL
      UNION
      -- Whatever their summer response recorded as current or preferred.
      SELECT DISTINCT snapshot.weekday, snapshot.start_time
      FROM parent_requests pr,
        jsonb_to_recordset(
          CASE
            WHEN jsonb_typeof(pr.payload->'current_sessions_snapshot') = 'array'
              THEN pr.payload->'current_sessions_snapshot'
            ELSE '[]'::jsonb
          END
        ) AS snapshot(weekday TEXT, start_time TEXT)
      WHERE pr.token_id = ${tokenId}::uuid
        AND pr.request_type IN ('summer_scheduling', 'other')
        AND pr.removed_at IS NULL
        AND NULLIF(snapshot.weekday, '') IS NOT NULL
        AND NULLIF(snapshot.start_time, '') IS NOT NULL
    `;
    const allowed = new Set(historical.map(row => `${row.weekday}|${row.start_time}`));
    if (offCatalogue.some(slot => !allowed.has(`${slot.weekday}|${slot.start_time}`))) {
      return { error: 'One or more selected class times are not available. Please reload and try again.' };
    }
  }

  await sql.begin(async tx => {
    for (const entry of entries) {
      await tx`
        UPDATE parent_requests
        SET is_latest = FALSE, status = 'superseded', updated_at = NOW()
        WHERE token_id = ${tokenId}::uuid
          AND student_id = ${Number(entry.student_id)}
          AND request_type = 'fall_confirmation'
          AND is_latest = TRUE
          AND removed_at IS NULL
      `;

      const isConfirmed = entry.fall_confirmation_status === 'confirmed';
      const payload: FallConfirmationPayload = {
        fall_confirmation_status: entry.fall_confirmation_status,
        slots: isConfirmed
          ? (entry.slots ?? []).map(slot => ({
              weekday: slot.weekday,
              start_time: slot.start_time,
              start_date: slot.start_date ?? null,
              course_id: slot.course_id?.trim() || null,
              change_course: slot.change_course === true,
            }))
          : [],
        pickup_requested: isConfirmed ? Boolean(entry.pickup_requested) : false,
        pickup_school:
          isConfirmed && entry.pickup_requested
            ? (entry.pickup_school as FallConfirmationPayload['pickup_school'])
            : null,
        prefill_source: entry.prefill_source ?? 'none',
      };
      const notes = typeof entry.notes === 'string' && entry.notes.trim() ? entry.notes.trim() : null;

      await tx`
        INSERT INTO parent_requests (
          token_id, student_id, request_type, status, is_latest,
          payload, custom_notes, submitted_by, submitted_by_name
        )
        VALUES (
          ${tokenId}::uuid,
          ${Number(entry.student_id)},
          'fall_confirmation',
          'pending',
          TRUE,
          ${sql.json(payload as unknown as PostgresJsonValue)}::jsonb,
          ${notes},
          ${submittedBy},
          ${submittedByName}
        )
      `;
    }
  });

  revalidateFall();
  redirect(`/fall-confirm/submitted?token=${encodeURIComponent(token)}`);
}

// ---------------------------------------------------------------------------
// Staff actions
// ---------------------------------------------------------------------------

type EnrolResult = { error?: string; created?: number };

/**
 * Resolve a weekday+time to a fall session row, creating it if the nightly scrape has
 * pruned it (it deletes non-summer sessions with no enrolments). Mirrors getSessionId in
 * insert_from_portal.ts, including the session_coverage conflict target.
 */
async function getOrCreateFallSessionId(weekday: string, startTime: string): Promise<string> {
  const existing = await sql<{ id: string }[]>`
    SELECT id::text FROM sessions
    WHERE is_summer = FALSE AND weekday = ${weekday} AND start_time = ${startTime}::time
    ORDER BY id
    LIMIT 1
  `;
  if (existing.length > 0) return existing[0].id;

  const endTime = catalogueEndTime(weekday, startTime);
  const inserted = await sql<{ id: string }[]>`
    INSERT INTO sessions (weekday, start_time, end_time, is_summer, is_full)
    VALUES (${weekday}, ${startTime}::time, ${endTime}::time, FALSE, FALSE)
    ON CONFLICT ON CONSTRAINT session_coverage DO NOTHING
    RETURNING id::text
  `;
  if (inserted.length > 0) return inserted[0].id;

  // Lost the race to a concurrent insert — re-read.
  const raced = await sql<{ id: string }[]>`
    SELECT id::text FROM sessions
    WHERE is_summer = FALSE AND weekday = ${weekday} AND start_time = ${startTime}::time
    ORDER BY id
    LIMIT 1
  `;
  if (raced.length === 0) {
    throw new Error(`Could not create a fall session for ${weekday} ${startTime}.`);
  }
  return raced[0].id;
}


/**
 * Resolves one fall slot to the portal ids a POST /students/batch needs, then creates the
 * enrolment there.
 *
 * Dashboard enrolments are a mirror of the portal: the nightly scrape deletes any
 * non-summer enrolment the portal does not have, so a dashboard-only insert is erased
 * within a day. The portal write is what actually persists.
 *
 * Choices, per staff instruction:
 *  - sub-course: the lowest-numbered level (beginner). Level is not tracked in the
 *    dashboard, and it is not tracked in the portal today either.
 *  - batch: among batches matching weekday + start AND end time, the one with the largest
 *    capacity. Several batches routinely share a time slot.
 *  - fee: the first fee on the course. Billing is driven by the dashboard's recurring
 *    invoices, not by this value.
 */
async function createPortalEnrolment(opts: {
  studentId: number;
  courseCode: string;
  weekday: string;
  startTime: string;
  endTime: string;
  startDate: string;
}): Promise<{ error?: string; batchId?: number }> {
  const programs = await fetchPrograms();
  const program = programs.find(
    candidate => candidate.course_code?.trim().toLowerCase() === opts.courseCode.trim().toLowerCase(),
  );
  if (!program) {
    return { error: `No portal course matches "${opts.courseCode}".` };
  }

  const batches = await fetchCourseBatches(program.id);
  const sameSlot = batches.filter(
    batch =>
      batch.day?.trim().toLowerCase() === opts.weekday.trim().toLowerCase() &&
      batch.start_time === opts.startTime &&
      batch.end_time === opts.endTime,
  );
  if (sameSlot.length === 0) {
    return {
      error:
        `No portal batch for ${program.course_code} on ${opts.weekday} ` +
        `${opts.startTime}-${opts.endTime}. Create it in the portal first.`,
    };
  }
  // Largest capacity wins; ties resolve on the lower id so repeat runs are deterministic.
  const batch = [...sameSlot].sort(
    (a, b) => (b.maximum_student ?? 0) - (a.maximum_student ?? 0) || a.batch_id - b.batch_id,
  )[0];

  const subCourses = [...(program.subCourses ?? [])].sort(
    (a, b) => (a.sub_course_order_num ?? 0) - (b.sub_course_order_num ?? 0),
  );
  const subCourseId = subCourses[0]?.sub_course_id;
  if (subCourseId == null) {
    return { error: `Portal course ${program.course_code} has no sub-course to enrol into.` };
  }

  const fees = await fetchCourseFees(program.id);
  const fee = fees[0];
  if (!fee) {
    return { error: `Portal course ${program.course_code} has no fee configured.` };
  }

  await createEnrolment({
    studentId: opts.studentId,
    courseId: program.id,
    subCourseId,
    batchId: batch.batch_id,
    feeId: fee.branch_course_fee_id,
    price: fee.course_fee,
    startDate: opts.startDate,
  });

  return { batchId: batch.batch_id };
}

async function enrolOne(requestId: string): Promise<EnrolResult> {
  const reqs = await sql<{
    id: string;
    student_id: string;
    payload: {
      fall_confirmation_status?: string;
      // course_name appears on responses stored before slots carried course_id.
      slots?: (FallSlotChoice & { course_name?: string | null })[];
    };
  }[]>`
    SELECT id, student_id, payload
    FROM parent_requests
    WHERE id = ${requestId}::uuid
      AND request_type = 'fall_confirmation'
      AND is_latest = TRUE
      AND removed_at IS NULL
    LIMIT 1
  `;
  if (reqs.length === 0) return { error: 'Request not found.' };
  const req = reqs[0];

  if (req.payload?.fall_confirmation_status !== 'confirmed') {
    return { error: 'Only confirmed responses can be enrolled.' };
  }
  const slots = Array.isArray(req.payload.slots) ? req.payload.slots : [];
  if (slots.length === 0) return { error: 'This response has no class slot to enrol into.' };

  // Resolve every slot up front — enrolling into some but not all of a multi-class
  // request would leave the family half-booked with no record of which half.
  // Resolve each slot's course to a portal course_code. Responses submitted before slots
  // carried course_id have only a name, so fall back to resolving that.
  const courseRows = await sql<{ id: string; name: string }[]>`
    SELECT id::text, name FROM courses WHERE name IS NOT NULL
  `;
  const { canonical, fromName } = buildCourseResolvers(courseRows);
  const courseCodes = slots.map(slot => canonical(slot.course_id) ?? fromName(slot.course_name));
  const missingIndex = courseCodes.findIndex(code => !code);
  if (missingIndex !== -1) {
    const slot = slots[missingIndex];
    return {
      error:
        `No course on ${slot.weekday} ${slot.start_time}` +
        (slot.course_name ? ` — "${slot.course_name}" is not a known course.` : '. Set the course before enrolling.'),
    };
  }

  const targets: { sessionId: string; startDate: string; courseId: string }[] = [];
  for (const [i, slot] of slots.entries()) {
    if (!slot.start_date || !ISO_DATE.test(slot.start_date)) {
      return { error: `No valid start date for ${slot.weekday} ${slot.start_time}.` };
    }
    const sessionId = await getOrCreateFallSessionId(slot.weekday, slot.start_time);
    targets.push({ sessionId, startDate: slot.start_date, courseId: courseCodes[i] as string });
  }

  // The portal is the system of record — the nightly scrape deletes any non-summer
  // enrolment it does not have, so writing only to our tables would be undone. Do the
  // portal writes FIRST and stop on the first failure, so we never record an enrolment
  // here that does not exist there.
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    const result = await createPortalEnrolment({
      studentId: Number(req.student_id),
      courseCode: courseCodes[i] as string,
      weekday: slot.weekday,
      startTime: slot.start_time,
      endTime: catalogueEndTime(slot.weekday, slot.start_time),
      startDate: targets[i].startDate,
    });
    if (result.error) {
      return {
        error:
          i === 0
            ? result.error
            : `${result.error} (${i} of ${slots.length} classes were already created in the portal.)`,
      };
    }
  }

  const reviewedBy = await staffDisplayName();

  await sql.begin(async tx => {
    const enrolmentIds: string[] = [];
    for (const { sessionId, startDate, courseId } of targets) {
      const inserted = await tx<{ id: string }[]>`
        INSERT INTO enrolments (student_id, course_id, session_id, start_date)
        VALUES (${req.student_id}, ${courseId}, ${sessionId}::uuid, ${startDate}::date)
        ON CONFLICT (student_id, session_id)
        DO UPDATE SET course_id = EXCLUDED.course_id, start_date = EXCLUDED.start_date
        RETURNING id::text
      `;
      if (inserted.length > 0) enrolmentIds.push(inserted[0].id);
    }
    // Status is deliberately left alone. Enrolling records enrolment_ids — which is what
    // the "Already enrolled" filter and the Enrolled badge read — but the row stays in
    // Needs action until staff explicitly dismiss it, matching how approving in the summer
    // responses tab leaves the row in place rather than filing it away.
    await tx`
      UPDATE parent_requests
      SET enrolment_ids = ${enrolmentIds}::uuid[],
          reviewed_at = NOW(),
          reviewed_by = ${reviewedBy},
          updated_at = NOW()
      WHERE id = ${requestId}::uuid
    `;
  });

  return { created: targets.length };
}

export async function enrollFallStudent(requestId: string): Promise<{ error?: string }> {
  await requireAdmin();
  const result = await enrolOne(requestId);
  revalidateFall();
  return result.error ? { error: result.error } : {};
}

/**
 * Ends one enrolment on a chosen date. Per enrolment rather than per student so a family
 * dropping one class of several doesn't lose the rest.
 *
 * Deliberately separate from submission — a parent's UNENROLL answer never mutates
 * enrolments on its own; staff run this. Like enrolling, it leaves parent_requests.status
 * alone, so the row stays in Needs action until dismissed.
 */
export async function endFallEnrolment(
  enrolmentId: string,
  endDate: string,
): Promise<{ error?: string; ended?: boolean }> {
  await requireAdmin();
  if (!ISO_DATE.test(endDate)) return { error: 'Invalid end date.' };

  const updated = await sql<{ id: string }[]>`
    UPDATE enrolments e
    SET end_date = ${endDate}::date
    FROM sessions se
    WHERE se.id = e.session_id
      AND e.id = ${enrolmentId}::uuid
      AND se.is_summer = FALSE
    RETURNING e.id::text
  `;
  if (updated.length === 0) {
    return { error: 'Enrolment not found, or it is a summer session.' };
  }

  revalidateFall();
  return { ended: true };
}

/**
 * Back to 'pending' so the row returns to the Needs action queue. 'reviewed' is still
 * accepted for rows filed before the states collapsed to Needs action / Complete.
 * Reopening does NOT undo any enrolment already created.
 */
/**
 * "Mark complete": staff have enrolled the student AND verified the next invoice. This is
 * a deliberate judgement, never a side effect — enrolling deliberately leaves the row in
 * Needs action so the invoice still gets a look.
 */
export async function markFallResponseComplete(requestId: string): Promise<void> {
  await requireAdmin();
  await sql`
    UPDATE parent_requests
    SET status = 'completed', reviewed_at = NOW(), reviewed_by = ${await staffDisplayName()}, updated_at = NOW()
    WHERE id = ${requestId}::uuid
      AND request_type = 'fall_confirmation'
      AND is_latest = TRUE
      AND removed_at IS NULL
  `;
  revalidateFall();
}

export async function undismissFallResponse(requestId: string): Promise<{ reopened: boolean }> {
  await requireAdmin();
  const rows = await sql<{ id: string }[]>`
    UPDATE parent_requests
    SET status = 'pending', reviewed_at = NULL, reviewed_by = NULL, updated_at = NOW()
    WHERE id = ${requestId}::uuid
      AND request_type = 'fall_confirmation'
      AND is_latest = TRUE
      AND removed_at IS NULL
      AND status IN ('reviewed', 'completed')
    RETURNING id::text
  `;
  revalidateFall();
  return { reopened: rows.length > 0 };
}

export async function deleteFallResponse(requestId: string): Promise<{ deleted: boolean }> {
  await requireAdmin();
  const rows = await sql<{ id: string }[]>`
    UPDATE parent_requests
    SET removed_at = NOW(), is_latest = FALSE, status = 'superseded', updated_at = NOW()
    WHERE id = ${requestId}::uuid
      AND request_type = 'fall_confirmation'
      AND removed_at IS NULL
    RETURNING id::text
  `;
  revalidateFall();
  return { deleted: rows.length > 0 };
}

export async function markFallTokensExported(tokenIds: string[]): Promise<{ updated: number }> {
  await requireAdmin();
  if (tokenIds.length === 0) return { updated: 0 };
  const rows = await sql<{ id: string }[]>`
    UPDATE parent_tokens
    SET fall_exported_at = NOW(), fall_export_count = COALESCE(fall_export_count, 0) + 1
    WHERE id = ANY(${tokenIds}::uuid[])
    RETURNING id::text
  `;
  revalidateTag('summer-tokens', 'max');
  return { updated: rows.length };
}

export async function clearFallExportedForTokens(tokenIds: string[]): Promise<{ updated: number }> {
  await requireAdmin();
  if (tokenIds.length === 0) return { updated: 0 };
  const rows = await sql<{ id: string }[]>`
    UPDATE parent_tokens
    SET fall_exported_at = NULL, fall_export_count = 0
    WHERE id = ANY(${tokenIds}::uuid[])
    RETURNING id::text
  `;
  revalidateTag('summer-tokens', 'max');
  return { updated: rows.length };
}
