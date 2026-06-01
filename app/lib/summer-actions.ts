'use server';

import postgres from 'postgres';
import { revalidateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { randomBytes } from 'crypto';
import { auth } from '@/auth';
import { normalizeSessionSelection } from '@/app/lib/session-selection';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

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

// ── Token management ──────────────────────────────────────────────────────────

// Idempotent: if a token already exists for this customer, returns the existing one.
export async function generateParentToken(customerId: string): Promise<string> {
  await requireAdmin();
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
  await requireAdmin();
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

export async function deleteAllParentTokens(): Promise<{ deleted: number }> {
  await requireAdmin();
  const rows = await sql<{ id: string }[]>`DELETE FROM parent_tokens RETURNING id`;
  revalidateTag('summer-tokens', 'max');
  return { deleted: rows.length };
}

export async function refreshParentLinkData(): Promise<void> {
  await requireAdmin();
  revalidateTag('summer-tokens', 'max');
}

// ── Email send tracking ───────────────────────────────────────────────────────

export async function markTokensExported(tokenIds: string[]): Promise<{ updated: number }> {
  await requireAdmin();
  if (tokenIds.length === 0) return { updated: 0 };
  const rows = await sql<{ id: string }[]>`
    UPDATE parent_tokens
    SET last_exported_at = NOW(), export_count = export_count + 1
    WHERE id::text = ANY(${tokenIds}::text[])
    RETURNING id
  `;
  revalidateTag('summer-tokens', 'max');
  return { updated: rows.length };
}

export async function clearExportedForTokens(tokenIds: string[]): Promise<{ updated: number }> {
  await requireAdmin();
  if (tokenIds.length === 0) return { updated: 0 };
  const rows = await sql<{ id: string }[]>`
    UPDATE parent_tokens
    SET last_exported_at = NULL, export_count = 0
    WHERE id::text = ANY(${tokenIds}::text[])
    RETURNING id
  `;
  revalidateTag('summer-tokens', 'max');
  return { updated: rows.length };
}

// ── Customer alternate email ──────────────────────────────────────────────────

export async function updateAlternateEmail(customerId: string, email: string | null): Promise<void> {
  await requireAdmin();
  const trimmed = email?.trim() || null;
  if (trimmed) {
    if (/[,;]/.test(trimmed)) {
      throw new Error("Alternate email must be a single email address (no commas or semicolons).");
    }
    if ((trimmed.match(/@/g) ?? []).length !== 1) {
      throw new Error("Alternate email must contain exactly one '@'.");
    }
  }
  await sql`
    UPDATE customers
    SET alternate_email = ${trimmed}, alternate_email_locked = TRUE
    WHERE id = ${customerId}::uuid
  `;
  revalidateTag('summer-tokens', 'max');
}

export async function updatePrimaryEmail(customerId: string, email: string | null): Promise<void> {
  await requireAdmin();
  const trimmed = email?.trim() || null;
  if (!trimmed) {
    throw new Error("Primary email cannot be empty.");
  }
  if (/[,;]/.test(trimmed)) {
    throw new Error("Primary email must be a single email address (no commas or semicolons).");
  }
  if ((trimmed.match(/@/g) ?? []).length !== 1) {
    throw new Error("Primary email must contain exactly one '@'.");
  }
  await sql`
    UPDATE customers
    SET email = ${trimmed}, email_locked = TRUE
    WHERE id = ${customerId}::uuid
  `;
  revalidateTag('summer-tokens', 'max');
}

export async function updatePrimaryName(customerId: string, name: string | null): Promise<void> {
  await requireAdmin();
  const trimmed = name?.trim() || null;
  if (!trimmed) {
    throw new Error("Primary name cannot be empty.");
  }
  await sql`
    UPDATE customers
    SET name = ${trimmed}, name_locked = TRUE
    WHERE id = ${customerId}::uuid
  `;
  revalidateTag('summer-tokens', 'max');
}

export async function unlockCustomerField(
  customerId: string,
  field: 'name' | 'email' | 'alternate_email' | 'alternate_name',
): Promise<void> {
  await requireAdmin();
  const column =
    field === 'name' ? 'name_locked'
    : field === 'email' ? 'email_locked'
    : field === 'alternate_email' ? 'alternate_email_locked'
    : 'alternate_name_locked';
  // Field name is from a closed enum — safe to interpolate as identifier.
  await sql.unsafe(`UPDATE customers SET ${column} = FALSE WHERE id = $1::uuid`, [customerId]);
  revalidateTag('summer-tokens', 'max');
}

export async function refreshEmailsFromPortal(): Promise<{ scanned: number; updated: number; fetchFailed: number }> {
  await requireAdmin();
  const { syncEmailsFromFamilyView } = await import('./insert_from_portal');
  const res = await syncEmailsFromFamilyView();
  revalidateTag('summer-tokens', 'max');
  return res;
}

// ── Session full toggle ──────────────────────────────────────────────────────

export async function toggleSessionFull(sessionId: string, isFull: boolean): Promise<void> {
  await requireAdmin();
  await sql`
    UPDATE sessions SET is_full = ${isFull} WHERE id = ${sessionId}::uuid
  `;
  revalidateTag('schedule', 'max');
  revalidateTag('summer-responses', 'max');
}

export async function updateAlternateName(customerId: string, name: string | null): Promise<void> {
  await requireAdmin();
  const trimmed = name?.trim() || null;
  if (trimmed) {
    if (trimmed.includes("&") || /\s\b(and)\b\s/i.test(trimmed) || trimmed.includes(",")) {
      throw new Error(
        "Alternate name must be a single person's name (no '&', ' and ', or commas). Enter only the second parent.",
      );
    }
  }
  await sql`
    UPDATE customers
    SET alternate_name = ${trimmed}, alternate_name_locked = TRUE
    WHERE id = ${customerId}::uuid
  `;
  revalidateTag('summer-tokens', 'max');
}

// ── Request approval ─────────────────────────────────────────────────────────

export async function approveSummerRequest(
  requestId: string,
  startDate?: string,
): Promise<{ error?: string }> {
  await requireAdmin();
  const reqs = await sql<{
    id: string;
    student_id: string;
    payload: { summer_status: string; session_ids?: string[]; session_start_dates?: Record<string, string> };
  }[]>`
    SELECT id, student_id, payload
    FROM parent_requests
    WHERE id = ${requestId}::uuid
      AND is_latest = TRUE
      AND removed_at IS NULL
    LIMIT 1
  `;
  if (reqs.length === 0) return { error: 'Request not found.' };
  const req = reqs[0];
  const summerStatus = req.payload?.summer_status;

  if (summerStatus === 'enrolling') {
    const sessionIds = req.payload?.session_ids ?? [];
    if (sessionIds.length === 0) return { error: 'No sessions on this request to enrol into.' };
    const fallbackStartDate = typeof startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(startDate)
      ? startDate
      : null;
    const startDateBySessionId = new Map<string, string>();
    for (const sessionId of sessionIds) {
      const requestedStartDate = req.payload?.session_start_dates?.[sessionId];
      const enrolmentStartDate = typeof requestedStartDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(requestedStartDate)
        ? requestedStartDate
        : fallbackStartDate;
      if (!enrolmentStartDate) {
        return { error: 'Start date is missing for one or more selected sessions.' };
      }
      startDateBySessionId.set(sessionId, enrolmentStartDate);
    }

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
        const enrolmentStartDate = startDateBySessionId.get(sessionId);
        if (!enrolmentStartDate) continue;
        const inserted = await tx<{ id: string }[]>`
          INSERT INTO enrolments (student_id, course_id, session_id, start_date)
          VALUES (
            ${req.student_id},
            ${courseId},
            ${sessionId}::uuid,
            ${enrolmentStartDate}::date
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
          AND is_latest = TRUE
          AND removed_at IS NULL
      `;
    });
  } else {
    // pausing / no_change / other — just mark completed, no enrolment action
    await sql`
      UPDATE parent_requests
      SET status = 'completed', reviewed_at = NOW(), reviewed_by = 'staff', updated_at = NOW()
      WHERE id = ${requestId}::uuid
        AND is_latest = TRUE
        AND removed_at IS NULL
    `;
  }

  revalidateTag('summer-responses', 'max');
  return {};
}

export async function approveAllEnrolling(startDate: string): Promise<{ created: number; skipped: number; completedIds: string[] }> {
  await requireAdmin();
  const pending = await sql<{
    id: string;
    student_id: string;
    payload: { session_ids?: string[] };
  }[]>`
    SELECT id, student_id, payload
    FROM parent_requests
    WHERE is_latest = TRUE
      AND status = 'pending'
      AND removed_at IS NULL
      AND request_type = 'summer_scheduling'
      AND payload->>'summer_status' = 'enrolling'
  `;

  let created = 0;
  let skipped = 0;
  const completedIds: string[] = [];

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
          VALUES (${req.student_id}, ${courseId}, ${sessionId}::uuid, ${startDate}::date)
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
          AND is_latest = TRUE
          AND removed_at IS NULL
      `;
    });
    created++;
    completedIds.push(req.id);
  }

  revalidateTag('summer-responses', 'max');
  return { created, skipped, completedIds };
}

export async function deleteSummerResponse(requestId: string): Promise<{ deleted: boolean }> {
  await requireAdmin();
  const reqs = await sql<{ id: string; enrolment_ids: string[] }[]>`
    SELECT id::text, enrolment_ids
    FROM parent_requests
    WHERE id = ${requestId}::uuid
    LIMIT 1
  `;
  if (reqs.length === 0) return { deleted: false };
  const { enrolment_ids } = reqs[0];
  await sql.begin(async tx => {
    if (enrolment_ids?.length > 0) {
      await tx`DELETE FROM enrolments WHERE id = ANY(${enrolment_ids}::uuid[])`;
    }
    await tx`
      DELETE FROM parent_requests
      WHERE id = ${requestId}::uuid
    `;
  });
  revalidateTag('summer-responses', 'max');
  revalidateTag('summer-tokens', 'max');
  return { deleted: true };
}

export async function markAllNoChangeComplete(): Promise<{ updated: number; updatedIds: string[] }> {
  await requireAdmin();
  const rows = await sql<{ id: string }[]>`
    UPDATE parent_requests
    SET status = 'completed', reviewed_at = NOW(), reviewed_by = 'staff', updated_at = NOW()
    WHERE is_latest = TRUE
      AND status = 'pending'
      AND removed_at IS NULL
      AND request_type = 'summer_scheduling'
      AND payload->>'summer_status' = 'no_change'
    RETURNING id::text AS id
  `;
  revalidateTag('summer-responses', 'max');
  return { updated: rows.length, updatedIds: rows.map(row => row.id) };
}

export async function markAddedToPortal(requestId: string): Promise<{ added_to_portal_at: Date; added_to_portal_by: string }> {
  await requireAdmin();
  const addedBy = await staffDisplayName();
  const rows = await sql<{ added_to_portal_at: Date; added_to_portal_by: string }[]>`
    UPDATE parent_requests
    SET added_to_portal_at = NOW(), added_to_portal_by = ${addedBy}, updated_at = NOW()
    WHERE id = ${requestId}::uuid
      AND is_latest = TRUE
      AND removed_at IS NULL
    RETURNING added_to_portal_at, added_to_portal_by
  `;
  if (rows.length === 0) {
    throw new Error('Response not found.');
  }
  revalidateTag('summer-responses', 'max');
  return rows[0];
}

export async function clearAddedToPortal(requestId: string): Promise<void> {
  await requireAdmin();
  await sql`
    UPDATE parent_requests
    SET added_to_portal_at = NULL, added_to_portal_by = NULL, updated_at = NOW()
    WHERE id = ${requestId}::uuid
      AND is_latest = TRUE
      AND removed_at IS NULL
  `;
  revalidateTag('summer-responses', 'max');
}

export async function markNeedsFollowup(requestId: string): Promise<void> {
  await requireAdmin();
  await sql`
    UPDATE parent_requests
    SET status = 'needs_manual_followup', reviewed_at = NOW(), reviewed_by = 'staff', updated_at = NOW()
    WHERE id = ${requestId}::uuid
      AND is_latest = TRUE
      AND removed_at IS NULL
  `;
  revalidateTag('summer-responses', 'max');
}

export async function clearFollowup(requestId: string): Promise<void> {
  await requireAdmin();
  await sql`
    UPDATE parent_requests
    SET status = 'pending', reviewed_at = NULL, reviewed_by = NULL, updated_at = NOW()
    WHERE id = ${requestId}::uuid
      AND is_latest = TRUE
      AND removed_at IS NULL
      AND status = 'needs_manual_followup'
  `;
  revalidateTag('summer-responses', 'max');
}

export async function updateSummerResponseSource(
  requestId: string,
  source: 'parent' | 'staff',
): Promise<{ request_ids: string[]; submitted_by: 'parent' | 'staff'; submitted_by_name: string | null }> {
  await requireAdmin();
  const submittedByName = source === 'staff'
    ? await staffDisplayName()
    : null;

  const rows = await sql<{ request_id: string; submitted_by: 'parent' | 'staff'; submitted_by_name: string | null }[]>`
    WITH selected_family AS (
      SELECT s.customer_id
      FROM parent_requests pr
      JOIN students s ON s.id = pr.student_id
      WHERE pr.id = ${requestId}::uuid
        AND pr.is_latest = TRUE
        AND pr.removed_at IS NULL
      LIMIT 1
    )
    UPDATE parent_requests pr
    SET
      submitted_by = ${source},
      submitted_by_name = ${submittedByName},
      updated_at = NOW()
    FROM students s, selected_family
    WHERE pr.student_id = s.id
      AND s.customer_id = selected_family.customer_id
      AND pr.is_latest = TRUE
      AND pr.removed_at IS NULL
      AND pr.request_type IN ('summer_scheduling', 'other')
    RETURNING pr.id::text AS request_id, pr.submitted_by, pr.submitted_by_name
  `;
  if (rows.length === 0) {
    throw new Error('Response not found.');
  }
  revalidateTag('summer-responses', 'max');
  return {
    request_ids: rows.map(row => row.request_id),
    submitted_by: rows[0].submitted_by,
    submitted_by_name: rows[0].submitted_by_name,
  };
}

// ── Parent form submission ────────────────────────────────────────────────────

function pickStartDates(
  raw: Record<string, string> | undefined,
  ids: string[],
): Record<string, string> | null {
  if (!raw || ids.length === 0) return null;
  const out: Record<string, string> = {};
  for (const id of ids) {
    const v = raw[id];
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) out[id] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}


type StudentFormEntry = {
  student_id: string;
  summer_status: 'enrolling' | 'pausing' | 'no_change' | 'other';
  session_ids: string[];
  session_start_dates?: Record<string, string>;
  waitlist_session_ids: string[];
  custom_notes?: string;
  pickup_requested?: boolean;
  pickup_school?: 'Jackman' | 'Frankland' | 'other';
  pickup_school_other?: string;
  fall_status: 'same' | 'change' | 'pause';
  fall_session_ids: string[];
  fall_session_start_dates?: Record<string, string>;
  fall_waitlist_session_ids: string[];
  fall_notes?: string;
};

async function canonicalizeFallSessionEntries(entries: StudentFormEntry[]): Promise<StudentFormEntry[]> {
  const fallSessionIds = Array.from(new Set(
    entries
      .filter(entry => entry.fall_status === 'change')
      .flatMap(entry => [...entry.fall_session_ids, ...entry.fall_waitlist_session_ids]),
  ));

  if (fallSessionIds.length === 0) {
    return entries.map(entry => ({
      ...entry,
      fall_session_ids: [],
      fall_session_start_dates: undefined,
      fall_waitlist_session_ids: [],
    }));
  }

  const rows = await sql<{ id: string; canonical_id: string }[]>`
    WITH selected AS (
      SELECT id::text AS id, weekday, start_time
      FROM sessions
      WHERE id = ANY(${fallSessionIds}::uuid[])
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

  const canonicalById = new Map(rows.map(row => [row.id, row.canonical_id]));

  return entries.map(entry => {
    if (entry.fall_status !== 'change') {
      return {
        ...entry,
        fall_session_ids: [],
        fall_session_start_dates: undefined,
        fall_waitlist_session_ids: [],
      };
    }

    const normalizedFallSessions = normalizeSessionSelection(
      entry.fall_session_ids,
      entry.fall_session_start_dates,
      canonicalById,
    );
    const normalizedFallWaitlist = normalizeSessionSelection(
      entry.fall_waitlist_session_ids,
      undefined,
      canonicalById,
    );

    return {
      ...entry,
      fall_session_ids: normalizedFallSessions.ids,
      fall_session_start_dates: normalizedFallSessions.startDates,
      fall_waitlist_session_ids: normalizedFallWaitlist.ids,
    };
  });
}

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

  entries = entries.map(entry => ({
    ...entry,
    session_ids: Array.isArray(entry.session_ids) ? entry.session_ids : [],
    waitlist_session_ids: Array.isArray(entry.waitlist_session_ids) ? entry.waitlist_session_ids : [],
    fall_session_ids: Array.isArray(entry.fall_session_ids) ? entry.fall_session_ids : [],
    fall_waitlist_session_ids: Array.isArray(entry.fall_waitlist_session_ids) ? entry.fall_waitlist_session_ids : [],
  }));

  // Validate summer session_ids are still is_summer=TRUE
  const allSummerSessionIds = entries.flatMap(e => [...e.session_ids, ...e.waitlist_session_ids]);
  if (allSummerSessionIds.length > 0) {
    const validSummer = await sql<{ id: string }[]>`
      SELECT id::text FROM sessions WHERE is_summer = TRUE AND id = ANY(${allSummerSessionIds}::uuid[])
    `;
    const validSet = new Set(validSummer.map(r => r.id));
    if (allSummerSessionIds.some(id => !validSet.has(id))) {
      return { error: 'One or more selected summer sessions are no longer available. Please reload and try again.' };
    }
  }

  // Validate fall_session_ids are real fall sessions (only when fall_status === 'change')
  const fallSessionIds = entries
    .filter(e => e.fall_status === 'change')
    .flatMap(e => [...e.fall_session_ids, ...e.fall_waitlist_session_ids]);
  if (fallSessionIds.length > 0) {
    const validFall = await sql<{ id: string }[]>`
      SELECT id::text FROM sessions WHERE is_summer = FALSE AND id = ANY(${fallSessionIds}::uuid[])
    `;
    const validSet = new Set(validFall.map(r => r.id));
    if (fallSessionIds.some(id => !validSet.has(id))) {
      return { error: 'One or more selected fall sessions are invalid. Please reload and try again.' };
    }
  }

  const normalizedEntries = await canonicalizeFallSessionEntries(entries);
  const staffEntryRequested = formData.get('staff_entry') === '1';
  const session = staffEntryRequested ? await auth() : null;
  const sessionUser = session?.user as SessionUserWithType | undefined;
  const isStaffEntry = staffEntryRequested && sessionUser?.user_type === 'admin';
  const rawStaffName = formData.get('staff_name');
  const fallbackStaffName = typeof rawStaffName === 'string' ? rawStaffName.trim() : '';
  const submittedBy = isStaffEntry ? 'staff' : 'parent';
  const submittedByName = isStaffEntry
    ? (sessionUser?.name?.trim() || sessionUser?.email?.trim() || fallbackStaffName || 'staff')
    : null;

  // Upsert each student's request inside a transaction
  await sql.begin(async tx => {
    for (const entry of normalizedEntries) {
      // Supersede the current summer/fall planning answer only. Future parent
      // request flows should not be marked stale by this form.
      await tx`
        UPDATE parent_requests
        SET is_latest = FALSE, status = 'superseded', updated_at = NOW()
        WHERE token_id = ${token_id}::uuid
          AND student_id = ${Number(entry.student_id)}
          AND request_type IN ('summer_scheduling', 'other')
          AND is_latest = TRUE
          AND removed_at IS NULL
      `;

      const isOther = entry.summer_status === 'other';
      const request_type = isOther ? 'other' : 'summer_scheduling';
      const status = isOther ? 'needs_manual_followup' : 'pending';
      const pickupFields = entry.pickup_requested
        ? {
            pickup_requested: true,
            pickup_school: entry.pickup_school,
            ...(entry.pickup_school === 'other' ? { pickup_school_other: entry.pickup_school_other } : {}),
          }
        : entry.pickup_requested === false
          ? { pickup_requested: false }
          : {};
      const fallStartDates = pickStartDates(entry.fall_session_start_dates, entry.fall_session_ids);
      const fallFields = {
        fall_status: entry.fall_status,
        fall_session_ids: entry.fall_session_ids,
        ...(entry.fall_waitlist_session_ids.length > 0 ? { fall_waitlist_session_ids: entry.fall_waitlist_session_ids } : {}),
        ...(fallStartDates ? { fall_session_start_dates: fallStartDates } : {}),
        ...pickupFields,
        ...(entry.fall_notes ? { fall_notes: entry.fall_notes } : {}),
      };
      const summerStartDates = pickStartDates(entry.session_start_dates, entry.session_ids);
      const payload = isOther
        ? fallFields
        : {
            summer_status: entry.summer_status,
            session_ids: entry.session_ids,
            ...(entry.waitlist_session_ids.length > 0 ? { waitlist_session_ids: entry.waitlist_session_ids } : {}),
            ...(summerStartDates ? { session_start_dates: summerStartDates } : {}),
            ...fallFields,
          };

      await tx`
        INSERT INTO parent_requests
          (token_id, student_id, request_type, status, is_latest, payload, custom_notes, submitted_by, submitted_by_name)
        VALUES (
          ${token_id}::uuid,
          ${Number(entry.student_id)},
          ${request_type},
          ${status},
          TRUE,
          ${sql.json(payload)},
          ${entry.custom_notes ?? null},
          ${submittedBy},
          ${submittedByName}
        )
      `;
    }
  });

  revalidateTag('summer-responses', 'max');
  redirect(`/summer-reg/submitted?token=${token}`);
}
