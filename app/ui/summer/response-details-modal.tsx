'use client';

import { SummerResponseRow } from '@/app/lib/definitions';

const SUMMER_LABEL: Record<string, string> = {
  enrolling: 'Enrolling in summer sessions',
  pausing:   'Pausing for summer',
  no_change: 'No change — keeping current schedule',
  other:     'Custom request',
};

const FALL_LABEL: Record<string, string> = {
  same:   'Keep current slot',
  change: 'Requesting a different time',
  pause:  'Pausing fall / not sure yet',
};

function formatTime(t: string | null): string {
  if (!t) return '—';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
}

function formatDateTime(d: Date): string {
  return new Date(d).toLocaleString('en-CA', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

export default function ResponseDetailsModal({
  row,
  onClose,
}: {
  row: SummerResponseRow;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-xl p-6 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{row.student_name}</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {row.parent_name} · {row.parent_email}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              Submitted {formatDateTime(row.submitted_at)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Current schedule */}
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Current Schedule</p>
          <p className="text-sm text-slate-700 mt-1">
            {row.current_weekday
              ? `${row.current_weekday} ${formatTime(row.current_start_time)}`
              : <span className="text-slate-400">No active enrolment</span>}
          </p>
        </div>

        {/* Summer block */}
        <div className="rounded-lg bg-sky-50 px-3 py-2 space-y-1">
          <p className="text-xs font-semibold text-sky-700 uppercase tracking-wide">Summer</p>
          <p className="text-sm text-slate-700 font-medium">
            {SUMMER_LABEL[row.summer_status] ?? row.summer_status}
          </p>
          {row.session_labels.length > 0 && (
            <div className="text-xs text-slate-600">
              <span className="text-slate-400">Sessions: </span>
              <ul className="inline-block">
                {row.session_labels.map((l, i) => (
                  <li key={i} className="inline">
                    {l}{i < row.session_labels.length - 1 ? ', ' : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {row.pickup_requested && (
            <p className="text-xs text-slate-600">
              <span className="text-slate-400">School pickup: </span>
              {row.pickup_school === 'other'
                ? (row.pickup_school_other ?? 'Other school')
                : (row.pickup_school ?? 'Requested')}
            </p>
          )}
          {row.custom_notes && (
            <p className="text-xs text-slate-600">
              <span className="text-slate-400">Note: </span>
              <span className="italic">{row.custom_notes}</span>
            </p>
          )}
        </div>

        {/* Fall block */}
        <div className="rounded-lg bg-emerald-50 px-3 py-2 space-y-1">
          <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">September (Fall)</p>
          <p className="text-sm text-slate-700 font-medium">
            {row.fall_status ? (FALL_LABEL[row.fall_status] ?? row.fall_status) : '—'}
          </p>
          {row.fall_session_labels.length > 0 && (
            <p className="text-xs text-slate-600">
              <span className="text-slate-400">Requested times: </span>
              {row.fall_session_labels.join(', ')}
            </p>
          )}
        </div>

        <div className="flex justify-end pt-1">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
