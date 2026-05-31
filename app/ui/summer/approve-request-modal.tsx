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

const SUBMISSION_SOURCE_STYLE: Record<string, string> = {
  parent: 'bg-emerald-100 text-emerald-700',
  staff:  'bg-amber-100 text-amber-800',
};
const SUBMISSION_SOURCE_LABEL: Record<string, string> = {
  parent: 'Parent',
  staff:  'Internal',
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

function SourceBadge({ source, name }: { source: string; name: string | null }) {
  const label = SUBMISSION_SOURCE_LABEL[source] ?? source;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${SUBMISSION_SOURCE_STYLE[source] ?? 'bg-slate-100 text-slate-500'}`}>
      {source === 'staff' && name ? `${label}: ${name}` : label}
    </span>
  );
}

function FamilyValue({ row }: { row: SummerResponseRow }) {
  const alternateEmail = row.parent_alternate_email?.trim();
  const showAlternate = alternateEmail && alternateEmail.toLowerCase() !== row.parent_email.trim().toLowerCase();

  return (
    <>
      <span>{row.parent_name}</span>
      <div className="text-xs text-slate-400 mt-0.5">{row.parent_email}</div>
      {showAlternate && (
        <div className="text-xs text-slate-400 mt-0.5">{alternateEmail}</div>
      )}
    </>
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

function formatCsvExport(row: Pick<SummerResponseRow, 'token_export_count' | 'token_last_exported_at'>): string {
  if (row.token_export_count === 0) return 'CSV not exported';
  const date = row.token_last_exported_at ? formatPortalDate(row.token_last_exported_at) : 'exported';
  return row.token_export_count > 1 ? `${date} x${row.token_export_count}` : date;
}

function formatPortalStatus(row: Pick<SummerResponseRow, 'added_to_portal_at' | 'added_to_portal_by'>): string {
  if (!row.added_to_portal_at) return 'Not marked';
  const date = formatPortalDate(row.added_to_portal_at);
  return row.added_to_portal_by ? `${date} by ${row.added_to_portal_by}` : date;
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

function formatHistoryPickup(row: SummerResponseRow['submission_history'][number]): string {
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

function formatCurrentSession(weekday: string | null, startTime: string | null): string | null {
  if (!weekday) return null;
  return `${weekday} ${formatTime(startTime)}`;
}

function formatFallChoice(row: SummerResponseRow): string {
  if (row.fall_status !== 'same') return formatFallStatus(row.fall_status);

  const currentSession = formatCurrentSession(row.current_weekday, row.current_start_time);
  return currentSession ? `${FALL_STATUS_LABEL.same} - ${currentSession}` : FALL_STATUS_LABEL.same;
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

function LabelList({ labels, emptyLabel }: { labels: string[]; emptyLabel: string }) {
  if (labels.length === 0) return <span className="text-slate-400">{emptyLabel}</span>;
  return <span>{labels.join(', ')}</span>;
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
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span>{row.student_name} · {row.parent_name}</span>
              {row.previous_submission_count > 0 && (
                <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-medium text-indigo-700 ring-1 ring-indigo-100">
                  Updated {row.previous_submission_count + 1}x
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[72vh] overflow-y-auto px-6 py-5 space-y-5">
          <dl className="grid gap-4 sm:grid-cols-2">
            <Field label="Student">{row.student_name}</Field>
            <Field label="Family">
              <FamilyValue row={row} />
            </Field>
            <Field label="Current Schedule">
              {row.current_weekday
                ? `${row.current_weekday} ${formatTime(row.current_start_time)}`
                : '—'}
            </Field>
            <Field label="Submitted">{formatDate(row.submitted_at)}</Field>
            <Field label="Status"><StatusBadge status={row.status} /></Field>
            <Field label="Submitted By"><SourceBadge source={row.submitted_by} name={row.submitted_by_name} /></Field>
            <Field label="Email CSV">{formatCsvExport(row)}</Field>
            <Field label="Added to Portal">{formatPortalStatus(row)}</Field>
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
              {row.waitlist_session_labels.length > 0 && (
                <Field label="Waitlist">
                  <span className="text-amber-700">{row.waitlist_session_labels.join(', ')}</span>
                </Field>
              )}
              {row.custom_notes && (
                <Field label="Summer Notes">
                  <span className="italic text-slate-600">{row.custom_notes}</span>
                </Field>
              )}
            </dl>
          </Section>

          <Section title="September / Fall">
            <dl className="space-y-3">
              <Field label="Plan">{formatFallChoice(row)}</Field>
              <Field label="Requested Sessions">
                <SessionChoicesList
                  choices={row.fall_session_choices}
                  fallbackLabels={row.fall_session_labels}
                  emptyLabel={row.fall_status === 'same' ? 'Keeping current session' : 'No fall sessions selected'}
                />
              </Field>
              {row.fall_waitlist_session_labels.length > 0 && (
                <Field label="Waitlist">
                  <span className="text-amber-700">{row.fall_waitlist_session_labels.join(', ')}</span>
                </Field>
              )}
              <Field label="School Pickup">{formatPickup(row)}</Field>
              {row.fall_notes && (
                <Field label="Fall Notes">
                  <span className="italic text-slate-600">{row.fall_notes}</span>
                </Field>
              )}
            </dl>
          </Section>

          {row.submission_history.length > 0 && (
            <Section title="Submission History">
              <div className="space-y-3">
                {row.submission_history.map((item, index) => (
                  <div key={item.request_id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-medium text-slate-800">
                        Previous submission {row.submission_history.length - index}
                      </div>
                      <div className="flex items-center gap-2">
                        <SourceBadge source={item.submitted_by} name={item.submitted_by_name} />
                        <StatusBadge status={item.status} />
                        <span className="text-xs text-slate-500">{formatDate(item.submitted_at)}</span>
                      </div>
                    </div>
                    <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Summer</dt>
                        <dd className="mt-1 text-slate-700">
                          {SUMMER_LABEL[item.summer_status] ?? item.summer_status}
                          {item.session_labels.length > 0 && (
                            <div className="mt-1 text-xs text-slate-500">
                              <LabelList labels={item.session_labels} emptyLabel="No sessions selected" />
                            </div>
                          )}
                          {item.waitlist_session_labels.length > 0 && (
                            <div className="mt-1 text-xs font-medium text-amber-700">
                              Waitlist: {item.waitlist_session_labels.join(', ')}
                            </div>
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Fall</dt>
                        <dd className="mt-1 text-slate-700">
                          {item.fall_status ? (FALL_STATUS_LABEL[item.fall_status] ?? item.fall_status) : 'Not provided'}
                          <div className="mt-1 text-xs text-slate-500">
                            <LabelList
                              labels={item.fall_session_labels}
                              emptyLabel={item.fall_status === 'same' ? 'Keeping current session' : 'No fall sessions selected'}
                            />
                          </div>
                          {item.fall_waitlist_session_labels.length > 0 && (
                            <div className="mt-1 text-xs font-medium text-amber-700">
                              Waitlist: {item.fall_waitlist_session_labels.join(', ')}
                            </div>
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Pickup</dt>
                        <dd className="mt-1 text-slate-700">{formatHistoryPickup(item)}</dd>
                      </div>
                      {(item.custom_notes || item.fall_notes) && (
                        <div>
                          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Notes</dt>
                          <dd className="mt-1 space-y-1 text-slate-700">
                            {item.custom_notes && <div>Summer: <span className="italic">{item.custom_notes}</span></div>}
                            {item.fall_notes && <div>Fall: <span className="italic">{item.fall_notes}</span></div>}
                          </dd>
                        </div>
                      )}
                    </dl>
                  </div>
                ))}
              </div>
            </Section>
          )}

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
