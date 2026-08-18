'use client';

import { useActionState, useMemo, useState } from 'react';
import { submitFallConfirmation } from '@/app/lib/fall-actions';
import {
  FallConfirmationStatus,
  FallFormData,
  FallPickupSchool,
  FallSlotChoice,
} from '@/app/lib/definitions';

type StudentState = {
  status: FallConfirmationStatus | null;
  // A student attending more than once a week has several, each with its own start date.
  slots: FallSlotChoice[];
  // Default for newly selected slots; never submitted on its own.
  default_start_date: string;
  pickup_requested: boolean;
  pickup_school: FallPickupSchool | null;
  notes: string;
};

const slotKey = (weekday: string, startTime: string) => `${weekday}|${startTime}`;

function formatTime(t: string | null): string {
  if (!t) return '—';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function formatRange(startTime: string, endTime: string | null): string {
  return endTime ? `${formatTime(startTime)} – ${formatTime(endTime)}` : formatTime(startTime);
}

function formatSlot(weekday: string | null, startTime: string | null, endTime: string | null): string {
  if (!weekday || !startTime) return 'Not set';
  return `${weekday} at ${formatRange(startTime, endTime)}`;
}

const SUMMER_FALL_STATUS_LABEL: Record<string, string> = {
  same: 'Keeping the same class in September',
  change: 'Requesting a different class time in September',
  pause: 'Not holding a September spot',
  unsure: 'Returning in September, day not decided',
  not_returning: 'Not returning in September',
};

function formatLongDate(date: string | null): string | null {
  if (!date) return null;
  return new Intl.DateTimeFormat('en-CA', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(`${date}T00:00:00`));
}

function initialState(student: FallFormData['students'][number]): StudentState {
  return {
    status: null,
    slots: student.prefill_slots,
    default_start_date: student.prefill_start_date ?? '',
    pickup_requested: student.prefill_pickup_requested,
    pickup_school: student.prefill_pickup_school,
    notes: '',
  };
}

export default function FallConfirmForm({
  data,
  token,
  staffEntry = false,
}: {
  data: FallFormData;
  token: string;
  staffEntry?: boolean;
}) {
  const [state, formAction, isPending] = useActionState(submitFallConfirmation, undefined);
  const [students, setStudents] = useState<Record<string, StudentState>>(() =>
    Object.fromEntries(data.students.map(s => [s.student_id, initialState(s)])),
  );
  // Grouped by day so every slot is visible at once — with multi-select there is no
  // "pick a day, then a time" funnel, since a student can attend on several days.
  const slotsByWeekday = useMemo(() => {
    const map = new Map<string, { start_time: string; end_time: string }[]>();
    for (const slot of data.fall_slots) {
      map.set(slot.weekday, [
        ...(map.get(slot.weekday) ?? []),
        { start_time: slot.start_time, end_time: slot.end_time },
      ]);
    }
    return map;
  }, [data.fall_slots]);

  const endTimeBySlot = useMemo(() => {
    const map = new Map<string, string>();
    for (const slot of data.fall_slots) {
      map.set(`${slot.weekday}|${slot.start_time}`, slot.end_time);
    }
    return map;
  }, [data.fall_slots]);

  function update(studentId: string, patch: Partial<StudentState>) {
    setStudents(prev => ({ ...prev, [studentId]: { ...prev[studentId], ...patch } }));
  }

  function toggleSlot(studentId: string, weekday: string, startTime: string) {
    setStudents(prev => {
      const entry = prev[studentId];
      const key = slotKey(weekday, startTime);
      const has = entry.slots.some(s => slotKey(s.weekday, s.start_time) === key);
      return {
        ...prev,
        [studentId]: {
          ...entry,
          slots: has
            ? entry.slots.filter(s => slotKey(s.weekday, s.start_time) !== key)
            : [
                ...entry.slots,
                {
                  weekday,
                  start_time: startTime,
                  start_date: entry.default_start_date,
                  course_name: null,
                  change_course: false,
                },
              ],
        },
      };
    });
  }

  function toggleChangeCourse(studentId: string, weekday: string, startTime: string) {
    setStudents(prev => {
      const entry = prev[studentId];
      const key = slotKey(weekday, startTime);
      return {
        ...prev,
        [studentId]: {
          ...entry,
          slots: entry.slots.map(s =>
            slotKey(s.weekday, s.start_time) === key
              ? { ...s, change_course: !s.change_course }
              : s,
          ),
        },
      };
    });
  }

  function setSlotDate(studentId: string, weekday: string, startTime: string, date: string) {
    setStudents(prev => {
      const entry = prev[studentId];
      const key = slotKey(weekday, startTime);
      return {
        ...prev,
        [studentId]: {
          ...entry,
          slots: entry.slots.map(s =>
            slotKey(s.weekday, s.start_time) === key ? { ...s, start_date: date } : s,
          ),
        },
      };
    });
  }

  const unanswered = data.students.filter(s => students[s.student_id]?.status === null);
  const incomplete = data.students.filter(s => {
    const entry = students[s.student_id];
    if (entry?.status !== 'confirmed') return false;
    if (entry.slots.length === 0) return true;
    if (entry.slots.some(slot => !slot.start_date)) return true;
    return entry.pickup_requested && !entry.pickup_school;
  });
  const canSubmit = unanswered.length === 0 && incomplete.length === 0;

  const payload = data.students.map(student => {
    const entry = students[student.student_id];
    return {
      student_id: student.student_id,
      fall_confirmation_status: entry.status,
      slots: entry.slots,
      pickup_requested: entry.pickup_requested,
      pickup_school: entry.pickup_school,
      notes: entry.notes,
      prefill_source: student.prefill_source,
    };
  });

  if (data.students.length === 0) {
    return (
      <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-8 text-center">
        <p className="text-slate-700 font-medium">We don&apos;t have any students on file for this family.</p>
        <p className="text-slate-500 text-sm mt-2">Please reply to the email you received and we&apos;ll sort it out.</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="students" value={JSON.stringify(payload)} />
      {staffEntry && <input type="hidden" name="staff_entry" value="1" />}

      {data.students.map(student => {
        const entry = students[student.student_id];
        const selectedKeys = new Set(entry.slots.map(s => slotKey(s.weekday, s.start_time)));
        const hasSession = entry.slots.length > 0;
        const selectedLabel = hasSession
          ? entry.slots
              .map(s =>
                formatSlot(s.weekday, s.start_time, endTimeBySlot.get(slotKey(s.weekday, s.start_time)) ?? null),
              )
              .join(' · ')
          : 'Not set';

        return (
          <section
            key={student.student_id}
            className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm overflow-hidden"
          >
            <header className="border-b border-slate-100 bg-slate-50 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-800">{student.student_name}</h2>
              {student.current_sessions.length > 0 ? (
                <p className="text-sm text-slate-500 mt-0.5">
                  Currently enrolled:{' '}
                  {student.current_sessions
                    .map(s =>
                      `${s.weekday} ${formatRange(
                        s.start_time,
                        endTimeBySlot.get(`${s.weekday}|${s.start_time}`) ?? null,
                      )}`,
                    )
                    .join(', ')}
                </p>
              ) : (
                <p className="text-sm text-slate-500 mt-0.5">No current class on file.</p>
              )}
              {student.latest_status && (
                <p className="text-xs text-amber-700 mt-1">
                  You already answered for {student.student_name}. Submitting again will replace that answer.
                </p>
              )}
            </header>

            <div className="p-5 space-y-5">
              {/* Static summary of what they submitted on the summer form */}
              {student.summer_plan && (
                <div className="rounded-xl bg-slate-50 ring-1 ring-slate-200 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    What you told us on the summer form
                  </p>
                  <p className="text-sm font-medium text-slate-800 mt-1">
                    {SUMMER_FALL_STATUS_LABEL[student.summer_plan.fall_status ?? ''] ??
                      'No September preference recorded'}
                  </p>
                  {student.summer_plan.sessions.length > 0 && (
                    <p className="text-sm text-slate-600 mt-0.5">
                      {student.summer_plan.sessions
                        .map(s => `${s.weekday} ${formatRange(s.start_time, s.end_time)}`)
                        .join(', ')}
                    </p>
                  )}
                  {student.summer_plan.start_date && (
                    <p className="text-sm text-slate-600 mt-0.5">
                      Starting {formatLongDate(student.summer_plan.start_date)}
                    </p>
                  )}
                  <p className="text-sm text-slate-600 mt-0.5">
                    {student.summer_plan.pickup_requested && student.summer_plan.pickup_school
                      ? `Pickup from ${student.summer_plan.pickup_school}`
                      : 'No pickup'}
                  </p>
                  {student.summer_plan.notes && (
                    <div className="mt-2 border-t border-slate-200 pt-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Your notes
                      </p>
                      <p className="text-sm italic text-slate-600 mt-0.5">
                        “{student.summer_plan.notes}”
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Current selection */}
              <div className="rounded-xl bg-sky-50 ring-1 ring-sky-100 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
                  Your fall plan
                </p>
                <p className="text-sm text-sky-900 mt-1">
                  {selectedLabel}
                  {entry.pickup_requested && entry.pickup_school
                    ? ` · Pickup from ${entry.pickup_school}`
                    : ' · No pickup'}
                </p>
                {entry.slots.map(slot => (
                  <p key={slotKey(slot.weekday, slot.start_time)} className="text-sm text-sky-900">
                    {slot.weekday} starting{' '}
                    {slot.start_date ? formatLongDate(slot.start_date) : '(choose a date)'}
                  </p>
                ))}
                {student.prefill_source === 'summer_form' && (
                  <p className="text-xs text-sky-700 mt-1">
                    Carried over from your summer form. Change anything below if it&apos;s out of date.
                  </p>
                )}
                {student.prefill_source === 'current_enrolment' && (
                  <p className="text-xs text-sky-700 mt-1">
                    Based on {student.student_name}&apos;s current class. Change it below if needed.
                  </p>
                )}
              </div>

              <div className="space-y-5 rounded-xl border border-slate-200 p-4">

              {/* Class times — multi-select */}
              <div>
                <label className="block text-sm font-medium text-slate-700">Class times</label>
                <p className="text-xs text-slate-500 mb-2">
                  Tap to select. Choose more than one if {student.student_name} attends multiple
                  classes a week.
                </p>
                <div className="space-y-2">
                  {[...slotsByWeekday.entries()].map(([weekday, slots]) => (
                    <div key={weekday} className="flex flex-wrap items-center gap-2">
                      <span className="w-20 shrink-0 text-sm font-medium text-slate-600">
                        {weekday}
                      </span>
                      {slots.map(slot => {
                        const selected = selectedKeys.has(slotKey(weekday, slot.start_time));
                        return (
                          <button
                            key={slot.start_time}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => toggleSlot(student.student_id, weekday, slot.start_time)}
                            className={`rounded-lg border px-3 py-2 text-sm transition ${
                              selected
                                ? 'border-sky-500 bg-sky-50 font-medium text-sky-800'
                                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            {selected && <span className="mr-1">✓</span>}
                            {formatRange(slot.start_time, slot.end_time)}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
                {entry.slots.length > 1 && (
                  <p className="mt-2 text-xs text-slate-500">
                    {entry.slots.length} classes selected — tuition is charged per class.
                  </p>
                )}
              </div>

              {/* Pickup */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Pickup</label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      update(student.student_id, { pickup_requested: false, pickup_school: null })
                    }
                    className={`rounded-lg border px-3 py-2 text-sm transition ${
                      !entry.pickup_requested
                        ? 'border-sky-500 bg-sky-50 text-sky-800 font-medium'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    No pickup needed
                  </button>
                  {(['Jackman', 'Frankland'] as const).map(school => (
                    <button
                      key={school}
                      type="button"
                      onClick={() =>
                        update(student.student_id, { pickup_requested: true, pickup_school: school })
                      }
                      className={`rounded-lg border px-3 py-2 text-sm transition ${
                        entry.pickup_requested && entry.pickup_school === school
                          ? 'border-sky-500 bg-sky-50 text-sky-800 font-medium'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {school}
                    </button>
                  ))}
                </div>
              </div>

              {/* Start date — one per selected class */}
              {entry.slots.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    First class date
                  </label>
                  <p className="text-xs text-slate-500 mb-2">
                    Set separately per class, in case they don&apos;t all start the same week.
                    Tuition is charged on the first of the month for any month with classes. If a
                    class starts partway through a month, that month is discounted — four classes
                    is a full month.
                  </p>
                  <div className="space-y-3">
                    {entry.slots.map(slot => {
                      const key = slotKey(slot.weekday, slot.start_time);
                      return (
                        <div key={key} className="rounded-lg bg-slate-50 px-3 py-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <label
                              htmlFor={`start-date-${student.student_id}-${key}`}
                              className="w-48 shrink-0 text-sm font-medium text-slate-700"
                            >
                              {slot.weekday}{' '}
                              {formatRange(slot.start_time, endTimeBySlot.get(key) ?? null)}
                            </label>
                            <input
                              id={`start-date-${student.student_id}-${key}`}
                              type="date"
                              value={slot.start_date ?? ''}
                              onChange={e =>
                                setSlotDate(
                                  student.student_id,
                                  slot.weekday,
                                  slot.start_time,
                                  e.target.value,
                                )
                              }
                              className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
                            />
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <span className="text-xs text-slate-500">
                              Course:{' '}
                              <span
                                className={
                                  slot.change_course
                                    ? 'text-slate-400 line-through'
                                    : 'font-medium text-slate-700'
                                }
                              >
                                {slot.course_name ?? 'To be assigned'}
                              </span>
                            </span>
                            <button
                              type="button"
                              aria-pressed={slot.change_course}
                              onClick={() =>
                                toggleChangeCourse(student.student_id, slot.weekday, slot.start_time)
                              }
                              className={`rounded-lg border px-2 py-1 text-xs transition ${
                                slot.change_course
                                  ? 'border-amber-400 bg-amber-50 font-medium text-amber-800'
                                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                              }`}
                            >
                              {slot.change_course ? '✓ Course change requested' : 'Change course'}
                            </button>
                          </div>
                          {slot.change_course && (
                            <p className="mt-1 text-xs text-amber-700">
                              We&apos;ll reach out, or discuss a new course at the first class.
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Notes */}
              <div>
                <label
                  htmlFor={`notes-${student.student_id}`}
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Anything else we should know? <span className="text-slate-400">(optional)</span>
                </label>
                <textarea
                  id={`notes-${student.student_id}`}
                  rows={2}
                  value={entry.notes}
                  onChange={e => update(student.student_id, { notes: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
                />
              </div>
              </div>

              {/* Decision buttons */}
              <div className="grid gap-2 sm:grid-cols-3 pt-1">
                <button
                  type="button"
                  onClick={() => update(student.student_id, { status: 'confirmed' })}
                  disabled={!hasSession}
                  title={hasSession ? undefined : 'Choose a day and time first'}
                  className={`rounded-xl px-4 py-3 text-sm font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${
                    entry.status === 'confirmed'
                      ? 'bg-emerald-600 text-white ring-2 ring-emerald-300'
                      : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 disabled:hover:bg-emerald-50'
                  }`}
                >
                  CONFIRM
                  <span className="block text-[11px] font-normal opacity-90 mt-0.5">
                    Tuition is charged on the first of the month
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => update(student.student_id, { status: 'paused' })}
                  className={`rounded-xl px-4 py-3 text-sm font-semibold shadow-sm transition ${
                    entry.status === 'paused'
                      ? 'bg-amber-500 text-white ring-2 ring-amber-300'
                      : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                  }`}
                >
                  PAUSE FOR NOW
                  <span className="block text-[11px] font-normal opacity-90 mt-0.5">
                    (you can reach out later or go through our website to re-enroll)
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => update(student.student_id, { status: 'not_returning' })}
                  className={`rounded-xl px-4 py-3 text-sm font-semibold shadow-sm transition ${
                    entry.status === 'not_returning'
                      ? 'bg-rose-600 text-white ring-2 ring-rose-300'
                      : 'bg-rose-50 text-rose-800 hover:bg-rose-100'
                  }`}
                >
                  UNENROLL
                  <span className="block text-[11px] font-normal opacity-90 mt-0.5">Not returning</span>
                </button>
              </div>

              {!hasSession && (
                <p className="text-xs text-slate-500">
                  Choose a class time above before confirming. You can still choose Pause or
                  Unenroll.
                </p>
              )}

              {entry.status === 'confirmed' && (
                <p className="text-xs text-emerald-700">
                  Confirming{' '}
                  {entry.slots
                    .map(
                      slot =>
                        `${slot.weekday} ${formatTime(slot.start_time)} from ${
                          slot.start_date || '(choose a date)'
                        }`,
                    )
                    .join(' · ')}
                  .
                </p>
              )}
            </div>
          </section>
        );
      })}

      {state?.error && (
        <div className="rounded-xl bg-rose-50 ring-1 ring-rose-200 px-4 py-3 text-sm text-rose-800">
          {state.error}
        </div>
      )}

      {!canSubmit && (
        <p className="text-sm text-slate-500">
          {unanswered.length > 0
            ? `Choose an option for ${unanswered.map(s => s.student_name).join(', ')}.`
            : `Complete the day, time, pickup, and start date for ${incomplete
                .map(s => s.student_name)
                .join(', ')}.`}
        </p>
      )}

      <button
        type="submit"
        disabled={!canSubmit || isPending}
        className="w-full rounded-xl bg-sky-600 px-4 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-sky-500 disabled:opacity-40"
      >
        {isPending ? 'Submitting…' : 'Submit fall plans'}
      </button>
    </form>
  );
}
