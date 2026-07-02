'use server';

import postgres from 'postgres';
import { revalidatePath } from 'next/cache';
import { setEnrolmentInactive } from './scraper_helpers';

// Scheduled (or immediate) enrolment inactivations for the students/[id]/edit
// page. Staff pick a completion date for a portal enrolment:
//  - date today or in the past  -> the portal PATCH runs now (setEnrolmentInactive)
//  - date in the future         -> a row is queued in future_inactivations and the
//                                  daily scrape cron runs it once the date arrives.
// The queued date can be edited or the task undone any time before it fires.
// Like every portal write, the live mutation only ever happens from these
// manually triggered actions (and the cron replay below).

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

// Local-time YYYY-MM-DD for "today" so date comparisons match how staff think
// about the calendar (the portal completion date is a plain date, no tz).
function ymdToday(): string {
  const d = new Date();
  const pad2 = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function normalizeYmd(d: string): string {
  return String(d ?? '').slice(0, 10);
}

export type PendingInactivation = {
  studentBatchId: number;
  endDate: string; // YYYY-MM-DD
};

// Pending scheduled inactivations for a student, keyed by enrolment so the page
// can mark each row that already has an end date queued.
export async function listPendingInactivations(
  studentId: number,
): Promise<PendingInactivation[]> {
  const rows = await sql<{ student_batch_id: number; end_date: string }[]>`
    SELECT student_batch_id, to_char(end_date, 'YYYY-MM-DD') AS end_date
    FROM future_inactivations
    WHERE student_id = ${studentId}
  `;
  return rows.map((r) => ({
    studentBatchId: Number(r.student_batch_id),
    endDate: r.end_date,
  }));
}

// Schedules an enrolment to be inactivated on `endDate`, or inactivates it
// immediately when the date is today/past. Upserts so calling it again on an
// enrolment that already has a queued date just moves the date.
export async function scheduleInactivation(opts: {
  studentId: number;
  studentBatchId: number;
  endDate: string; // YYYY-MM-DD
  courseName?: string | null;
  subCourseCode?: string | null;
  // Class slot (portal batch weekday + start time), stored so the schedule can
  // link this queued inactivation to the matching enrolment and treat the end
  // date as effective before the inactivation actually fires.
  classDay?: string | null;
  classStartTime?: string | null;
}): Promise<{ ok: true; applied: 'now' | 'scheduled' } | { ok: false; error: string }> {
  try {
    const endDate = normalizeYmd(opts.endDate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return { ok: false, error: 'Invalid end date.' };
    }

    if (endDate <= ymdToday()) {
      // Due already — inactivate in the portal now and clear any queued row.
      await setEnrolmentInactive({
        studentId: opts.studentId,
        studentBatchId: opts.studentBatchId,
        completionDate: endDate,
      });
      await sql`
        DELETE FROM future_inactivations
        WHERE student_batch_id = ${opts.studentBatchId}
      `;
      revalidatePath('/dashboard/students/[id]/edit', 'page');
      return { ok: true, applied: 'now' };
    }

    await sql`
      INSERT INTO future_inactivations
        (student_id, student_batch_id, end_date, course_name, sub_course_code,
         class_day, class_start_time)
      VALUES (
        ${opts.studentId},
        ${opts.studentBatchId},
        ${endDate},
        ${opts.courseName ?? null},
        ${opts.subCourseCode ?? null},
        ${opts.classDay ?? null},
        ${opts.classStartTime ?? null}
      )
      ON CONFLICT (student_batch_id) DO UPDATE SET
        end_date = EXCLUDED.end_date,
        course_name = EXCLUDED.course_name,
        sub_course_code = EXCLUDED.sub_course_code,
        class_day = EXCLUDED.class_day,
        class_start_time = EXCLUDED.class_start_time,
        updated_at = NOW()
    `;

    revalidatePath('/dashboard/students/[id]/edit', 'page');
    return { ok: true, applied: 'scheduled' };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// Undoes a queued inactivation (keeps the enrolment active). No-op if the row
// is already gone (e.g. the cron just ran it).
export async function cancelInactivation(
  studentBatchId: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await sql`
      DELETE FROM future_inactivations
      WHERE student_batch_id = ${studentBatchId}
    `;
    revalidatePath('/dashboard/students/[id]/edit', 'page');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// Cron entry point: inactivate every enrolment whose queued end_date has
// arrived, deleting each row only after its portal PATCH succeeds (a failed
// one stays queued and is retried on the next run). Called from
// /jobs/scrape-now alongside the daily scrape.
export async function processDueInactivations(): Promise<{
  processed: number;
  failed: number;
  errors: string[];
}> {
  const due = await sql<
    { id: number; student_id: number; student_batch_id: number; end_date: string }[]
  >`
    SELECT id, student_id, student_batch_id, to_char(end_date, 'YYYY-MM-DD') AS end_date
    FROM future_inactivations
    WHERE end_date <= ${ymdToday()}
    ORDER BY end_date ASC
  `;

  let processed = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const row of due) {
    try {
      await setEnrolmentInactive({
        studentId: Number(row.student_id),
        studentBatchId: Number(row.student_batch_id),
        completionDate: row.end_date,
      });
      await sql`DELETE FROM future_inactivations WHERE id = ${row.id}`;
      processed += 1;
    } catch (e) {
      failed += 1;
      errors.push(
        `student_batch_id ${row.student_batch_id}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }

  return { processed, failed, errors };
}
