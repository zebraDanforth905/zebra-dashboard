'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { SummerResponseRow, SummerStats } from '@/app/lib/definitions';
import { approveAllEnrolling, resetSummerRequest } from '@/app/lib/summer-actions';
import ApproveRequestModal from './approve-request-modal';

function formatTime(t: string | null): string {
  if (!t) return '—';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
}

function formatDate(d: Date): string {
  return new Date(d).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
}

const SUMMER_STATUS_STYLE: Record<string, string> = {
  enrolling: 'bg-emerald-100 text-emerald-700',
  pausing:   'bg-orange-100 text-orange-700',
  no_change: 'bg-sky-100 text-sky-700',
  other:     'bg-purple-100 text-purple-700',
};
const SUMMER_STATUS_LABEL: Record<string, string> = {
  enrolling: 'Enrolling',
  pausing:   'Pausing',
  no_change: 'No Change',
  other:     'Other',
};

const REQUEST_STATUS_STYLE: Record<string, string> = {
  pending:               'bg-yellow-100 text-yellow-700',
  reviewed:              'bg-sky-100 text-sky-700',
  completed:             'bg-emerald-100 text-emerald-700',
  needs_manual_followup: 'bg-red-100 text-red-700',
};
const REQUEST_STATUS_LABEL: Record<string, string> = {
  pending:               'Pending',
  reviewed:              'Reviewed',
  completed:             'Approved',
  needs_manual_followup: 'Needs Followup',
};

function SummerBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${SUMMER_STATUS_STYLE[status] ?? 'bg-slate-100 text-slate-500'}`}>
      {SUMMER_STATUS_LABEL[status] ?? status}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${REQUEST_STATUS_STYLE[status] ?? 'bg-slate-100 text-slate-500'}`}>
      {REQUEST_STATUS_LABEL[status] ?? status}
    </span>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className={`text-2xl font-bold ${color ?? 'text-slate-800'}`}>{value}</div>
      <div className="text-xs text-slate-500 mt-0.5">{label}</div>
    </div>
  );
}

function FilterSelect({ value, onChange, options }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="h-8 rounded-lg border border-slate-200 px-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-300"
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function ApproveAllButton({ onDone }: { onDone: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function handleClick() {
    setMessage(null);
    startTransition(async () => {
      const { updated } = await approveAllEnrolling();
      setMessage(updated === 0 ? 'No pending enrolling requests.' : `Approved ${updated} request${updated !== 1 ? 's' : ''}.`);
      if (updated > 0) onDone();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleClick}
        disabled={isPending}
        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 transition disabled:opacity-50"
      >
        {isPending ? 'Approving…' : 'Approve All Enrolling'}
      </button>
      {message && <span className="text-xs text-slate-500">{message}</span>}
    </div>
  );
}

function ResetButton({ requestId, onDone }: { requestId: string; onDone: () => void }) {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      disabled={isPending}
      onClick={() => startTransition(async () => { await resetSummerRequest(requestId); onDone(); })}
      className="text-xs text-slate-400 hover:text-slate-600 underline disabled:opacity-50"
    >
      {isPending ? '…' : 'Undo'}
    </button>
  );
}

export default function ResponsesTab({ rows, stats }: { rows: SummerResponseRow[]; stats: SummerStats }) {
  const router = useRouter();
  const [summerFilter, setSummerFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [modalRow, setModalRow] = useState<SummerResponseRow | null>(null);

  function refresh() { router.refresh(); }

  const filtered = rows.filter(r => {
    if (summerFilter !== 'all' && r.summer_status !== summerFilter) return false;
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!r.student_name.toLowerCase().includes(q) && !r.parent_name.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const notResponded = stats.total_families - stats.responded;

  return (
    <div className="space-y-4">
      {/* Stats row 1 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total Families"  value={stats.total_families} />
        <StatCard label="Responded"       value={stats.responded}   color="text-emerald-700" />
        <StatCard label="Not Responded"   value={notResponded}      color={notResponded > 0 ? 'text-amber-600' : 'text-slate-800'} />
        <StatCard label="Emailed"         value={stats.emailed} />
      </div>

      {/* Stats row 2 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Enrolling"       value={stats.enrolling}      color="text-emerald-700" />
        <StatCard label="Pausing"         value={stats.pausing}        color="text-orange-600" />
        <StatCard label="No Change"       value={stats.no_change}      color="text-sky-700" />
        <StatCard label="Needs Followup"  value={stats.needs_followup} color={stats.needs_followup > 0 ? 'text-red-600' : 'text-slate-800'} />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center">
        <ApproveAllButton onDone={refresh} />
        <div className="h-5 border-l border-slate-200 hidden sm:block" />
        <input
          type="search"
          placeholder="Search by name…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="h-8 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-300"
        />
        <FilterSelect
          value={summerFilter}
          onChange={setSummerFilter}
          options={[
            { value: 'all',       label: 'All intentions' },
            { value: 'enrolling', label: 'Enrolling' },
            { value: 'pausing',   label: 'Pausing' },
            { value: 'no_change', label: 'No Change' },
            { value: 'other',     label: 'Other' },
          ]}
        />
        <FilterSelect
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: 'all',                   label: 'All statuses' },
            { value: 'pending',               label: 'Pending' },
            { value: 'reviewed',              label: 'Reviewed' },
            { value: 'completed',             label: 'Approved' },
            { value: 'needs_manual_followup', label: 'Needs Followup' },
          ]}
        />
        {(summerFilter !== 'all' || statusFilter !== 'all' || search) && (
          <button
            onClick={() => { setSummerFilter('all'); setStatusFilter('all'); setSearch(''); }}
            className="text-xs text-slate-500 underline"
          >
            Clear
          </button>
        )}
        <span className="ml-auto text-xs text-slate-500">
          {filtered.length} of {rows.length} responses
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-500 text-sm">
          No responses yet. Families will appear here once they submit their form.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Family</th>
                <th className="px-4 py-3">Current</th>
                <th className="px-4 py-3">Summer</th>
                <th className="px-4 py-3">Sessions</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Notes</th>
                <th className="px-4 py-3">Submitted</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-400 text-sm">
                    No matching responses.
                  </td>
                </tr>
              ) : filtered.map(row => (
                <tr key={row.request_id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
                    {row.student_name}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="text-slate-700">{row.parent_name}</div>
                    <div className="text-xs text-slate-400">{row.parent_email}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                    {row.current_weekday
                      ? `${row.current_weekday} ${formatTime(row.current_start_time)}`
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <SummerBadge status={row.summer_status} />
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-xs">
                    {row.session_labels.length > 0
                      ? row.session_labels.map((l, i) => <div key={i}>{l}</div>)
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs max-w-[160px] truncate">
                    {row.custom_notes || '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                    {formatDate(row.submitted_at)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      {row.status !== 'completed' && (
                        <button
                          onClick={() => setModalRow(row)}
                          className="text-xs px-2 py-1 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition"
                        >
                          Review
                        </button>
                      )}
                      {row.status === 'completed' && (
                        <>
                          <span className="text-xs text-emerald-600 font-medium">✓ Approved</span>
                          <ResetButton requestId={row.request_id} onDone={refresh} />
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalRow && (
        <ApproveRequestModal
          row={modalRow}
          onClose={() => setModalRow(null)}
          onApproved={() => { setModalRow(null); refresh(); }}
        />
      )}
    </div>
  );
}
