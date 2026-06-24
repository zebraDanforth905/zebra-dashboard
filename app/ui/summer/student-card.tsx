'use client';

import { useState } from 'react';
import { ParentFormStudentData, Session } from '@/app/lib/definitions';
import { getStartDateOptions, formatStartDate, WeekdayName } from '@/app/lib/tdsb-calendar';

const WEEKDAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const PICKUP_WEEKDAYS = new Set(['monday', 'tuesday', 'wednesday', 'thursday']);

function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return m === 0 ? `${hour} ${ampm}` : `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
}

function formatCurrentTime(t: string): string {
  return formatTime(t).replace(' ', '').toLowerCase();
}

function formatTitleCase(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function formatCurrentSlot(weekday: string | null, startTime: string | null, pickupSchool: string | null): string | null {
  if (!weekday || !startTime) return null;
  const slot = `${formatTitleCase(weekday)} at ${formatCurrentTime(startTime)}`;
  return pickupSchool ? `${slot} with ${formatTitleCase(pickupSchool)} pickup` : slot;
}

function formatCurrentSlots(sessions: ParentFormStudentData['current_sessions']): string | null {
  if (sessions.length === 0) return null;
  return sessions
    .map(session => {
      const slot = formatCurrentSlot(session.weekday, session.start_time, session.pickup_school);
      if (!slot) return null;
      return session.course_name ? `${slot} - ${session.course_name}` : slot;
    })
    .filter(Boolean)
    .join(', ');
}

function isPickupSession(weekday: string | null, startTime: string | null): boolean {
  if (!weekday || !startTime || !PICKUP_WEEKDAYS.has(weekday.trim().toLowerCase())) return false;
  const [hour, minute] = startTime.split(':').map(Number);
  return hour === 16 && minute === 0;
}

function normalizePickupSchool(school: string | null): Pick<StudentCardState, 'pickup_school' | 'pickup_school_other'> {
  if (!school) return { pickup_school: null, pickup_school_other: '' };
  const normalized = school.trim().toLowerCase();
  if (normalized === 'jackman') return { pickup_school: 'Jackman', pickup_school_other: '' };
  if (normalized === 'frankland') return { pickup_school: 'Frankland', pickup_school_other: '' };
  return { pickup_school: 'other', pickup_school_other: formatTitleCase(school) };
}

function groupByWeekday<T extends { weekday: string }>(sessions: T[]) {
  return WEEKDAY_ORDER.reduce<{ day: string; sessions: T[] }[]>((acc, day) => {
    const s = sessions.filter(x => x.weekday === day);
    if (s.length > 0) acc.push({ day, sessions: s });
    return acc;
  }, []);
}

export type StudentCardState = {
  summer_status: 'enrolling' | 'pausing' | 'other' | null;
  session_ids: string[];
  session_start_dates: Record<string, string>;
  waitlist_session_ids: string[];
  custom_notes: string;
  pickup_requested: boolean;
  pickup_school: 'Jackman' | 'Frankland' | 'other' | null;
  pickup_school_other: string;
  fall_status: 'same' | 'change' | 'pause' | 'unsure' | 'not_returning' | null;
  fall_start_date: string;
  fall_session_ids: string[];
  fall_session_start_dates: Record<string, string>;
  fall_waitlist_session_ids: string[];
  fall_notes: string;
  manual_current_course_name: string;
  manual_current_weekday: string;
  manual_current_start_time: string;
  manual_current_pickup_school: string;
};

type Props = {
  student: ParentFormStudentData;
  summerSessions: (Session & { is_summer: boolean })[];
  fallSessions: (Session & { student_count: number; coach_capacity: number })[];
  courseOptions: { id: string; name: string }[];
  staffEntry?: boolean;
  state: StudentCardState;
  onChange: (s: StudentCardState) => void;
};

const choiceLabelClass = 'flex min-h-11 items-start gap-3 -mx-2 rounded-lg px-2 py-2 cursor-pointer transition hover:bg-slate-50 sm:min-h-0 sm:mx-0 sm:rounded-none sm:px-0 sm:py-0 sm:hover:bg-transparent';
const optionLabelClass = 'flex min-h-9 flex-1 items-center gap-3 cursor-pointer sm:min-h-0 sm:flex-none';
const radioClass = 'mt-1 h-4 w-4 shrink-0 sm:h-auto sm:w-auto';
const checkboxClass = 'h-4 w-4 shrink-0 sm:h-auto sm:w-auto';
const dateLabelClass = 'flex min-h-9 w-full items-center justify-between gap-2 text-xs text-slate-600 sm:ml-auto sm:min-h-0 sm:w-auto';
const dateSelectClass = 'min-h-9 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 focus:outline-none sm:min-h-0';

export default function StudentCard({ student, summerSessions, fallSessions, courseOptions = [], staffEntry = false, state, onChange }: Props) {
  const summerByWeekday = groupByWeekday(summerSessions);
  const fallByWeekday = groupByWeekday(fallSessions);
  const [showStaffCurrentContext, setShowStaffCurrentContext] = useState(false);

  const currentSessions = student.current_sessions.length > 0
    ? student.current_sessions
    : student.current_weekday && student.current_start_time
      ? [{
          weekday: student.current_weekday,
          start_time: student.current_start_time,
          pickup_school: student.current_pickup_school,
        }]
      : [];
  const currentPickupSession = currentSessions.find(session => isPickupSession(session.weekday, session.start_time));
  const currentPickupEligible = currentPickupSession !== undefined;

  const currentSlot = formatCurrentSlots(currentSessions);
  const currentPickupDefaults = currentPickupSession
    ? normalizePickupSchool(currentPickupSession.pickup_school)
    : { pickup_school: null, pickup_school_other: '' };
  const currentFallDateSession = currentSessions.find(session => WEEKDAY_ORDER.includes(session.weekday));
  const currentFallDateOptions = currentFallDateSession
    ? getStartDateOptions(currentFallDateSession.weekday as WeekdayName, 'fall')
    : [];

  function defaultCurrentPickupState(): Pick<StudentCardState, 'pickup_requested' | 'pickup_school' | 'pickup_school_other'> {
    return {
      pickup_requested: currentPickupDefaults.pickup_school !== null,
      pickup_school: currentPickupDefaults.pickup_school,
      pickup_school_other: currentPickupDefaults.pickup_school_other,
    };
  }

  function setSummerStatus(status: StudentCardState['summer_status']) {
    onChange({
      ...state,
      summer_status: status,
      session_ids: status === 'enrolling' ? state.session_ids : [],
      session_start_dates: status === 'enrolling' ? state.session_start_dates : {},
      waitlist_session_ids: status === 'enrolling' ? state.waitlist_session_ids : [],
      custom_notes: status === 'other' ? state.custom_notes : '',
    });
  }

  function toggleSummerSession(id: string, weekday: string) {
    const isChecked = state.session_ids.includes(id);
    if (isChecked) {
      const ids = state.session_ids.filter(x => x !== id);
      const dates = { ...state.session_start_dates };
      delete dates[id];
      onChange({ ...state, session_ids: ids, session_start_dates: dates });
    } else {
      const options = getStartDateOptions(weekday as WeekdayName, 'summer');
      const dates = { ...state.session_start_dates };
      if (options.length > 0) dates[id] = options[0];
      onChange({
        ...state,
        session_ids: [...state.session_ids, id],
        session_start_dates: dates,
        waitlist_session_ids: state.waitlist_session_ids.filter(x => x !== id),
      });
    }
  }

  function toggleSummerWaitlistSession(id: string) {
    const isChecked = state.waitlist_session_ids.includes(id);
    onChange({
      ...state,
      waitlist_session_ids: isChecked
        ? state.waitlist_session_ids.filter(x => x !== id)
        : [...state.waitlist_session_ids, id],
    });
  }

  function setSummerSessionDate(id: string, date: string) {
    onChange({ ...state, session_start_dates: { ...state.session_start_dates, [id]: date } });
  }

  function clearPickupIfHidden(next: StudentCardState): StudentCardState {
    const nextPickupEligibleChange = fallSessions.some(
      s => next.fall_session_ids.includes(s.id) && isPickupSession(s.weekday, s.start_time),
    );
    const stillVisible =
      (next.fall_status === 'same' && currentPickupEligible) ||
      (next.fall_status === 'change' && nextPickupEligibleChange);
    if (stillVisible) return next;
    return {
      ...next,
      pickup_requested: false,
      pickup_school: null,
      pickup_school_other: '',
    };
  }

  function setFallStatus(fs: NonNullable<StudentCardState['fall_status']>) {
    onChange(clearPickupIfHidden({
      ...state,
      fall_status: fs,
      fall_start_date: fs === 'same' ? (state.fall_start_date || currentFallDateOptions[0] || '') : '',
      fall_session_ids: fs === 'change' ? state.fall_session_ids : [],
      fall_session_start_dates: fs === 'change' ? state.fall_session_start_dates : {},
      fall_waitlist_session_ids: fs === 'change' ? state.fall_waitlist_session_ids : [],
      fall_notes: ['pause', 'unsure', 'not_returning'].includes(fs) ? state.fall_notes : '',
      ...(fs === 'same' ? defaultCurrentPickupState() : {}),
    }));
  }

  function toggleFallSession(id: string, weekday: string) {
    const isChecked = state.fall_session_ids.includes(id);
    if (isChecked) {
      const ids = state.fall_session_ids.filter(x => x !== id);
      const dates = { ...state.fall_session_start_dates };
      delete dates[id];
      onChange(clearPickupIfHidden({ ...state, fall_session_ids: ids, fall_session_start_dates: dates }));
    } else {
      const options = getStartDateOptions(weekday as WeekdayName, 'fall');
      const dates = { ...state.fall_session_start_dates };
      if (options.length > 0) dates[id] = options[0];
      onChange(clearPickupIfHidden({
        ...state,
        fall_session_ids: [...state.fall_session_ids, id],
        fall_session_start_dates: dates,
        fall_waitlist_session_ids: state.fall_waitlist_session_ids.filter(x => x !== id),
      }));
    }
  }

  function toggleFallWaitlistSession(id: string) {
    const isChecked = state.fall_waitlist_session_ids.includes(id);
    onChange({
      ...state,
      fall_waitlist_session_ids: isChecked
        ? state.fall_waitlist_session_ids.filter(x => x !== id)
        : [...state.fall_waitlist_session_ids, id],
    });
  }

  function setFallSessionDate(id: string, date: string) {
    onChange({
      ...state,
      fall_session_start_dates: { ...state.fall_session_start_dates, [id]: date },
    });
  }

  function setFallStartDate(date: string) {
    onChange({ ...state, fall_start_date: date });
  }

  function setPickupRequested(requested: boolean) {
    onChange({
      ...state,
      pickup_requested: requested,
      pickup_school: requested ? (state.pickup_school ?? currentPickupDefaults.pickup_school) : null,
      pickup_school_other: requested ? (state.pickup_school_other || currentPickupDefaults.pickup_school_other) : '',
    });
  }

  function setPickupSchool(school: StudentCardState['pickup_school']) {
    onChange({
      ...state,
      pickup_school: school,
      pickup_school_other: school !== 'other' ? '' : state.pickup_school_other,
    });
  }

  const changingFallPickupEligible =
    state.fall_status === 'change' &&
    fallSessions.some(s => state.fall_session_ids.includes(s.id) && isPickupSession(s.weekday, s.start_time));
  const pickupVisible = (state.fall_status === 'same' && currentPickupEligible) || changingFallPickupEligible;
  const manualCurrentFields = [
    state.manual_current_course_name,
    state.manual_current_weekday,
    state.manual_current_start_time,
    state.manual_current_pickup_school,
  ].some(value => value.trim());
  const requiredMessages = [
    !state.summer_status ? 'Choose a summer plan.' : null,
    state.summer_status === 'enrolling' && state.session_ids.length === 0 ? 'Select at least one summer session.' : null,
    state.summer_status === 'other' && !state.custom_notes.trim() ? 'Add custom summer plan notes.' : null,
    state.fall_status === 'change' && state.fall_session_ids.length === 0 ? 'Select at least one September session.' : null,
    staffEntry &&
    state.fall_status === 'same' &&
    currentSessions.length === 0 &&
    (!state.manual_current_course_name.trim() || !state.manual_current_weekday || !state.manual_current_start_time)
      ? 'Add the previous/current class or choose another September plan.'
      : null,
    pickupVisible && state.pickup_requested && !state.pickup_school ? 'Choose a pickup school.' : null,
    pickupVisible && state.pickup_requested && state.pickup_school === 'other' && !state.pickup_school_other.trim()
      ? 'Enter the pickup school name.'
      : null,
    staffEntry && manualCurrentFields && (!state.manual_current_course_name.trim() || !state.manual_current_weekday || !state.manual_current_start_time)
      ? 'Complete the staff-only previous class fields.'
      : null,
  ].filter(Boolean);

  function renderStaffCurrentContext() {
    if (!staffEntry || state.fall_status !== 'same' || !showStaffCurrentContext) return null;

    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
              Staff-only previous class context
            </p>
            <p className="mt-0.5 text-xs text-amber-700">
              Use this when the student is already paused and the current class no longer appears.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowStaffCurrentContext(false)}
            className="rounded-full px-2 py-0.5 text-lg leading-none text-amber-700 transition hover:bg-amber-100"
            aria-label="Close previous class context"
          >
            ×
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Course</span>
            <select
              value={state.manual_current_course_name}
              onChange={e => onChange({ ...state, manual_current_course_name: e.target.value })}
              className="mt-1 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-200"
            >
              <option value="">Select course</option>
              {courseOptions.map(course => (
                <option key={course.id} value={course.name}>{course.name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Weekday</span>
            <select
              value={state.manual_current_weekday}
              onChange={e => onChange({ ...state, manual_current_weekday: e.target.value })}
              className="mt-1 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-200"
            >
              <option value="">Select day</option>
              {WEEKDAY_ORDER.map(day => <option key={day} value={day}>{day}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Start time</span>
            <input
              type="time"
              value={state.manual_current_start_time}
              onChange={e => onChange({ ...state, manual_current_start_time: e.target.value })}
              className="mt-1 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-200"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Pickup school</span>
            <select
              value={state.manual_current_pickup_school}
              onChange={e => onChange({ ...state, manual_current_pickup_school: e.target.value })}
              className="mt-1 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-200"
            >
              <option value="">No pickup</option>
              <option value="Jackman">Jackman</option>
              <option value="Frankland">Frankland</option>
              <option value="other">Other</option>
            </select>
          </label>
        </div>
      </div>
    );
  }

  function renderPickupControls() {
    return (
      <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 space-y-2">
        <label className="flex min-h-10 items-center gap-2.5 cursor-pointer sm:min-h-0">
          <input
            type="checkbox"
            checked={state.pickup_requested}
            onChange={e => setPickupRequested(e.target.checked)}
            className={`${checkboxClass} accent-emerald-600`}
          />
          <span className="text-sm font-medium text-slate-700">With school pickup</span>
        </label>

        {state.pickup_requested && (
          <div className="ml-4 space-y-2 sm:ml-6">
            {(['Jackman', 'Frankland', 'other'] as const).map(school => (
              <label key={school} className="flex min-h-10 items-center gap-2 cursor-pointer sm:min-h-0">
                <input
                  type="radio"
                  name={`pickup_school_${student.student_id}`}
                  checked={state.pickup_school === school}
                  onChange={() => setPickupSchool(school)}
                  className={`${checkboxClass} accent-emerald-600`}
                />
                <span className="text-sm text-slate-700">
                  {school === 'other' ? 'Other school' : school}
                </span>
              </label>
            ))}
            {state.pickup_school === 'other' && (
              <>
                <input
                  type="text"
                  placeholder="School name"
                  value={state.pickup_school_other}
                  onChange={e => onChange({ ...state, pickup_school_other: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-800 placeholder-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 focus:outline-none"
                />
                <p className="text-xs text-slate-500 italic">
                  We&apos;ll do our best to accommodate &quot;Other school&quot; pickup, but we can&apos;t guarantee availability for schools outside Jackman / Frankland. We&apos;ll be in touch to confirm.
                </p>
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-4 space-y-5 sm:p-6">
      {/* Header */}
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-slate-800">{student.student_name}</h2>
          {staffEntry && !student.is_active && (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-amber-700">
              Inactive
            </span>
          )}
        </div>
        <p className="text-sm text-slate-500 mt-0.5">
          {currentSlot ? `Current session${currentSessions.length > 1 ? 's' : ''}: ${currentSlot}` : 'No current class on file'}
        </p>
        {staffEntry && !student.is_active && (
          <p className="mt-1 text-xs text-amber-700">
            Inactive in portal. Staff can update this card, but no response is saved unless something changes.
          </p>
        )}
      </div>

      {requiredMessages.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
          {requiredMessages[0]}
        </div>
      )}

      {/* ── Summer section ──────────────────────────────────────────────── */}
      <div className="space-y-3">
        <p className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Summer Schedule</p>

        <fieldset className="space-y-3">
          <legend className="sr-only">Summer schedule choice for {student.student_name}</legend>

          <label className={choiceLabelClass}>
            <input
              type="radio"
              name={`summer_${student.student_id}`}
              checked={state.summer_status === 'enrolling'}
              onChange={() => setSummerStatus('enrolling')}
              className={`${radioClass} accent-sky-600`}
            />
            <span className="min-w-0 flex-1 text-slate-700">Continue weekly classes in July and August</span>
          </label>

          {state.summer_status === 'enrolling' && (
            <div className="ml-3 space-y-4 pt-1 sm:ml-6">
              <p className="text-xs text-slate-500">
                Please select your preferred session(s):
              </p>
              {summerByWeekday.map(({ day, sessions }) => {
                const dateOptions = getStartDateOptions(day as WeekdayName, 'summer');
                return (
                  <div key={day}>
                    <p className="text-sm font-medium text-slate-600 mb-2">{day}</p>
                    <div className="flex flex-col gap-2">
                      {sessions.map(s => {
                        const full = s.is_full === true;
                        const checked = state.session_ids.includes(s.id);
                        const waitlisted = state.waitlist_session_ids.includes(s.id);
                        const selectedDate = state.session_start_dates[s.id] ?? dateOptions[0] ?? '';
                        return (
                          <div
                            key={s.id}
                            className={`flex min-h-11 flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5 sm:min-h-0 sm:py-2 ${
                              full
                                ? waitlisted
                                  ? 'border-amber-300 bg-amber-50'
                                  : 'border-slate-200 bg-slate-50'
                                : checked
                                  ? 'border-sky-400 bg-sky-50'
                                  : 'border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            {full ? (
                              <>
                                <div className="flex min-h-8 min-w-[9rem] items-center gap-3 sm:min-h-0">
                                  <span className="text-sm text-slate-700">
                                    {formatTime(s.start_time)}
                                  </span>
                                  <span className="text-[10px] font-semibold uppercase tracking-wide text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                                    Full
                                  </span>
                                </div>
                                <label className="flex min-h-9 items-center gap-2 cursor-pointer sm:ml-auto sm:min-h-0">
                                  <input
                                    type="checkbox"
                                    checked={waitlisted}
                                    onChange={() => toggleSummerWaitlistSession(s.id)}
                                    className={`${checkboxClass} accent-amber-600`}
                                  />
                                  <span className="text-sm font-medium text-amber-800">
                                    Add to waitlist
                                  </span>
                                </label>
                                {waitlisted && (
                                  <p className="basis-full text-xs font-medium text-amber-700 sm:pl-[9rem]">
                                    For now, please select another time slot.
                                  </p>
                                )}
                              </>
                            ) : (
                              <label className={optionLabelClass}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleSummerSession(s.id, day)}
                                  className={`${checkboxClass} accent-sky-600`}
                                />
                                <span className="text-sm text-slate-700">
                                  {formatTime(s.start_time)}
                                </span>
                              </label>
                            )}
                            {!full && checked && dateOptions.length > 0 && (
                              <label className={dateLabelClass}>
                                Start:
                                <select
                                  value={selectedDate}
                                  onChange={e => setSummerSessionDate(s.id, e.target.value)}
                                  className={`${dateSelectClass} focus:border-sky-500 focus:ring-2 focus:ring-sky-200`}
                                >
                                  {dateOptions.map(d => (
                                    <option key={d} value={d}>{formatStartDate(d)}</option>
                                  ))}
                                </select>
                              </label>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {state.session_ids.length === 0 && (
                <p className="text-xs text-amber-600">Select at least one summer session above.</p>
              )}
            </div>
          )}

          <label className={choiceLabelClass}>
            <input
              type="radio"
              name={`summer_${student.student_id}`}
              checked={state.summer_status === 'pausing'}
              onChange={() => setSummerStatus('pausing')}
              className={`${radioClass} accent-sky-600`}
            />
            <span className="min-w-0 flex-1 text-slate-700">Not attending this summer in July and August</span>
          </label>

          <label className={choiceLabelClass}>
            <input
              type="radio"
              name={`summer_${student.student_id}`}
              checked={state.summer_status === 'other'}
              onChange={() => setSummerStatus('other')}
              className={`${radioClass} accent-sky-600`}
            />
            <span className="min-w-0 flex-1 text-slate-700">
              Custom plan: choose the weeks/days that fit your family&apos;s summer plans
            </span>
          </label>

          {state.summer_status === 'other' && (
            <div className="ml-3 space-y-1 sm:ml-6">
              <p className="text-xs text-slate-500">
                Tell us the weeks or days that work for you, and we&apos;ll follow up to confirm the plan.
              </p>
              <textarea
                rows={3}
                placeholder='e.g. "Attend the first two weeks in July on Tuesdays, and two Saturdays in mid-August"'
                value={state.custom_notes}
                onChange={e => onChange({ ...state, custom_notes: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-200 focus:outline-none"
              />
            </div>
          )}
        </fieldset>
      </div>

      {/* ── Fall / September section ──────────────────────────────────── */}
      <div className="border-t border-slate-100 pt-5 space-y-3">
        <div>
          <p className="text-sm font-semibold text-slate-700 uppercase tracking-wide">September (Fall) Schedule</p>
          <p className="text-xs text-slate-400 mt-1">
            We&apos;ll reach out in August to re-confirm your fall schedule before classes begin in September.
          </p>
        </div>

        <fieldset className="space-y-3">
          <legend className="sr-only">Fall schedule choice for {student.student_name}</legend>

          <label className={choiceLabelClass}>
            <input
              type="radio"
              name={`fall_${student.student_id}`}
              checked={state.fall_status === 'same'}
              onChange={() => setFallStatus('same')}
              className={`${radioClass} accent-emerald-600`}
            />
            <span className="min-w-0 flex-1 text-slate-700">
              {currentSlot ? `Keep current session${currentSessions.length > 1 ? 's' : ''} - ${currentSlot}` : 'Keep current session'}
            </span>
          </label>

          {state.fall_status === 'same' && currentFallDateOptions.length > 0 && (
            <div className="ml-3 flex flex-wrap items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 sm:ml-6">
              <label className={dateLabelClass}>
                Start:
                <select
                  value={state.fall_start_date || currentFallDateOptions[0]}
                  onChange={e => setFallStartDate(e.target.value)}
                  className={`${dateSelectClass} focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200`}
                >
                  {currentFallDateOptions.map(d => (
                    <option key={d} value={d}>{formatStartDate(d)}</option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {state.fall_status === 'same' && currentPickupEligible && (
            <div className="ml-3 sm:ml-6">
              {renderPickupControls()}
            </div>
          )}

          {staffEntry && state.fall_status === 'same' && (
            <div className="ml-3 space-y-3 sm:ml-6">
              {!showStaffCurrentContext && (
                <button
                  type="button"
                  onClick={() => setShowStaffCurrentContext(true)}
                  className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 transition hover:bg-amber-100"
                >
                  Update previous/current class
                </button>
              )}
              {renderStaffCurrentContext()}
            </div>
          )}

          <label className={choiceLabelClass}>
            <input
              type="radio"
              name={`fall_${student.student_id}`}
              checked={state.fall_status === 'change'}
              onChange={() => setFallStatus('change')}
              className={`${radioClass} accent-emerald-600`}
            />
            <span className="min-w-0 flex-1 text-slate-700">Request a different class time starting in September</span>
          </label>

          {state.fall_status === 'change' && (
            <div className="ml-3 space-y-4 pt-1 sm:ml-6">
              <p className="text-xs text-slate-400">
                If there&apos;s any issue with availability for this time, we&apos;ll let you know.
              </p>
              {fallByWeekday.length === 0 ? (
                <p className="text-sm text-slate-500">No fall sessions on file yet. We&apos;ll be in touch.</p>
              ) : (
                fallByWeekday.map(({ day, sessions }) => {
                  const dateOptions = getStartDateOptions(day as WeekdayName, 'fall');
                  return (
                    <div key={day}>
                      <p className="text-sm font-medium text-slate-600 mb-2">{day}</p>
                      <div className="flex flex-col gap-2">
                        {sessions.map(s => {
                          const full = s.is_full === true;
                          const checked = state.fall_session_ids.includes(s.id);
                          const waitlisted = state.fall_waitlist_session_ids.includes(s.id);
                          const selectedDate = state.fall_session_start_dates[s.id] ?? dateOptions[0] ?? '';
                          const pickupEligible = isPickupSession(s.weekday, s.start_time);
                          return (
                            <div
                              key={s.id}
                              className={`flex min-h-11 flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5 sm:min-h-0 sm:py-2 ${
                                full
                                  ? waitlisted
                                    ? 'border-amber-300 bg-amber-50'
                                    : 'border-slate-200 bg-slate-50'
                                  : checked
                                    ? 'border-emerald-400 bg-emerald-50'
                                    : 'border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              {full ? (
                                <>
                                  <div className="flex min-h-8 min-w-[9rem] items-center gap-3 sm:min-h-0">
                                    <span className="text-sm text-slate-700">
                                      {formatTime(s.start_time)}
                                    </span>
                                    <span className="text-[10px] font-semibold uppercase tracking-wide text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                                      Full
                                    </span>
                                  </div>
                                  <label className="flex min-h-9 items-center gap-2 cursor-pointer sm:ml-auto sm:min-h-0">
                                    <input
                                      type="checkbox"
                                      checked={waitlisted}
                                      onChange={() => toggleFallWaitlistSession(s.id)}
                                      className={`${checkboxClass} accent-amber-600`}
                                    />
                                    <span className="text-sm font-medium text-amber-800">
                                      Add to waitlist
                                    </span>
                                  </label>
                                  {waitlisted && (
                                    <p className="basis-full text-xs font-medium text-amber-700 sm:pl-[9rem]">
                                      For now, please select another time slot.
                                    </p>
                                  )}
                                </>
                              ) : (
                                <label className={optionLabelClass}>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleFallSession(s.id, day)}
                                    className={`${checkboxClass} accent-emerald-600`}
                                  />
                                  <span className="text-sm text-slate-700">
                                    {formatTime(s.start_time)}
                                  </span>
                                </label>
                              )}
                              {!full && checked && dateOptions.length > 0 && (
                                <label className={dateLabelClass}>
                                  Start:
                                  <select
                                    value={selectedDate}
                                    onChange={e => setFallSessionDate(s.id, e.target.value)}
                                    className={`${dateSelectClass} focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200`}
                                  >
                                    {dateOptions.map(d => (
                                      <option key={d} value={d}>{formatStartDate(d)}</option>
                                    ))}
                                  </select>
                                </label>
                              )}
                              {checked && !full && pickupEligible && (
                                <div className="basis-full pl-3 sm:pl-7">
                                  {renderPickupControls()}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
              {fallByWeekday.length > 0 && state.fall_session_ids.length === 0 && (
                <p className="text-xs text-amber-600">Select at least one session above.</p>
              )}
            </div>
          )}

          <label className={choiceLabelClass}>
            <input
              type="radio"
              name={`fall_${student.student_id}`}
              checked={state.fall_status === 'unsure' || state.fall_status === 'pause'}
              onChange={() => setFallStatus('pause')}
              className={`${radioClass} accent-emerald-600`}
            />
            <span className="min-w-0 flex-1 text-slate-700">
              Not sure yet — we won&apos;t hold a September spot
            </span>
          </label>

          {staffEntry && (
            <label className="flex min-h-11 items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 cursor-pointer sm:min-h-0">
              <input
                type="radio"
                name={`fall_${student.student_id}`}
                checked={state.fall_status === 'not_returning'}
                onChange={() => setFallStatus('not_returning')}
                className={`${radioClass} accent-amber-600`}
              />
              <span className="min-w-0 flex-1 text-slate-700">
                Definitely not returning in September
                <span className="block text-xs text-amber-700">Internal staff marking only.</span>
              </span>
            </label>
          )}

          {['pause', 'unsure', 'not_returning'].includes(state.fall_status ?? '') && (
            <div className="ml-3 sm:ml-6">
              <textarea
                rows={3}
                placeholder="Any additional notes for us? (optional)"
                value={state.fall_notes}
                onChange={e => onChange({ ...state, fall_notes: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 focus:outline-none"
              />
            </div>
          )}
        </fieldset>
      </div>
    </div>
  );
}
