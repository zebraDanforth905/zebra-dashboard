'use client';

import { useState, useTransition } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { approveSummerRequest } from '@/app/lib/summer-actions';
import { SummerResponseRow } from '@/app/lib/definitions';

const FALL_STATUS_LABEL: Record<string, string> = {
  same:   'Same as current',
  change: 'Requesting change',
  pause:  'Pausing fall',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">{label}</dt>
      <dd className="text-sm text-slate-800">{children}</dd>
    </div>
  );
}

export default function ApproveRequestModal({
  row,
  onClose,
  onApproved,
}: {
  row: SummerResponseRow;
  onClose: () => void;
  onApproved: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [startDate, setStartDate] = useState('');
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const isEnrolling = row.summer_status === 'enrolling';

  const SUMMER_LABEL: Record<string, string> = {
    enrolling: 'Enrolling for summer',
    pausing:   'Pausing for summer',
    no_change: 'No change — keeping current schedule',
    other:     'Other / needs followup',
  };

  function handleApprove() {
    if (isEnrolling && !startDate) {
      setApprovalError('Start date is required for enrolling requests.');
      return;
    }
    setApprovalError(null);
    startTransition(async () => {
      const result = await approveSummerRequest(row.request_id, isEnrolling ? startDate : undefined);
      if (result?.error) {
        setApprovalError(result.error);
      } else {
        onApproved();
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">Review Request</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <dl className="grid grid-cols-2 gap-4">
            <Field label="Student">{row.student_name}</Field>
            <Field label="Family">
              <span>{row.parent_name}</span>
              <div className="text-xs text-slate-400 mt-0.5">{row.parent_email}</div>
            </Field>

            <Field label="Current Schedule">
              {row.current_weekday
                ? `${row.current_weekday} ${formatTime(row.current_start_time)}`
                : '—'}
            </Field>
            <Field label="Submitted">{formatDate(row.submitted_at)}</Field>
          </dl>

          <hr className="border-slate-100" />

          <dl className="space-y-3">
            <Field label="Summer Plan">
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${SUMMER_BADGE[row.summer_status] ?? 'bg-slate-100 text-slate-500'}`}>
                {SUMMER_LABEL[row.summer_status] ?? row.summer_status}
              </span>
            </Field>

            {row.session_labels.length > 0 && (
              <Field label="Sessions Requested">
                <ul className="space-y-0.5">
                  {row.session_labels.map((l, i) => <li key={i}>{l}</li>)}
                </ul>
              </Field>
            )}

            {row.fall_status && (
              <Field label="Fall Plan">
                {FALL_STATUS_LABEL[row.fall_status] ?? row.fall_status}
              </Field>
            )}

            {row.fall_session_labels.length > 0 && (
              <Field label="Fall Sessions">
                <ul className="space-y-0.5">
                  {row.fall_session_labels.map((l, i) => <li key={i}>{l}</li>)}
                </ul>
              </Field>
            )}

            {row.custom_notes && (
              <Field label="Notes">
                <span className="italic text-slate-600">{row.custom_notes}</span>
              </Field>
            )}

            {isEnrolling && (
              <div>
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wide block mb-1">
                  Enrolment Start Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-800 focus:border-sky-500 focus:ring-2 focus:ring-sky-200 focus:outline-none"
                />
              </div>
            )}

            {approvalError && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{approvalError}</p>
            )}
          </dl>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleApprove}
            disabled={isPending || row.status === 'completed'}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 transition disabled:opacity-50"
          >
            {isPending ? 'Approving…' : row.status === 'completed' ? 'Already Approved' : 'Approve Request'}
          </button>
        </div>
      </div>
    </div>
  );
}

const SUMMER_BADGE: Record<string, string> = {
  enrolling: 'bg-emerald-100 text-emerald-700',
  pausing:   'bg-orange-100 text-orange-700',
  no_change: 'bg-sky-100 text-sky-700',
  other:     'bg-purple-100 text-purple-700',
};

function formatTime(t: string | null): string {
  if (!t) return '—';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
}

function formatDate(d: Date): string {
  return new Date(d).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
}
