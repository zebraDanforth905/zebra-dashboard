'use client';

import { useActionState, useState } from 'react';
import { submitSummerForm } from '@/app/lib/summer-actions';
import StudentCard, { StudentCardState } from '@/app/ui/summer/student-card';
import { ParentFormData } from '@/app/lib/definitions';

type StudentFormEntry = {
  student_id: string;
  summer_status: 'enrolling' | 'pausing' | 'other';
  session_ids: string[];
  session_start_dates: Record<string, string>;
  custom_notes?: string;
  pickup_requested?: boolean;
  pickup_school?: 'Jackman' | 'Frankland' | 'other';
  pickup_school_other?: string;
  fall_status: 'same' | 'change' | 'pause';
  fall_session_ids: string[];
  fall_session_start_dates: Record<string, string>;
  fall_notes?: string;
};

function initState(student: ParentFormData['students'][number]): StudentCardState {
  const req = student.latest_request;
  if (req) {
    return {
      // 'no_change' removed from form; prior submissions with it start blank
      summer_status: (req.summer_status === 'no_change' ? null : req.summer_status) ?? null,
      session_ids: req.session_ids ?? [],
      session_start_dates: req.session_start_dates ?? {},
      custom_notes: '',
      pickup_requested: req.pickup_requested ?? false,
      pickup_school: req.pickup_school ?? null,
      pickup_school_other: req.pickup_school_other ?? '',
      fall_status: req.fall_status ?? null,
      fall_session_ids: req.fall_session_ids ?? [],
      fall_session_start_dates: req.fall_session_start_dates ?? {},
      fall_notes: req.fall_notes ?? '',
    };
  }
  return {
    summer_status: null,
    session_ids: [],
    session_start_dates: {},
    custom_notes: '',
    pickup_requested: false,
    pickup_school: null,
    pickup_school_other: '',
    fall_status: null,
    fall_session_ids: [],
    fall_session_start_dates: {},
    fall_notes: '',
  };
}

export default function SummerRegForm({ data, token }: { data: ParentFormData; token: string }) {
  const [actionState, formAction, isPending] = useActionState(submitSummerForm, undefined);

  const [selections, setSelections] = useState<Record<string, StudentCardState>>(
    () => Object.fromEntries(data.students.map(s => [s.student_id, initState(s)])),
  );

  const isValid = data.students.every(s => {
    const sel = selections[s.student_id];
    if (!sel.summer_status) return false;
    if (sel.summer_status === 'enrolling' && sel.session_ids.length === 0) return false;
    if (sel.summer_status === 'other' && !sel.custom_notes.trim()) return false;
    if (sel.pickup_requested) {
      if (!sel.pickup_school) return false;
      if (sel.pickup_school === 'other' && !sel.pickup_school_other.trim()) return false;
    }
    if (!sel.fall_status) return false;
    if (sel.fall_status === 'change' && sel.fall_session_ids.length === 0) return false;
    return true;
  });

  const entries: StudentFormEntry[] = data.students.map(s => {
    const sel = selections[s.student_id];
    return {
      student_id: s.student_id,
      summer_status: (sel.summer_status ?? 'other') as StudentFormEntry['summer_status'],
      session_ids: sel.session_ids,
      session_start_dates: sel.session_start_dates,
      custom_notes: sel.custom_notes || undefined,
      pickup_requested: sel.pickup_requested || undefined,
      pickup_school: sel.pickup_requested ? (sel.pickup_school ?? undefined) : undefined,
      pickup_school_other: sel.pickup_requested && sel.pickup_school === 'other' ? sel.pickup_school_other || undefined : undefined,
      fall_status: sel.fall_status as 'same' | 'change' | 'pause',
      fall_session_ids: sel.fall_session_ids,
      fall_session_start_dates: sel.fall_session_start_dates,
      fall_notes: sel.fall_notes || undefined,
    };
  });

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="token" value={token} />
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
          state={selections[student.student_id]}
          onChange={s => setSelections(prev => ({ ...prev, [student.student_id]: s }))}
        />
      ))}

      <button
        type="submit"
        disabled={isPending || !isValid}
        className="w-full rounded-lg bg-sky-600 px-4 py-3 text-white font-medium shadow-lg shadow-sky-900/20 hover:bg-sky-500 active:scale-[0.99] transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? 'Submitting…' : 'Submit Summer & Fall Schedule'}
      </button>
    </form>
  );
}
