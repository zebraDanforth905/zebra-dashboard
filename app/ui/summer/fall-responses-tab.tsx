'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { FallResponseRow } from '@/app/lib/definitions';
import {
  deleteFallResponse,
  dismissFallResponse,
  endFallEnrolment,
  enrollAllConfirmedFall,
  enrollFallStudent,
  undismissFallResponse,
} from '@/app/lib/fall-actions';

// No 'pending' option: the Needs action / Completed sections already split on status,
// and a pending-only filter would leave the Completed section permanently empty.
type FilterValue = 'all' | 'confirmed' | 'not_returning' | 'paused' | 'enrolled';

const FILTER_OPTIONS: { value: FilterValue; label: string }[] = [
  { value: 'all', label: 'All responses' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'not_returning', label: 'Pausing (unenrol)' },
  { value: 'paused', label: 'Still deciding' },
  { value: 'enrolled', label: 'Already enrolled' },
];

const STATUS_STYLE: Record<string, string> = {
  confirmed: 'bg-emerald-100 text-emerald-800',
  not_returning: 'bg-rose-100 text-rose-800',
  paused: 'bg-amber-100 text-amber-800',
};

// Parents see "Pause" for not_returning and "Still deciding" for paused; staff labels
// keep the parent wording but name the action, since not_returning is the one that ends
// an enrolment.
const STATUS_LABEL: Record<string, string> = {
  confirmed: 'Confirmed',
  not_returning: 'Pausing (unenrol)',
  paused: 'Still deciding',
};

// parent_requests.status, which tracks what staff did with the response — distinct from
// STATUS_LABEL above, which is the parent's answer.
const ROW_STATUS_LABEL: Record<string, string> = {
  pending: 'Needs action',
  reviewed: 'Dismissed',
  completed: 'Actioned',
  needs_manual_followup: 'Needs follow-up',
};

function formatTime(t: string | null): string {
  if (!t) return '—';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function formatDate(value: Date | string | null): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(`${value.slice(0, 10)}T00:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
}

// recurring_invoices.amount is stored in cents, same as the summer tab's
// formatRecurringCurrency. Formatting it raw renders $39,000.00 instead of $390.00.
function formatMoney(cents: number): string {
  return (Number(cents) / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  });
}

function applyFilter(rows: FallResponseRow[], filter: FilterValue): FallResponseRow[] {
  switch (filter) {
    case 'confirmed': return rows.filter(r => r.fall_confirmation_status === 'confirmed');
    case 'not_returning': return rows.filter(r => r.fall_confirmation_status === 'not_returning');
    case 'paused': return rows.filter(r => r.fall_confirmation_status === 'paused');
    case 'enrolled': return rows.filter(r => r.enrolment_ids.length > 0);
    default: return rows;
  }
}

export default function FallResponsesTab({ rows }: { rows: FallResponseRow[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterValue>('all');
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  // Done work is collapsed so the queue above it stays the focus.
  const [showDone, setShowDone] = useState(false);

  const normalizedSearch = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    const base = applyFilter(rows, filter);
    if (!normalizedSearch) return base;
    return base.filter(row =>
      `${row.customer_name} ${row.student_name}`.toLowerCase().includes(normalizedSearch),
    );
  }, [rows, filter, normalizedSearch]);

  // 'pending' is the only status that still wants a decision; enrolling, ending an
  // enrolment, and dismissing all move a row into the section below.
  const activeRows = useMemo(() => filtered.filter(r => r.status === 'pending'), [filtered]);
  const doneRows = useMemo(() => filtered.filter(r => r.status !== 'pending'), [filtered]);

  const counts = useMemo(
    () => ({
      total: rows.length,
      confirmed: rows.filter(r => r.fall_confirmation_status === 'confirmed').length,
      notReturning: rows.filter(r => r.fall_confirmation_status === 'not_returning').length,
      paused: rows.filter(r => r.fall_confirmation_status === 'paused').length,
      enrolled: rows.filter(r => r.enrolment_ids.length > 0).length,
      readyToEnrol: rows.filter(
        r =>
          r.fall_confirmation_status === 'confirmed' &&
          r.status === 'pending' &&
          r.enrolment_ids.length === 0 &&
          r.slots.length > 0 &&
          r.unmatched_slot_count === 0,
      ).length,
      unmatched: rows.filter(
        r => r.fall_confirmation_status === 'confirmed' && r.unmatched_slot_count > 0,
      ).length,
      multiClass: rows.filter(r => r.slots.length > 1).length,
      courseChanges: rows.filter(r => r.change_course_count > 0).length,
    }),
    [rows],
  );

  function run(id: string, fn: () => Promise<string | null>) {
    setBusyId(id);
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await fn();
        if (result) setMessage(result);
        router.refresh();
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Action failed');
      } finally {
        setBusyId(null);
      }
    });
  }

  return (
    <div className="space-y-4">
      {counts.unmatched > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
          {counts.unmatched} confirmed response{counts.unmatched === 1 ? '' : 's'} include a class time with no
          matching fall session. Enrolment is blocked for those until the session exists — a request is
          enrolled all-or-nothing, so one bad slot holds back the rest.
        </div>
      )}

      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() =>
            run('bulk', async () => {
              const res = await enrollAllConfirmedFall();
              return `Enrolled ${res.created}, skipped ${res.skipped}.${
                res.errors.length > 0 ? ` ${res.errors.slice(0, 3).join('; ')}` : ''
              }`;
            })
          }
          disabled={isPending || counts.readyToEnrol === 0}
          className="whitespace-nowrap rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-500 disabled:opacity-40"
        >
          {busyId === 'bulk' ? 'Enrolling…' : `Enrol all confirmed (${counts.readyToEnrol})`}
        </button>

        <div className="hidden h-5 shrink-0 border-l border-slate-200 sm:block" />

        <select
          value={filter}
          onChange={e => setFilter(e.target.value as FilterValue)}
          className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
        >
          {FILTER_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <input
          type="search"
          placeholder="Search family or student…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-300 sm:w-64"
        />

        <div className="hidden h-5 shrink-0 border-l border-slate-200 sm:block" />
        <label className="flex items-center gap-1.5 text-xs text-slate-500">
          Unenrol end date
          <input
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
          />
        </label>
      </div>

      {message && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700">
          {message}
        </div>
      )}

      {/* Stats */}
      <div className="flex flex-wrap gap-4 text-sm text-slate-600">
        <span><span className="font-semibold text-slate-800">{counts.total}</span> responses</span>
        <span><span className="font-semibold text-emerald-700">{counts.confirmed}</span> confirmed</span>
        <span><span className="font-semibold text-rose-700">{counts.notReturning}</span> pausing</span>
        <span><span className="font-semibold text-amber-700">{counts.paused}</span> still deciding</span>
        <span><span className="font-semibold text-sky-700">{counts.enrolled}</span> enrolled</span>
        {counts.multiClass > 0 && (
          <span><span className="font-semibold text-slate-800">{counts.multiClass}</span> multi-class</span>
        )}
        {counts.courseChanges > 0 && (
          <span><span className="font-semibold text-amber-700">{counts.courseChanges}</span> course change</span>
        )}
        <span className="ml-auto text-xs text-slate-500">{filtered.length} of {counts.total} shown</span>
      </div>

      {/* Needs action */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          No fall responses match this filter.
        </div>
      ) : (
        <>
        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-800">
            Needs action{' '}
            <span className="font-normal text-slate-500">({activeRows.length})</span>
          </h2>
          {activeRows.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
              Nothing waiting — everything here has been enrolled or dismissed.
            </div>
          ) : (
            renderTable(activeRows)
          )}
        </section>

        {doneRows.length > 0 && (
          <section>
            <button
              type="button"
              onClick={() => setShowDone(v => !v)}
              className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-800"
            >
              <span className="text-slate-400">{showDone ? '▾' : '▸'}</span>
              Completed &amp; dismissed{' '}
              <span className="font-normal text-slate-500">({doneRows.length})</span>
            </button>
            {showDone && renderTable(doneRows)}
          </section>
        )}
        </>
      )}
    </div>
  );

  // A plain function, not a nested component: called as renderTable(...) the JSX inlines
  // into this component's tree, so React doesn't see a new component type each render and
  // remount the whole table.
  function renderTable(tableRows: FallResponseRow[]) {
    return (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Response</th>
                <th className="px-4 py-3">Requested class</th>
                <th className="px-4 py-3">Currently in</th>
                <th className="px-4 py-3">Next invoice</th>
                <th className="px-4 py-3">Submitted</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tableRows.map(row => {
                const busy = busyId === row.request_id || isPending;
                const nextInvoice = row.recurring_invoices[0];
                return (
                  <tr key={row.request_id} className="align-top hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{row.student_name}</div>
                      <div className="text-xs text-slate-500">{row.customer_name}</div>
                      {row.email && <div className="text-xs text-slate-400">{row.email}</div>}
                    </td>

                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          STATUS_STYLE[row.fall_confirmation_status] ?? 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {STATUS_LABEL[row.fall_confirmation_status] ?? row.fall_confirmation_status}
                      </span>
                      <div className="mt-1 text-xs text-slate-500">
                        {ROW_STATUS_LABEL[row.status] ?? row.status}
                      </div>
                      {row.submitted_by === 'staff' && (
                        <div className="text-xs text-amber-700">
                          Staff entry{row.submitted_by_name ? ` · ${row.submitted_by_name}` : ''}
                        </div>
                      )}
                      {row.notes && (
                        <div className="mt-1 max-w-48 text-xs italic text-slate-500">“{row.notes}”</div>
                      )}
                    </td>

                    <td className="px-4 py-3 text-slate-600">
                      {row.fall_confirmation_status === 'confirmed' ? (
                        <>
                          {row.slots.map((slot, i) => (
                            <div key={i} className="mb-1">
                              <div className="flex items-center gap-1">
                                <span>{slot.weekday} {formatTime(slot.start_time)}</span>
                                {!slot.matched_session_id && (
                                  <span className="text-xs font-medium text-amber-700" title="No fall session exists at this day and time">
                                    ⚠ no session
                                  </span>
                                )}
                                {slot.matched_session_id && slot.is_full && (
                                  <span className="text-xs font-medium text-amber-700" title="Session is marked full">
                                    ⚠ full
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-500">
                                from {formatDate(slot.start_date)}
                              </div>
                              <div className="text-xs text-slate-500">
                                {slot.course_name ?? 'Course to be assigned'}
                              </div>
                              {slot.change_course && (
                                <div className="text-xs font-medium text-amber-700">
                                  ⚠ course change requested
                                </div>
                              )}
                            </div>
                          ))}
                          {row.slots.length > 1 && (
                            <div className="text-xs font-medium text-sky-700">
                              {row.slots.length} classes/week
                            </div>
                          )}
                          <div className="text-xs text-slate-500">
                            {row.pickup_requested ? `Pickup: ${row.pickup_school}` : 'No pickup'}
                          </div>

                          {/* Enrol sits with the class it acts on, like the summer tab's
                              row-level approve. */}
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {row.enrolment_ids.length > 0 ? (
                              <span
                                className="inline-flex items-center rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800"
                                title={`${row.enrolment_ids.length} enrolment(s) created`}
                              >
                                ✓ Enrolled
                              </span>
                            ) : (
                              <button
                                onClick={() =>
                                  run(row.request_id, async () => {
                                    const res = await enrollFallStudent(row.request_id);
                                    return (
                                      res.error ??
                                      `Enrolled ${row.student_name} in ${row.slots.length} class${
                                        row.slots.length === 1 ? '' : 'es'
                                      }.`
                                    );
                                  })
                                }
                                disabled={busy || row.slots.length === 0 || row.unmatched_slot_count > 0}
                                className="whitespace-nowrap rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-emerald-500 disabled:opacity-40"
                              >
                                Enrol
                              </button>
                            )}
                          </div>
                        </>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-xs text-slate-600">
                      {row.current_enrolments.length === 0 ? (
                        <span className="text-slate-400">None</span>
                      ) : (
                        <div className="space-y-1.5">
                          {row.current_enrolments.map(enrolment => (
                            <div key={enrolment.enrolment_id}>
                              <div>
                                {enrolment.weekday} {formatTime(enrolment.start_time)}
                                {enrolment.course_name ? ` · ${enrolment.course_name}` : ''}
                              </div>
                              {enrolment.end_date ? (
                                <div className="text-slate-400">Ends {formatDate(enrolment.end_date)}</div>
                              ) : null}
                              <button
                                onClick={() =>
                                  run(row.request_id, async () => {
                                    const res = await endFallEnrolment(enrolment.enrolment_id, endDate);
                                    return (
                                      res.error ??
                                      `Ended ${row.student_name}'s ${enrolment.weekday} ${formatTime(
                                        enrolment.start_time,
                                      )} class on ${endDate}.`
                                    );
                                  })
                                }
                                disabled={busy}
                                title={`End this enrolment on ${endDate} (set the date in the toolbar)`}
                                className="mt-0.5 whitespace-nowrap rounded-lg border border-rose-200 bg-white px-2 py-1 text-xs text-rose-700 transition hover:bg-rose-50 disabled:opacity-40"
                              >
                                Unenrol
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-3 text-xs text-slate-600">
                      {nextInvoice ? (
                        <>
                          {/* Resolves the invoice to its customer's billing edit page. */}
                          <Link
                            href={`/dashboard/billing/recurring_invoices/${nextInvoice.id}`}
                            target="_blank"
                            className="font-medium text-sky-700 underline decoration-sky-300 underline-offset-2 hover:text-sky-900"
                            title={nextInvoice.description ?? 'Open this recurring invoice'}
                          >
                            {formatMoney(nextInvoice.amount)}
                          </Link>
                          <div className="text-slate-500">{formatDate(nextInvoice.next_date)}</div>
                          <div className="text-slate-400">Every {nextInvoice.every} mo</div>
                          {row.recurring_invoices.length > 1 && (
                            <div className="text-slate-400">
                              +{row.recurring_invoices.length - 1} more
                            </div>
                          )}
                        </>
                      ) : (
                        <span className="text-slate-400">None</span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-xs text-slate-500">{formatDate(row.submitted_at)}</td>

                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1.5">
                        {/* Only a row still awaiting a decision can be dismissed — an
                            already-dismissed row offers Un-dismiss instead. */}
                        {row.status === 'pending' && (
                          <button
                            onClick={() =>
                              run(row.request_id, async () => {
                                await dismissFallResponse(row.request_id);
                                return `Dismissed ${row.student_name}.`;
                              })
                            }
                            disabled={busy}
                            title="Move to Completed & dismissed without changing any enrolment"
                            className="whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
                          >
                            Dismiss
                          </button>
                        )}

                        {row.status === 'reviewed' && (
                          <button
                            onClick={() =>
                              run(row.request_id, async () => {
                                await undismissFallResponse(row.request_id);
                                return `Moved ${row.student_name} back to Needs action.`;
                              })
                            }
                            disabled={busy}
                            title="Move back to Needs action"
                            className="whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
                          >
                            Un-dismiss
                          </button>
                        )}

                        <Link
                          href={`/fall-confirm?token=${row.token}&staff=1`}
                          target="_blank"
                          className="whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-center text-xs text-slate-600 transition hover:bg-slate-50"
                        >
                          Staff entry
                        </Link>

                        <button
                          onClick={() =>
                            run(row.request_id, async () => {
                              await deleteFallResponse(row.request_id);
                              return `Removed response for ${row.student_name}.`;
                            })
                          }
                          disabled={busy}
                          className="whitespace-nowrap text-xs text-slate-400 underline transition hover:text-rose-600 disabled:opacity-40"
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
    );
  }
}
