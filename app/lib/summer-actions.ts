'use server';

import postgres from 'postgres';
import { revalidateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { randomBytes } from 'crypto';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

// ── Token management ──────────────────────────────────────────────────────────

// Idempotent: if a token already exists for this customer, returns the existing one.
export async function generateParentToken(customerId: string): Promise<string> {
  const existing = await sql<{ token: string }[]>`
    SELECT token FROM parent_tokens WHERE customer_id = ${customerId}::uuid LIMIT 1
  `;
  if (existing.length > 0) return existing[0].token;

  const token = randomBytes(24).toString('hex');
  await sql`
    INSERT INTO parent_tokens (customer_id, token)
    VALUES (${customerId}::uuid, ${token})
    ON CONFLICT (customer_id) DO NOTHING
  `;

  // Re-read in the race-condition case where another request won the INSERT
  const row = await sql<{ token: string }[]>`
    SELECT token FROM parent_tokens WHERE customer_id = ${customerId}::uuid LIMIT 1
  `;
  revalidateTag('summer-tokens', 'max');
  return row[0].token;
}

// Bulk-generates tokens for every customer with at least one enrolment. Skips existing tokens.
export async function generateAllParentTokens(): Promise<{ created: number }> {
  const eligible = await sql<{ customer_id: string }[]>`
    SELECT DISTINCT c.id::text AS customer_id
    FROM customers c
    JOIN students s ON s.customer_id = c.id
    JOIN enrolments e ON e.student_id = s.id
    WHERE NOT EXISTS (
      SELECT 1 FROM parent_tokens pt WHERE pt.customer_id = c.id
    )
  `;
  if (eligible.length === 0) {
    revalidateTag('summer-tokens', 'max');
    return { created: 0 };
  }
  for (const { customer_id } of eligible) {
    const token = randomBytes(24).toString('hex');
    await sql`
      INSERT INTO parent_tokens (customer_id, token)
      VALUES (${customer_id}::uuid, ${token})
      ON CONFLICT (customer_id) DO NOTHING
    `;
  }
  revalidateTag('summer-tokens', 'max');
  return { created: eligible.length };
}

// ── Email send tracking ───────────────────────────────────────────────────────

export async function markAllEmailSent(): Promise<{ updated: number }> {
  const rows = await sql<{ id: string }[]>`
    UPDATE parent_tokens
    SET email_sent_at = NOW(), email_sent_count = email_sent_count + 1
    RETURNING id
  `;
  revalidateTag('summer-tokens', 'max');
  return { updated: rows.length };
}

export async function markNonRespondersEmailSent(): Promise<{ updated: number }> {
  const rows = await sql<{ id: string }[]>`
    UPDATE parent_tokens pt
    SET email_sent_at = NOW(), email_sent_count = email_sent_count + 1
    WHERE NOT EXISTS (
      SELECT 1 FROM parent_requests pr
      WHERE pr.token_id = pt.id AND pr.is_latest = TRUE
    )
    RETURNING id
  `;
  revalidateTag('summer-tokens', 'max');
  return { updated: rows.length };
}

// ── Customer alternate email ──────────────────────────────────────────────────

export async function updateAlternateEmail(customerId: string, email: string | null): Promise<void> {
  const trimmed = email?.trim() || null;
  await sql`
    UPDATE customers SET alternate_email = ${trimmed} WHERE id = ${customerId}::uuid
  `;
  revalidateTag('summer-tokens', 'max');
}

export async function updateAlternateName(customerId: string, name: string | null): Promise<void> {
  const trimmed = name?.trim() || null;
  await sql`
    UPDATE customers SET alternate_name = ${trimmed} WHERE id = ${customerId}::uuid
  `;
  revalidateTag('summer-tokens', 'max');
}

// ── Request approval ─────────────────────────────────────────────────────────

export async function approveSummerRequest(
  requestId: string,
  startDate?: string,
): Promise<{ error?: string }> {
  const reqs = await sql<{
    id: string;
    student_id: string;
    payload: { summer_status: string; session_ids?: string[] };
  }[]>`
    SELECT id, student_id, payload
    FROM parent_requests
    WHERE id = ${requestId}::uuid AND is_latest = TRUE
    LIMIT 1
  `;
  if (reqs.length === 0) return { error: 'Request not found.' };
  const req = reqs[0];
  const summerStatus = req.payload?.summer_status;

  if (summerStatus === 'enrolling') {
    const sessionIds = req.payload?.session_ids ?? [];
    if (sessionIds.length === 0) return { error: 'No sessions on this request to enrol into.' };
    if (!startDate) return { error: 'Start date is required for enrolling requests.' };

    // Auto-inherit course_id from student's most recent enrolment
    const courseRows = await sql<{ course_id: string }[]>`
      SELECT course_id::text
      FROM enrolments
      WHERE student_id = ${req.student_id}
      ORDER BY start_date DESC NULLS LAST
      LIMIT 1
    `;
    if (courseRows.length === 0) {
      return { error: 'No existing enrolment found to inherit course from. Approve manually.' };
    }
    const courseId = courseRows[0].course_id;

    const newEnrolmentIds: string[] = [];
    await sql.begin(async tx => {
      for (const sessionId of sessionIds) {
        const inserted = await tx<{ id: string }[]>`
          INSERT INTO enrolments (student_id, course_id, session_id, start_date)
          VALUES (
            ${req.student_id},
            ${courseId}::uuid,
            ${sessionId}::uuid,
            ${startDate}::date
          )
          ON CONFLICT (student_id, session_id)
          DO UPDATE SET course_id = EXCLUDED.course_id, start_date = EXCLUDED.start_date
          RETURNING id::text
        `;
        if (inserted.length > 0) newEnrolmentIds.push(inserted[0].id);
      }
      await tx`
        UPDATE parent_requests
        SET
          status = 'completed',
          enrolment_ids = ${newEnrolmentIds}::uuid[],
          reviewed_at = NOW(),
          reviewed_by = 'staff',
          updated_at = NOW()
        WHERE id = ${requestId}::uuid
      `;
    });
  } else {
    // pausing / no_change / other — just mark completed, no enrolment action
    await sql`
      UPDATE parent_requests
      SET status = 'completed', reviewed_at = NOW(), reviewed_by = 'staff', updated_at = NOW()
      WHERE id = ${requestId}::uuid AND is_latest = TRUE
    `;
  }

  revalidateTag('summer-responses', 'max');
  return {};
}

export async function approveAllEnrolling(startDate: string): Promise<{ created: number; skipped: number }> {
  const pending = await sql<{
    id: string;
    student_id: string;
    payload: { session_ids?: string[] };
  }[]>`
    SELECT id, student_id, payload
    FROM parent_requests
    WHERE is_latest = TRUE
      AND status = 'pending'
      AND request_type = 'summer_scheduling'
      AND payload->>'summer_status' = 'enrolling'
  `;

  let created = 0;
  let skipped = 0;

  for (const req of pending) {
    const sessionIds = req.payload?.session_ids ?? [];
    if (sessionIds.length === 0) { skipped++; continue; }

    const courseRows = await sql<{ course_id: string }[]>`
      SELECT course_id::text FROM enrolments WHERE student_id = ${req.student_id}
      ORDER BY start_date DESC NULLS LAST LIMIT 1
    `;
    if (courseRows.length === 0) { skipped++; continue; }
    const courseId = courseRows[0].course_id;

    const newEnrolmentIds: string[] = [];
    await sql.begin(async tx => {
      for (const sessionId of sessionIds) {
        const inserted = await tx<{ id: string }[]>`
          INSERT INTO enrolments (student_id, course_id, session_id, start_date)
          VALUES (${req.student_id}, ${courseId}::uuid, ${sessionId}::uuid, ${startDate}::date)
          ON CONFLICT (student_id, session_id)
          DO UPDATE SET course_id = EXCLUDED.course_id, start_date = EXCLUDED.start_date
          RETURNING id::text
        `;
        if (inserted.length > 0) newEnrolmentIds.push(inserted[0].id);
      }
      await tx`
        UPDATE parent_requests
        SET
          status = 'completed',
          enrolment_ids = ${newEnrolmentIds}::uuid[],
          reviewed_at = NOW(),
          reviewed_by = 'staff',
          updated_at = NOW()
        WHERE id = ${req.id}::uuid
      `;
    });
    created++;
  }

  revalidateTag('summer-responses', 'max');
  return { created, skipped };
}

export async function removeFromSummer(requestId: string): Promise<void> {
  const reqs = await sql<{ enrolment_ids: string[] }[]>`
    SELECT enrolment_ids FROM parent_requests WHERE id = ${requestId}::uuid LIMIT 1
  `;
  if (reqs.length > 0 && reqs[0].enrolment_ids.length > 0) {
    await sql`DELETE FROM enrolments WHERE id = ANY(${reqs[0].enrolment_ids}::uuid[])`;
  }
  await sql`
    UPDATE parent_requests
    SET enrolment_ids = '{}', status = 'pending', reviewed_at = NULL, reviewed_by = NULL, updated_at = NOW()
    WHERE id = ${requestId}::uuid
  `;
  revalidateTag('summer-responses', 'max');
}

export async function markAllNoChangeComplete(): Promise<{ updated: number }> {
  const rows = await sql<{ id: string }[]>`
    UPDATE parent_requests
    SET status = 'completed', reviewed_at = NOW(), reviewed_by = 'staff', updated_at = NOW()
    WHERE is_latest = TRUE
      AND status = 'pending'
      AND request_type = 'summer_scheduling'
      AND payload->>'summer_status' = 'no_change'
    RETURNING id
  `;
  revalidateTag('summer-responses', 'max');
  return { updated: rows.length };
}

export async function markReviewed(requestId: string): Promise<void> {
  await sql`
    UPDATE parent_requests
    SET status = 'reviewed', reviewed_at = NOW(), reviewed_by = 'staff', updated_at = NOW()
    WHERE id = ${requestId}::uuid AND is_latest = TRUE
  `;
  revalidateTag('summer-responses', 'max');
}

export async function markNeedsFollowup(requestId: string): Promise<void> {
  await sql`
    UPDATE parent_requests
    SET status = 'needs_manual_followup', reviewed_at = NOW(), reviewed_by = 'staff', updated_at = NOW()
    WHERE id = ${requestId}::uuid AND is_latest = TRUE
  `;
  revalidateTag('summer-responses', 'max');
}

// ── Parent form submission ────────────────────────────────────────────────────

type StudentFormEntry = {
  student_id: string;
  summer_status: 'enrolling' | 'pausing' | 'no_change' | 'other';
  session_ids: string[];
  custom_notes?: string;
  fall_status: 'same' | 'change' | 'pause';
  fall_session_ids: string[];
  fall_notes?: string;
};

export async function submitSummerForm(
  prevState: { error: string } | undefined,
  formData: FormData,
): Promise<{ error: string } | undefined> {
  const token = formData.get('token');
  if (!token || typeof token !== 'string') return { error: 'Invalid token.' };

  // Resolve token → token_id
  const tokenRows = await sql<{ id: string }[]>`
    SELECT id FROM parent_tokens WHERE token = ${token} LIMIT 1
  `;
  if (tokenRows.length === 0) return { error: 'Link not found or has expired.' };
  const token_id = tokenRows[0].id;

  // Parse per-student entries from FormData
  const studentsJson = formData.get('students');
  if (!studentsJson || typeof studentsJson !== 'string') return { error: 'Missing submission data.' };

  let entries: StudentFormEntry[];
  try {
    entries = JSON.parse(studentsJson) as StudentFormEntry[];
  } catch {
    return { error: 'Malformed submission data.' };
  }

  if (entries.length === 0) return { error: 'No student data submitted.' };

  // Validate summer session_ids are still is_summer=TRUE
  const allSummerSessionIds = entries.flatMap(e => e.session_ids);
  if (allSummerSessionIds.length > 0) {
    const validSummer = await sql<{ id: string }[]>`
      SELECT id::text FROM sessions WHERE is_summer = TRUE AND id = ANY(${allSummerSessionIds}::uuid[])
    `;
    const validSet = new Set(validSummer.map(r => r.id));
    if (allSummerSessionIds.some(id => !validSet.has(id))) {
      return { error: 'One or more selected summer sessions are no longer available. Please reload and try again.' };
    }
  }

  // Validate fall_session_ids are real sessions (only when fall_status === 'change')
  const fallSessionIds = entries
    .filter(e => e.fall_status === 'change')
    .flatMap(e => e.fall_session_ids);
  if (fallSessionIds.length > 0) {
    const validFall = await sql<{ id: string }[]>`
      SELECT id::text FROM sessions WHERE id = ANY(${fallSessionIds}::uuid[])
    `;
    const validSet = new Set(validFall.map(r => r.id));
    if (fallSessionIds.some(id => !validSet.has(id))) {
      return { error: 'One or more selected fall sessions are invalid. Please reload and try again.' };
    }
  }

  // Upsert each student's request inside a transaction
  await sql.begin(async tx => {
    for (const entry of entries) {
      // Supersede any existing latest request for this student (any type)
      await tx`
        UPDATE parent_requests
        SET is_latest = FALSE, status = 'superseded', updated_at = NOW()
        WHERE token_id = ${token_id}::uuid
          AND student_id = ${Number(entry.student_id)}
          AND is_latest = TRUE
      `;

      const isOther = entry.summer_status === 'other';
      const request_type = isOther ? 'other' : 'summer_scheduling';
      const status = isOther ? 'needs_manual_followup' : 'pending';
      const fallFields = {
        fall_status: entry.fall_status,
        fall_session_ids: entry.fall_session_ids,
        ...(entry.fall_notes ? { fall_notes: entry.fall_notes } : {}),
      };
      const payload = isOther
        ? fallFields
        : { summer_status: entry.summer_status, session_ids: entry.session_ids, ...fallFields };

      await tx`
        INSERT INTO parent_requests
          (token_id, student_id, request_type, status, is_latest, payload, custom_notes)
        VALUES (
          ${token_id}::uuid,
          ${Number(entry.student_id)},
          ${request_type},
          ${status},
          TRUE,
          ${JSON.stringify(payload)},
          ${entry.custom_notes ?? null}
        )
      `;
    }
  });

  revalidateTag('summer-responses', 'max');
  redirect('/summer-reg/submitted');
}
