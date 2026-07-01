'use server';

import { revalidatePath } from 'next/cache';
import {
  ATTENDANCE_STATUS,
  fetchBatchAttendance,
  findEnrolmentBatchForSlot,
  markStudentAttendance,
  type AttendanceStatus,
} from './scraper_helpers';

// attendance_id -> the portal's status label, for display (reverse of
// ATTENDANCE_STATUS). e.g. 2662 -> "Sick Leave".
const ATTENDANCE_LABEL_BY_ID: Record<number, AttendanceStatus> = Object.fromEntries(
  Object.entries(ATTENDANCE_STATUS).map(([label, id]) => [id, label as AttendanceStatus]),
) as Record<number, AttendanceStatus>;

// Weekly class dates on `weekday` within [fromDate, toDate] inclusive (YYYY-MM-DD).
function weeklyDatesInRange(weekday: string, fromDate: string, toDate: string): string[] {
  const dow: Record<string, number> = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
  };
  const target = dow[weekday.trim().toLowerCase()];
  if (target === undefined) return [];
  const out: string[] = [];
  const cur = new Date(`${fromDate}T00:00:00`);
  const end = new Date(`${toDate}T00:00:00`);
  while (cur.getDay() !== target) cur.setDate(cur.getDate() + 1);
  while (cur <= end) {
    const p = (n: number) => String(n).padStart(2, '0');
    out.push(`${cur.getFullYear()}-${p(cur.getMonth() + 1)}-${p(cur.getDate())}`);
    cur.setDate(cur.getDate() + 7);
  }
  return out;
}

// Per-enrolment attendance management for the students/[id]/edit page.
//
// These wrap the portal attendance helpers (built in scraper_helpers.ts) and are
// kept in their own file so this page's UI does not collide with the schedule's
// setPortalAttendance wiring in actions.ts. Like every portal write, they mutate
// the live portal — only ever called from the manual attendance popup.

export type AttendanceValue = 'present' | 'absent' | 'unmarked';

const STATUS_BY_VALUE: Record<AttendanceValue, AttendanceStatus> = {
  present: 'Present',
  absent: 'Absent',
  unmarked: 'Unmarked',
};

export type EnrolmentAttendanceRecord = {
  date: string; // YYYY-MM-DD
  value: AttendanceValue;
  label: string; // original portal attendance_value, e.g. "Sick Leave"
};

// Reads recorded attendance for one enrolment's slot (a student's class on a
// given weekday/time) over a date range. Sources the branch attendance report —
// the same feed the schedule absence sync uses — and filters to this student and
// slot. Only dates the portal has a record for come back; everything else is
// treated as unmarked by the caller.
export async function getEnrolmentAttendance(opts: {
  studentId: number;
  day: string;
  startTime: string;
  fromDate: string; // YYYY-MM-DD
  toDate: string; // YYYY-MM-DD
}): Promise<
  | { ok: true; records: EnrolmentAttendanceRecord[] }
  | { ok: false; error: string }
> {
  try {
    // Resolve the portal batch for this student's slot, then read each class
    // date's roster GET — the same source the portal's attendance screen and the
    // schedule use. The date-based report is a different store (it surfaces marks
    // PUT never writes), so reading it here showed stale/orphaned statuses.
    const match = await findEnrolmentBatchForSlot(opts.studentId, opts.day, opts.startTime);
    const dates = weeklyDatesInRange(opts.day, opts.fromDate, opts.toDate);

    const rosters = await Promise.all(
      dates.map((date) =>
        fetchBatchAttendance(match.batchId, date).then(
          (roster) => ({ date, roster }),
          () => ({ date, roster: null }),
        ),
      ),
    );

    const records: EnrolmentAttendanceRecord[] = [];
    for (const { date, roster } of rosters) {
      if (!roster) continue;
      const entry = roster.students.find((s) => s.user_id === opts.studentId);
      if (!entry) continue;
      const value: AttendanceValue =
        entry.attendance_id === ATTENDANCE_STATUS.Present
          ? 'present'
          : entry.attendance_id === ATTENDANCE_STATUS.Unmarked
            ? 'unmarked'
            : 'absent';
      records.push({ date, value, label: ATTENDANCE_LABEL_BY_ID[entry.attendance_id] ?? 'Unmarked' });
    }

    return { ok: true, records };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// Writes one attendance value for a student's enrolment slot on a date. Takes
// the slot's day/time straight from the portal enrolment (this page works from
// portal enrolments, which carry the batch's day/time, rather than the DB
// enrolment ids the schedule's setPortalAttendance resolves). first/last name
// are passed through to skip the helper's name lookup.
export async function setEnrolmentAttendance(opts: {
  studentId: number;
  day: string;
  startTime: string;
  endTime?: string;
  date: string; // YYYY-MM-DD
  value: AttendanceValue;
  firstName?: string;
  lastName?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await markStudentAttendance({
      studentId: opts.studentId,
      day: opts.day,
      startTime: opts.startTime,
      endTime: opts.endTime,
      date: opts.date,
      makeup: false,
      status: STATUS_BY_VALUE[opts.value],
      firstName: opts.firstName,
      lastName: opts.lastName,
    });

    revalidatePath('/dashboard/students/[id]/edit', 'page');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
