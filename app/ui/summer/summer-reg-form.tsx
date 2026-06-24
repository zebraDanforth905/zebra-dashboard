'use client';

import { useActionState, useState } from 'react';
import { submitSummerForm } from '@/app/lib/summer-actions';
import StudentCard, { StudentCardState } from '@/app/ui/summer/student-card';
import { ParentFormData } from '@/app/lib/definitions';
import { getStartDateOptions, WeekdayName } from '@/app/lib/tdsb-calendar';

type StudentFormEntry = {
  student_id: string;
  summer_status: 'enrolling' | 'pausing' | 'other';
  session_ids: string[];
  session_start_dates: Record<string, string>;
  waitlist_session_ids: string[];
  custom_notes?: string;
  pickup_requested?: boolean;
  pickup_school?: 'Jackman' | 'Frankland' | 'other';
  pickup_school_other?: string;
  fall_status: 'same' | 'change' | 'pause' | 'unsure' | 'not_returning';
  fall_start_date?: string;
  fall_session_ids: string[];
  fall_session_start_dates: Record<string, string>;
  fall_waitlist_session_ids: string[];
  fall_notes?: string;
  current_sessions_snapshot: ParentFormData['students'][number]['current_sessions'];
};

const PICKUP_WEEKDAYS = new Set(['monday', 'tuesday', 'wednesday', 'thursday']);
const WEEKDAY_NAMES = new Set<WeekdayName>(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);

function isPickupSession(weekday: string | null, startTime: string | null): boolean {
  if (!weekday || !startTime || !PICKUP_WEEKDAYS.has(weekday.trim().toLowerCase())) return false;
  const [hour, minute] = startTime.split(':').map(Number);
  return hour === 16 && minute === 0;
}

function formatTitleCase(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function normalizePickupSchool(school: string | null): Pick<StudentCardState, 'pickup_school' | 'pickup_school_other'> {
  if (!school) return { pickup_school: null, pickup_school_other: '' };
  const normalized = school.trim().toLowerCase();
  if (normalized === 'jackman') return { pickup_school: 'Jackman', pickup_school_other: '' };
  if (normalized === 'frankland') return { pickup_school: 'Frankland', pickup_school_other: '' };
  return { pickup_school: 'other', pickup_school_other: formatTitleCase(school) };
}

function getCurrentSessions(student: ParentFormData['students'][number]) {
  if (student.current_sessions.length > 0) return student.current_sessions;
  if (!student.current_weekday || !student.current_start_time) return [];
  return [{
    weekday: student.current_weekday,
    start_time: student.current_start_time,
    pickup_school: student.current_pickup_school,
  }];
}

function hasCurrentSessions(student: ParentFormData['students'][number]): boolean {
  return getCurrentSessions(student).length > 0;
}

function currentPickupDefaults(student: ParentFormData['students'][number]): Pick<StudentCardState, 'pickup_requested' | 'pickup_school' | 'pickup_school_other'> {
  const pickupSession = getCurrentSessions(student).find(session => isPickupSession(session.weekday, session.start_time));
  if (!pickupSession) {
    return { pickup_requested: false, pickup_school: null, pickup_school_other: '' };
  }
  const pickup = normalizePickupSchool(pickupSession.pickup_school);
  return {
    pickup_requested: pickup.pickup_school !== null,
    pickup_school: pickup.pickup_school,
    pickup_school_other: pickup.pickup_school_other,
  };
}

function fallStartDateOptions(student: ParentFormData['students'][number]): string[] {
  const session = getCurrentSessions(student).find(s => WEEKDAY_NAMES.has(s.weekday as WeekdayName));
  return session ? getStartDateOptions(session.weekday as WeekdayName, 'fall') : [];
}

function defaultFallStartDate(student: ParentFormData['students'][number]): string {
  return fallStartDateOptions(student)[0] ?? '';
}

function isPickupVisible(
  student: ParentFormData['students'][number],
  sel: StudentCardState,
  fallSessions: ParentFormData['fall_sessions'],
): boolean {
  if (sel.fall_status === 'same') {
    return getCurrentSessions(student).some(session => isPickupSession(session.weekday, session.start_time));
  }
  if (sel.fall_status !== 'change') return false;
  return fallSessions.some(
    session => sel.fall_session_ids.includes(session.id) && isPickupSession(session.weekday, session.start_time),
  );
}

function isStudentComplete(
  student: ParentFormData['students'][number],
  sel: StudentCardState,
  fallSessions: ParentFormData['fall_sessions'],
  staffEntry: boolean,
): boolean {
  const pickupVisible = isPickupVisible(student, sel, fallSessions);
  const manualCurrentFields = [
    sel.manual_current_course_name,
    sel.manual_current_weekday,
    sel.manual_current_start_time,
    sel.manual_current_pickup_school,
  ].some(value => value.trim());
  const manualCurrentComplete = Boolean(
    sel.manual_current_course_name.trim() &&
    sel.manual_current_weekday &&
    sel.manual_current_start_time,
  );

  if (staffEntry && manualCurrentFields && !manualCurrentComplete) return false;
  if (!sel.summer_status) return false;
  if (sel.summer_status === 'enrolling' && sel.session_ids.length === 0) return false;
  if (sel.summer_status === 'other' && !sel.custom_notes.trim()) return false;
  if (pickupVisible && sel.pickup_requested) {
    if (!sel.pickup_school) return false;
    if (sel.pickup_school === 'other' && !sel.pickup_school_other.trim()) return false;
  }
  if (!sel.fall_status) return false;
  if (sel.fall_status === 'change' && sel.fall_session_ids.length === 0) return false;
  if (staffEntry && sel.fall_status === 'same' && !hasCurrentSessions(student) && !manualCurrentComplete) return false;
  return true;
}

function currentSessionsSnapshot(
  student: ParentFormData['students'][number],
  sel: StudentCardState,
  staffEntry: boolean,
): ParentFormData['students'][number]['current_sessions'] {
  if (
    staffEntry &&
    sel.manual_current_course_name.trim() &&
    sel.manual_current_weekday &&
    sel.manual_current_start_time
  ) {
    return [{
      weekday: sel.manual_current_weekday,
      start_time: sel.manual_current_start_time,
      pickup_school: sel.manual_current_pickup_school.trim() || null,
      course_name: sel.manual_current_course_name.trim(),
    }];
  }
  return getCurrentSessions(student);
}

function buildStudentEntry(
  student: ParentFormData['students'][number],
  sel: StudentCardState,
  fallSessions: ParentFormData['fall_sessions'],
  staffEntry: boolean,
): StudentFormEntry {
  const pickupVisible = isPickupVisible(student, sel, fallSessions);
  const pickupRequested = pickupVisible && sel.pickup_requested;
  const enrolling = sel.summer_status === 'enrolling';
  const keepingSameFall = sel.fall_status === 'same';
  const changingFall = sel.fall_status === 'change';
  return {
    student_id: student.student_id,
    summer_status: (sel.summer_status ?? 'other') as StudentFormEntry['summer_status'],
    session_ids: enrolling ? sel.session_ids : [],
    session_start_dates: enrolling ? sel.session_start_dates : {},
    waitlist_session_ids: enrolling ? sel.waitlist_session_ids : [],
    custom_notes: sel.summer_status === 'other' ? sel.custom_notes || undefined : undefined,
    pickup_requested: pickupVisible ? sel.pickup_requested : undefined,
    pickup_school: pickupRequested ? (sel.pickup_school ?? undefined) : undefined,
    pickup_school_other: pickupRequested && sel.pickup_school === 'other' ? sel.pickup_school_other || undefined : undefined,
    fall_status: sel.fall_status as StudentFormEntry['fall_status'],
    fall_start_date: keepingSameFall ? (sel.fall_start_date || defaultFallStartDate(student) || undefined) : undefined,
    fall_session_ids: changingFall ? sel.fall_session_ids : [],
    fall_session_start_dates: changingFall ? sel.fall_session_start_dates : {},
    fall_waitlist_session_ids: changingFall ? sel.fall_waitlist_session_ids : [],
    fall_notes: sel.fall_status && !['same', 'change'].includes(sel.fall_status) ? sel.fall_notes || undefined : undefined,
    current_sessions_snapshot: currentSessionsSnapshot(student, sel, staffEntry),
  };
}

function normalizeComparable(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .map(normalizeComparable)
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined && entryValue !== '')
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entryValue]) => [key, normalizeComparable(entryValue)]),
    );
  }
  return value;
}

function entriesAreEqual(a: StudentFormEntry, b: StudentFormEntry): boolean {
  return JSON.stringify(normalizeComparable(a)) === JSON.stringify(normalizeComparable(b));
}

function initState(student: ParentFormData['students'][number], staffEntry: boolean): StudentCardState {
  const req = student.latest_request;
  const fallStatus = req?.fall_status ?? (staffEntry && !hasCurrentSessions(student) ? null : 'same');
  const summerStatus =
    student.latest_request_type === 'other'
      ? 'other'
      : req?.summer_status === 'no_change'
        ? null
        : (req?.summer_status ?? null);
  const defaultPickup =
    fallStatus === 'same'
      ? currentPickupDefaults(student)
      : { pickup_requested: false, pickup_school: null, pickup_school_other: '' };

  if (req) {
    return {
      summer_status: summerStatus,
      session_ids: req.session_ids ?? [],
      session_start_dates: req.session_start_dates ?? {},
      waitlist_session_ids: req.waitlist_session_ids ?? [],
      custom_notes: student.latest_request_type === 'other' ? (student.latest_custom_notes ?? '') : '',
      pickup_requested: req.pickup_requested ?? defaultPickup.pickup_requested,
      pickup_school: req.pickup_school ?? defaultPickup.pickup_school,
      pickup_school_other: req.pickup_school_other ?? defaultPickup.pickup_school_other,
      fall_status: fallStatus,
      fall_start_date: fallStatus === 'same' ? (req.fall_start_date ?? defaultFallStartDate(student)) : '',
      fall_session_ids: req.fall_session_ids ?? [],
      fall_session_start_dates: req.fall_session_start_dates ?? {},
      fall_waitlist_session_ids: req.fall_waitlist_session_ids ?? [],
      fall_notes: req.fall_notes ?? '',
      manual_current_course_name: '',
      manual_current_weekday: '',
      manual_current_start_time: '',
      manual_current_pickup_school: '',
    };
  }
  return {
    summer_status: null,
    session_ids: [],
    session_start_dates: {},
    waitlist_session_ids: [],
    custom_notes: '',
    ...defaultPickup,
    fall_status: fallStatus,
    fall_start_date: fallStatus === 'same' ? defaultFallStartDate(student) : '',
    fall_session_ids: [],
    fall_session_start_dates: {},
    fall_waitlist_session_ids: [],
    fall_notes: '',
    manual_current_course_name: '',
    manual_current_weekday: '',
    manual_current_start_time: '',
    manual_current_pickup_school: '',
  };
}

export default function SummerRegForm({
  data,
  token,
  staffEntry = false,
  staffName = null,
}: {
  data: ParentFormData;
  token: string;
  staffEntry?: boolean;
  staffName?: string | null;
}) {
  const [actionState, formAction, isPending] = useActionState(submitSummerForm, undefined);

  const [selections, setSelections] = useState<Record<string, StudentCardState>>(
    () => Object.fromEntries(data.students.map(s => [s.student_id, initState(s, staffEntry)])),
  );

  const allEntries: StudentFormEntry[] = data.students.map(s =>
    buildStudentEntry(s, selections[s.student_id], data.fall_sessions, staffEntry),
  );
  const initialEntriesByStudentId = new Map(data.students.map(s => [
    s.student_id,
    buildStudentEntry(s, initState(s, staffEntry), data.fall_sessions, staffEntry),
  ]));
  const changedStudentIds = new Set(
    staffEntry
      ? allEntries
          .filter(entry => {
            const initialEntry = initialEntriesByStudentId.get(entry.student_id);
            return !initialEntry || !entriesAreEqual(entry, initialEntry);
          })
          .map(entry => entry.student_id)
      : allEntries.map(entry => entry.student_id),
  );
  const entries = staffEntry
    ? allEntries.filter(entry => changedStudentIds.has(entry.student_id))
    : allEntries;
  const incompleteCount = data.students.filter(s => {
    if (staffEntry && !changedStudentIds.has(s.student_id)) return false;
    return !isStudentComplete(s, selections[s.student_id], data.fall_sessions, staffEntry);
  }).length;
  const hasChangesToSubmit = !staffEntry || entries.length > 0;
  const isValid = incompleteCount === 0 && hasChangesToSubmit;

  return (
    <form action={formAction} className="space-y-6 pb-28 sm:pb-0">
      <input type="hidden" name="token" value={token} />
      {staffEntry && <input type="hidden" name="staff_entry" value="1" />}
      {staffEntry && !staffName && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <label className="block text-xs font-medium uppercase tracking-wide text-amber-800">
            Staff name
          </label>
          <input
            name="staff_name"
            type="text"
            required
            placeholder="Name to show on internal response"
            className="mt-1 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-200"
          />
        </div>
      )}
      <input type="hidden" name="students" value={JSON.stringify(entries)} />

      {actionState?.error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {actionState.error}
        </div>
      )}

      {data.students.map(student => (
        <StudentCard
          key={student.student_id}
          student={student}
          summerSessions={data.summer_sessions}
          fallSessions={data.fall_sessions}
          courseOptions={data.course_options ?? []}
          staffEntry={staffEntry}
          state={selections[student.student_id]}
          onChange={s => setSelections(prev => ({ ...prev, [student.student_id]: s }))}
        />
      ))}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:shadow-none sm:backdrop-blur-none">
        <div className="mx-auto max-w-3xl space-y-2">
          {!isValid && (
            <p className="text-center text-xs font-medium text-amber-700">
              {staffEntry && entries.length === 0
                ? 'Make at least one student change before submitting.'
                : `${incompleteCount} ${incompleteCount === 1 ? 'student needs' : 'students need'} required items before submitting.`}
            </p>
          )}
          <button
            type="submit"
            disabled={isPending || !isValid}
            className="w-full rounded-lg bg-sky-600 px-4 py-3 text-white font-medium shadow-lg shadow-sky-900/20 transition hover:bg-sky-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? 'Submitting…' : 'Submit Summer & Fall Plans'}
          </button>
        </div>
      </div>
    </form>
  );
}
