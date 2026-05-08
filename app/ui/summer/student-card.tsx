'use client';

import { ParentFormStudentData, Session } from '@/app/lib/definitions';
import { getStartDateOptions, formatStartDate, WeekdayName } from '@/app/lib/tdsb-calendar';

const WEEKDAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return m === 0 ? `${hour} ${ampm}` : `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
}

function getHour(startTime: string): number {
  return parseInt(startTime.split(':')[0], 10);
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
  custom_notes: string;
  pickup_requested: boolean;
  pickup_school: 'Jackman' | 'Frankland' | 'other' | null;
  pickup_school_other: string;
  fall_status: 'same' | 'change' | 'pause' | null;
  fall_session_ids: string[];
  fall_session_start_dates: Record<string, string>;
  fall_notes: string;
};

type Props = {
  student: ParentFormStudentData;
  summerSessions: (Session & { is_summer: boolean })[];
  fallSessions: (Session & { student_count: number; coach_capacity: number })[];
  state: StudentCardState;
  onChange: (s: StudentCardState) => void;
};

export default function StudentCard({ student, summerSessions, fallSessions, state, onChange }: Props) {
  const summerByWeekday = groupByWeekday(summerSessions);
  const fallByWeekday = groupByWeekday(fallSessions);

  const currentIs4pm =
    !!student.current_start_time && getHour(student.current_start_time) === 16;
  const fallChangeHas4pm = fallSessions.some(
    s => state.fall_session_ids.includes(s.id) && getHour(s.start_time) === 16,
  );
  const fallPickupVisible =
    (state.fall_status === 'same' && currentIs4pm) ||
    (state.fall_status === 'change' && fallChangeHas4pm);

  const currentSlot =
    student.current_weekday && student.current_start_time
      ? `${student.current_weekday} ${formatTime(student.current_start_time)}`
      : null;

  function setSummerStatus(status: StudentCardState['summer_status']) {
    onChange({
      ...state,
      summer_status: status,
      session_ids: status === 'enrolling' ? state.session_ids : [],
      session_start_dates: status === 'enrolling' ? state.session_start_dates : {},
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
      onChange({ ...state, session_ids: [...state.session_ids, id], session_start_dates: dates });
    }
  }

  function setSummerSessionDate(id: string, date: string) {
    onChange({ ...state, session_start_dates: { ...state.session_start_dates, [id]: date } });
  }

  function clearPickupIfHidden(next: StudentCardState): StudentCardState {
    const next4pmChange = fallSessions.some(
      s => next.fall_session_ids.includes(s.id) && getHour(s.start_time) === 16,
    );
    const stillVisible =
      (next.fall_status === 'same' && currentIs4pm) ||
      (next.fall_status === 'change' && next4pmChange);
    if (stillVisible) return next;
    return {
      ...next,
      pickup_requested: false,
      pickup_school: null,
      pickup_school_other: '',
    };
  }

  function setFallStatus(fs: 'same' | 'change' | 'pause') {
    onChange(clearPickupIfHidden({
      ...state,
      fall_status: fs,
      fall_session_ids: fs === 'change' ? state.fall_session_ids : [],
      fall_session_start_dates: fs === 'change' ? state.fall_session_start_dates : {},
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
      }));
    }
  }

  function setFallSessionDate(id: string, date: string) {
    onChange({
      ...state,
      fall_session_start_dates: { ...state.fall_session_start_dates, [id]: date },
    });
  }

  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-6 space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-slate-800">{student.student_name}</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          {currentSlot ? `Currently enrolled: ${currentSlot}` : 'No current class on file'}
        </p>
      </div>

      {/* ── Summer section ──────────────────────────────────────────────── */}
      <div className="space-y-3">
        <p className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Summer Schedule</p>

        <fieldset className="space-y-3">
          <legend className="sr-only">Summer schedule choice for {student.student_name}</legend>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name={`summer_${student.student_id}`}
              checked={state.summer_status === 'enrolling'}
              onChange={() => setSummerStatus('enrolling')}
              className="mt-0.5 accent-sky-600"
            />
            <span className="text-slate-700">Enroll in summer sessions</span>
          </label>

          {state.summer_status === 'enrolling' && (
            <div className="ml-6 space-y-4 pt-1">
              {summerByWeekday.map(({ day, sessions }) => {
                const dateOptions = getStartDateOptions(day as WeekdayName, 'summer');
                return (
                  <div key={day}>
                    <p className="text-sm font-medium text-slate-600 mb-1.5">{day}</p>
                    <div className="flex flex-col gap-2">
                      {sessions.map(s => {
                        const full = s.is_full === true;
                        const checked = state.session_ids.includes(s.id);
                        const selectedDate = state.session_start_dates[s.id] ?? dateOptions[0] ?? '';
                        return (
                          <div key={s.id} className="flex flex-wrap items-center gap-2">
                            <label
                              className={`flex items-center gap-1.5 ${full ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                            >
                              <input
                                type="checkbox"
                                disabled={full}
                                checked={checked && !full}
                                onChange={() => toggleSummerSession(s.id, day)}
                                className="accent-sky-600"
                              />
                              <span className={`text-sm ${full ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                                {formatTime(s.start_time)}
                              </span>
                              {full && (
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                                  Full
                                </span>
                              )}
                            </label>
                            {checked && !full && dateOptions.length > 0 && (
                              <label className="flex items-center gap-1.5 text-xs text-slate-500">
                                Start:
                                <select
                                  value={selectedDate}
                                  onChange={e => setSummerSessionDate(s.id, e.target.value)}
                                  className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 focus:border-sky-500 focus:ring-2 focus:ring-sky-200 focus:outline-none"
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
                <p className="text-xs text-amber-600">Select at least one session above.</p>
              )}
            </div>
          )}

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name={`summer_${student.student_id}`}
              checked={state.summer_status === 'pausing'}
              onChange={() => setSummerStatus('pausing')}
              className="mt-0.5 accent-sky-600"
            />
            <span className="text-slate-700">Pause for summer</span>
          </label>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name={`summer_${student.student_id}`}
              checked={state.summer_status === 'other'}
              onChange={() => setSummerStatus('other')}
              className="mt-0.5 accent-sky-600"
            />
            <span className="text-slate-700">Custom / unusual request</span>
          </label>

          {state.summer_status && (
            <div className="ml-6 space-y-1">
              <p className="text-xs text-slate-500">
                Need a custom or non-standard schedule? Add details below and we&apos;ll follow up.
              </p>
              <textarea
                rows={3}
                placeholder='e.g. "Only June evenings, then pause in July and resume mid-August"'
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
          {currentSlot && (
            <p className="text-xs text-slate-500 mt-0.5">Current slot: {currentSlot}</p>
          )}
          <p className="text-xs text-slate-400 mt-1">
            We&apos;ll reach out in August to re-confirm your fall schedule before September begins.
          </p>
        </div>

        <fieldset className="space-y-3">
          <legend className="sr-only">Fall schedule choice for {student.student_name}</legend>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name={`fall_${student.student_id}`}
              checked={state.fall_status === 'same'}
              onChange={() => setFallStatus('same')}
              className="mt-0.5 accent-emerald-600"
            />
            <span className="text-slate-700">
              {currentSlot ? `Keep current slot — ${currentSlot}` : 'No change in September'}
            </span>
          </label>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name={`fall_${student.student_id}`}
              checked={state.fall_status === 'change'}
              onChange={() => setFallStatus('change')}
              className="mt-0.5 accent-emerald-600"
            />
            <span className="text-slate-700">Request a different time for September</span>
          </label>

          {state.fall_status === 'change' && (
            <div className="ml-6 space-y-4 pt-1">
              <p className="text-xs text-slate-400">
                Availability is based on coach capacity. All requests are subject to staff confirmation.
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
                          const selectedDate = state.fall_session_start_dates[s.id] ?? dateOptions[0] ?? '';
                          return (
                            <div
                              key={s.id}
                              className={`flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 ${
                                full
                                  ? 'border-slate-200 bg-slate-50 opacity-60'
                                  : checked
                                    ? 'border-emerald-400 bg-emerald-50'
                                    : 'border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              <label className={`flex items-center gap-3 ${full ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                                <input
                                  type="checkbox"
                                  disabled={full}
                                  checked={checked && !full}
                                  onChange={() => toggleFallSession(s.id, day)}
                                  className="accent-emerald-600"
                                />
                                <span className={`text-sm ${full ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                                  {formatTime(s.start_time)}
                                </span>
                                {full && (
                                  <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                                    Full
                                  </span>
                                )}
                              </label>
                              {checked && !full && dateOptions.length > 0 && (
                                <label className="flex items-center gap-1.5 text-xs text-slate-600 ml-auto">
                                  Start:
                                  <select
                                    value={selectedDate}
                                    onChange={e => setFallSessionDate(s.id, e.target.value)}
                                    className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 focus:outline-none"
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
                })
              )}
              {fallByWeekday.length > 0 && state.fall_session_ids.length === 0 && (
                <p className="text-xs text-amber-600">Select at least one fall time above.</p>
              )}
            </div>
          )}

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name={`fall_${student.student_id}`}
              checked={state.fall_status === 'pause'}
              onChange={() => setFallStatus('pause')}
              className="mt-0.5 accent-emerald-600"
            />
            <span className="text-slate-700">
              Pause for fall / Not sure yet — we won&apos;t hold a spot for September
            </span>
          </label>

          {state.fall_status === 'pause' && (
            <div className="ml-6">
              <textarea
                rows={3}
                placeholder="Any additional notes for us? (optional)"
                value={state.fall_notes}
                onChange={e => onChange({ ...state, fall_notes: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 focus:outline-none"
              />
            </div>
          )}

          {/* ── School pickup (shown only when a 4 PM fall session is in play) ── */}
          {fallPickupVisible && (
            <div className="rounded-xl bg-emerald-50 ring-1 ring-emerald-100 px-4 py-3 space-y-3">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={state.pickup_requested}
                  onChange={e =>
                    onChange({
                      ...state,
                      pickup_requested: e.target.checked,
                      pickup_school: e.target.checked ? state.pickup_school : null,
                      pickup_school_other: e.target.checked ? state.pickup_school_other : '',
                    })
                  }
                  className="accent-emerald-600"
                />
                <span className="text-sm font-medium text-slate-700">
                  Request school pickup for September 4 PM class
                </span>
              </label>

              {state.pickup_requested && (
                <div className="ml-6 space-y-2">
                  {(['Jackman', 'Frankland', 'other'] as const).map(school => (
                    <label key={school} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name={`pickup_school_${student.student_id}`}
                        checked={state.pickup_school === school}
                        onChange={() =>
                          onChange({
                            ...state,
                            pickup_school: school,
                            pickup_school_other: school !== 'other' ? '' : state.pickup_school_other,
                          })
                        }
                        className="accent-emerald-600"
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
          )}
        </fieldset>
      </div>
    </div>
  );
}
