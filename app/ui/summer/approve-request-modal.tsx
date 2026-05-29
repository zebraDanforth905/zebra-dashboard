'use client';

import { useState, useTransition } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { approveSummerRequest } from '@/app/lib/summer-actions';
import { SessionChoiceSummary, SummerResponseRow } from '@/app/lib/definitions';

const FALL_STATUS_LABEL: Record<string, string> = {
  same:   'Same as current',
  change: 'Requesting change',
  pause:  'Pausing fall',
};

const REQUEST_STATUS_STYLE: Record<string, string> = {
  pending:               'bg-yellow-100 text-yellow-700',
  reviewed:              'bg-sky-100 text-sky-700',
  completed:             'bg-emerald-100 text-emerald-700',
  needs_manual_followup: 'bg-red-100 text-red-700',
  superseded:            'bg-slate-100 text-slate-500',
};

const REQUEST_STATUS_LABEL: Record<string, string> = {
  pending:               'Pending',
  reviewed:              'Reviewed',
  completed:             'Approved',
  needs_manual_followup: 'Needs Followup',
  superseded:            'Superseded',
};

const SUMMER_LABEL: Record<string, string> = {
  enrolling: 'Enrolling for summer',
  pausing:   'Not attending summer',
  no_change: 'No change — keeping current schedule',
  other:     'Custom plan',
};

const SUMMER_BADGE: Record<string, string> = {
  enrolling: 'bg-emerald-100 text-emerald-700',
  pausing:   'bg-orange-100 text-orange-700',
  no_change: 'bg-sky-100 text-sky-700',
  other:     'bg-purple-100 text-purple-700',
};

const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric' });
const FULL_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});
const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">{label}</dt>
      <dd className="text-sm text-slate-800">{children}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-slate-100 pt-4 space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      {children}
    </section>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${REQUEST_STATUS_STYLE[status] ?? 'bg-slate-100 text-slate-500'}`}>
      {REQUEST_STATUS_LABEL[status] ?? status}
    </span>
  );
}

function formatStartDate(date: string | null): string | null {
  if (!date) return null;
  return FULL_DATE_FORMATTER.format(new Date(`${date}T00:00:00`));
}

function formatShortDate(date: string | null): string | null {
  if (!date) return null;
  return SHORT_DATE_FORMATTER.format(new Date(`${date}T00:00:00`));
}

function formatDate(d: Date | string): string {
  return DATE_TIME_FORMATTER.format(new Date(d));
}

function formatPortalDate(d: Date | string | null): string {
  return d ? SHORT_DATE_FORMATTER.format(new Date(d)) : 'Not marked';
}

function formatFallStatus(status: SummerResponseRow['fall_status']): string {
  return status ? (FALL_STATUS_LABEL[status] ?? status) : 'Not provided';
}

function formatPickup(row: SummerResponseRow): string {
  if (!row.pickup_requested) return 'No pickup requested';
  if (row.pickup_school === 'other') {
    return row.pickup_school_other ? `Other school: ${row.pickup_school_other}` : 'Other school';
  }
  return row.pickup_school ?? 'Requested';
}

function formatTime(t: string | null): string {
  if (!t) return '—';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
}

function SessionChoicesList({
  choices,
  fallbackLabels,
  emptyLabel,
}: {
  choices: SessionChoiceSummary[];
  fallbackLabels: string[];
  emptyLabel: string;
}) {
  if (choices.length === 0) {
    if (fallbackLabels.length === 0) return <p className="text-sm text-slate-400">{emptyLabel}</p>;
    return (
      <ul className="space-y-1">
        {fallbackLabels.map((label, index) => (
          <li key={index} className="text-sm text-slate-700">{label}</li>
        ))}
      </ul>
    );
  }

  return (
    <ul className="space-y-2">
      {choices.map(choice => {
        const startDate = formatStartDate(choice.start_date);
        const shortStartDate = formatShortDate(choice.start_date);
        return (
          <li key={choice.session_id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-slate-100 pb-2 last:border-b-0 last:pb-0">
            <div>
              <div className="font-medium text-slate-800">{choice.weekday} {formatTime(choice.start_time)}</div>
              <div className={startDate ? 'text-xs text-slate-500' : 'text-xs font-medium text-amber-700'}>
                {startDate ? `Start date: ${startDate}` : 'Start date missing'}
              </div>
            </div>
            {shortStartDate && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                {shortStartDate}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default function ApproveRequestModal({
  row,
  onClose,
  onApproved,
}: {
  row: SummerResponseRow;
  onClose: () => void;
  onApproved: (requestId: string) => void;
}) {
  const isEnrolling = row.summer_status === 'enrolling';
  const firstRequestedStartDate = row.session_choices.find(choice => choice.start_date)?.start_date ?? '';
  const needsFallbackStartDate = isEnrolling && (
    row.session_choices.length === 0 || row.session_choices.some(choice => !choice.start_date)
  );
  const [isPending, startTransition] = useTransition();
  const [startDate, setStartDate] = useState(firstRequestedStartDate);
  const [approvalError, setApprovalError] = useState<string | null>(null);

  function handleApprove() {
    if (needsFallbackStartDate && !startDate) {
      setApprovalError('Start date is required because one or more requested sessions are missing it.');
      return;
    }
    setApprovalError(null);
    startTransition(async () => {
      const result = await approveSummerRequest(row.request_id, needsFallbackStartDate ? startDate : undefined);
      if (result?.error) {
        setApprovalError(result.error);
      } else {
        onApproved(row.request_id);
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Review Request</h2>
            <p className="mt-0.5 text-xs text-slate-500">{row.student_name} · {row.parent_name}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[72vh] overflow-y-auto px-6 py-5 space-y-5">
          <dl className="grid gap-4 sm:grid-cols-2">
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
            <Field label="Status"><StatusBadge status={row.status} /></Field>
            <Field label="Added to Portal">{formatPortalDate(row.added_to_portal_at)}</Field>
          </dl>

          <Section title="Summer">
            <dl className="space-y-3">
              <Field label="Plan">
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${SUMMER_BADGE[row.summer_status] ?? 'bg-slate-100 text-slate-500'}`}>
                  {SUMMER_LABEL[row.summer_status] ?? row.summer_status}
                </span>
              </Field>
              <Field label="Requested Sessions">
                <SessionChoicesList
                  choices={row.session_choices}
                  fallbackLabels={row.session_labels}
                  emptyLabel="No summer sessions selected"
                />
              </Field>
              {row.custom_notes && (
                <Field label="Summer Notes">
                  <span className="italic text-slate-600">{row.custom_notes}</span>
                </Field>
              )}
            </dl>
          </Section>

          <Section title="September / Fall">
            <dl className="space-y-3">
              <Field label="Plan">{formatFallStatus(row.fall_status)}</Field>
              <Field label="Requested Sessions">
                <SessionChoicesList
                  choices={row.fall_session_choices}
                  fallbackLabels={row.fall_session_labels}
                  emptyLabel={row.fall_status === 'same' ? 'Keeping current session' : 'No fall sessions selected'}
                />
              </Field>
              <Field label="School Pickup">{formatPickup(row)}</Field>
              {row.fall_notes && (
                <Field label="Fall Notes">
                  <span className="italic text-slate-600">{row.fall_notes}</span>
                </Field>
              )}
            </dl>
          </Section>

          {isEnrolling && (
            <Section title="Approval">
              {needsFallbackStartDate ? (
                <div>
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wide block mb-1">
                    Fallback Start Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-800 focus:border-sky-500 focus:ring-2 focus:ring-sky-200 focus:outline-none"
                  />
                </div>
              ) : (
                <Field label="Enrolment Start Dates">
                  Uses requested start dates listed above.
                </Field>
              )}
            </Section>
          )}

          {approvalError && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{approvalError}</p>
          )}
        </div>

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
