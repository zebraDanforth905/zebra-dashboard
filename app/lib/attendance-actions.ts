'use server';

import { revalidatePath } from 'next/cache';
import {
  fetchAttendanceReport,
  markStudentAttendance,
  type AttendanceStatus,
} from './scraper_helpers';

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

// "18:00:00" / " 18:00 " -> "18:00" for tolerant slot matching.
function hhmm(t: string): string {
  return (t ?? '').trim().slice(0, 5);
}

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
    const branchId = Number(process.env.ZEBRA_BRANCH_ID ?? 20);
    const raw = await fetchAttendanceReport({
      startDate: opts.fromDate,
      endDate: opts.toDate,
      branchId,
    });

    const wantDay = opts.day.trim().toLowerCase();
    const wantStart = hhmm(opts.startTime);
    const byDate = new Map<string, EnrolmentAttendanceRecord>();

    for (const r of raw as any[]) {
      if (Number(r?.student?.user_id) !== opts.studentId) continue;
      if (String(r?.batch?.day ?? '').trim().toLowerCase() !== wantDay) continue;
      if (hhmm(String(r?.batch?.start_time ?? '')) !== wantStart) continue;

      const date = String(r?.date ?? '').slice(0, 10);
      if (!date) continue;

      const label = String(r?.attendance_value ?? '').trim();
      const value: AttendanceValue =
        label === 'Present'
          ? 'present'
          : label === '' || label === 'Unmarked'
            ? 'unmarked'
            : 'absent';
      byDate.set(date, { date, value, label: label || 'Unmarked' });
    }

    return { ok: true, records: [...byDate.values()] };
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
