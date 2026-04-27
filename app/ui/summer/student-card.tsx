'use client';

import { ParentFormStudentData, Session } from '@/app/lib/definitions';

const WEEKDAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return m === 0 ? `${hour} ${ampm}` : `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
}

function groupByWeekday<T extends { weekday: string }>(sessions: T[]) {
  return WEEKDAY_ORDER.reduce<{ day: string; sessions: T[] }[]>((acc, day) => {
    const s = sessions.filter(x => x.weekday === day);
    if (s.length > 0) acc.push({ day, sessions: s });
    return acc;
  }, []);
}

export type StudentCardState = {
  summer_status: 'enrolling' | 'pausing' | 'no_change' | 'other' | null;
  session_ids: string[];
  custom_notes: string;
  fall_status: 'same' | 'change' | 'pause' | null;
  fall_session_ids: string[];
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

  const currentSlot =
    student.current_weekday && student.current_start_time
      ? `${student.current_weekday} ${formatTime(student.current_start_time)}`
      : null;

  function setSummerStatus(status: StudentCardState['summer_status']) {
    onChange({
      ...state,
      summer_status: status,
      session_ids: status === 'enrolling' ? state.session_ids : [],
    });
  }

  function toggleSummerSession(id: string) {
    const ids = state.session_ids.includes(id)
      ? state.session_ids.filter(x => x !== id)
      : [...state.session_ids, id];
    onChange({ ...state, session_ids: ids });
  }

  function setFallStatus(fs: 'same' | 'change' | 'pause') {
    onChange({ ...state, fall_status: fs, fall_session_ids: fs === 'change' ? state.fall_session_ids : [] });
  }

  function toggleFallSession(id: string) {
    const ids = state.fall_session_ids.includes(id)
      ? state.fall_session_ids.filter(x => x !== id)
      : [...state.fall_session_ids, id];
    onChange({ ...state, fall_session_ids: ids });
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
              checked={state.summer_status === 'no_change'}
              onChange={() => setSummerStatus('no_change')}
              className="mt-0.5 accent-sky-600"
            />
            <span className="text-slate-700">
              No change — keep my current schedule through summer
            </span>
          </label>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name={`summer_${student.student_id}`}
              checked={state.summer_status === 'enrolling'}
              onChange={() => setSummerStatus('enrolling')}
              className="mt-0.5 accent-sky-600"
            />
            <span className="text-slate-700">Enroll in different / additional summer sessions</span>
          </label>

          {state.summer_status === 'enrolling' && (
            <div className="ml-6 space-y-4 pt-1">
              {summerByWeekday.map(({ day, sessions }) => (
                <div key={day}>
                  <p className="text-sm font-medium text-slate-600 mb-1.5">{day}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {sessions.map(s => (
                      <label key={s.id} className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={state.session_ids.includes(s.id)}
                          onChange={() => toggleSummerSession(s.id)}
                          className="accent-sky-600"
                        />
                        <span className="text-sm text-slate-700">{formatTime(s.start_time)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
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

          {state.summer_status === 'other' && (
            <div className="ml-6">
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
            We'll reach out in August to re-confirm your fall schedule before September begins.
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
                <p className="text-sm text-slate-500">No fall sessions on file yet. We'll be in touch.</p>
              ) : (
                fallByWeekday.map(({ day, sessions }) => (
                  <div key={day}>
                    <p className="text-sm font-medium text-slate-600 mb-2">{day}</p>
                    <div className="flex flex-col gap-2">
                      {sessions.map(s => {
                        // Available spots = coach capacity minus 5-spot buffer minus current enrolments
                        const hasCapacityData = s.coach_capacity > 0;
                        const available = hasCapacityData
                          ? Math.max(0, s.coach_capacity - 5) - s.student_count
                          : null;
                        const atCapacity = available !== null && available <= 0;

                        return (
                          <label
                            key={s.id}
                            className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 cursor-pointer hover:bg-slate-50 has-[:checked]:border-emerald-400 has-[:checked]:bg-emerald-50"
                          >
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={state.fall_session_ids.includes(s.id)}
                                onChange={() => toggleFallSession(s.id)}
                                className="accent-emerald-600"
                              />
                              <span className="text-sm text-slate-700">{formatTime(s.start_time)}</span>
                            </div>
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${
                              !hasCapacityData
                                ? 'bg-slate-100 text-slate-500'
                                : atCapacity
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-emerald-100 text-emerald-700'
                            }`}>
                              {!hasCapacityData
                                ? `${s.student_count} enrolled`
                                : atCapacity
                                  ? 'At capacity'
                                  : 'Available'}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))
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
              Pause for fall / Not sure yet — we won't hold a spot for September
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
        </fieldset>
      </div>
    </div>
  );
}
