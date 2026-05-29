'use client';

import { useMemo, useState, useTransition } from 'react';
import { SessionChoiceSummary, SummerResponseRow, SummerStats } from '@/app/lib/definitions';
import {
  approveAllEnrolling,
  deleteSummerResponse,
  markAllNoChangeComplete,
  markAddedToPortal,
  clearAddedToPortal,
  markNeedsFollowup,
  clearFollowup,
} from '@/app/lib/summer-actions';
import ApproveRequestModal from './approve-request-modal';

type ResponsePatch = Partial<Pick<SummerResponseRow, 'status' | 'added_to_portal_at'>>;

function formatTime(t: string | null): string {
  if (!t) return '—';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
}

const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric' });

function formatDate(d: Date): string {
  return SHORT_DATE_FORMATTER.format(new Date(d));
}

function formatStartDate(date: string | null): string | null {
  if (!date) return null;
  return SHORT_DATE_FORMATTER.format(new Date(`${date}T00:00:00`));
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

const FALL_STATUS_LABEL: Record<string, string> = {
  same:   'Keep current',
  change: 'Requesting change',
  pause:  'Pausing fall',
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

function deriveStats(baseStats: SummerStats, rows: SummerResponseRow[]): SummerStats {
  const respondedFamilies = new Set(rows.map(row => `${row.parent_email}:${row.parent_name}`));
  return {
    ...baseStats,
    responded: respondedFamilies.size,
    enrolling: rows.filter(row => row.summer_status === 'enrolling').length,
    pausing: rows.filter(row => row.summer_status === 'pausing').length,
    no_change: rows.filter(row => row.summer_status === 'no_change').length,
    pending: rows.filter(row => row.status === 'pending').length,
    needs_followup: rows.filter(row => row.status === 'needs_manual_followup').length,
  };
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

function ApproveAllModal({ enrollingCount, onClose, onDone }: {
  enrollingCount: number;
  onClose: () => void;
  onDone: (msg: string, completedIds: string[]) => void;
}) {
  const [startDate, setStartDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    if (!startDate) { setError('Start date is required.'); return; }
    setError(null);
    startTransition(async () => {
      const { created, skipped, completedIds } = await approveAllEnrolling(startDate);
      onDone(
        skipped > 0
          ? `Approved ${created}, skipped ${skipped} (no course to inherit).`
          : `Approved ${created} enrolment${created !== 1 ? 's' : ''}.`,
        completedIds,
      );
      onClose();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl p-6 space-y-4">
        <h2 className="text-base font-semibold text-slate-900">Approve All Enrolling</h2>
        <p className="text-sm text-slate-600">
          This will create enrolments for <span className="font-semibold text-emerald-700">{enrollingCount}</span> pending enrolling student{enrollingCount !== 1 ? 's' : ''}.
        </p>
        <div>
          <label className="text-xs font-medium text-slate-500 uppercase tracking-wide block mb-1">
            Start Date <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-800 focus:border-sky-500 focus:ring-2 focus:ring-sky-200 focus:outline-none"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-3 pt-1">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isPending}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 transition disabled:opacity-50"
          >
            {isPending ? 'Approving…' : 'Confirm & Approve'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteResponseButton({ requestId, onDeleted }: { requestId: string; onDeleted: (id: string) => void }) {
  const [confirm, setConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (!confirm) {
    return (
      <button
        onClick={() => setConfirm(true)}
        title="Delete this response from active response views"
        className="text-xs px-2 py-1 rounded border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 transition"
      >
        Delete Response
      </button>
    );
  }
  return (
    <span className="flex flex-col gap-1">
      <span className="text-[10px] text-red-700 leading-tight">
        Hide this response? Created enrolments from approval will be removed.
      </span>
      <span className="flex items-center gap-2">
        <button
          disabled={isPending}
          onClick={() => startTransition(async () => {
            const result = await deleteSummerResponse(requestId);
            if (result.deleted) onDeleted(requestId);
          })}
          className="text-xs text-red-600 font-medium disabled:opacity-50"
        >
          {isPending ? '…' : 'Confirm Delete'}
        </button>
        <button onClick={() => setConfirm(false)} className="text-xs text-slate-400">Cancel</button>
      </span>
    </span>
  );
}

function NotesCell({ summerNotes, fallNotes }: { summerNotes: string | null; fallNotes: string | null }) {
  if (!summerNotes && !fallNotes) return <span className="text-slate-400">—</span>;
  return (
    <div className="space-y-1">
      {summerNotes && (
        <div>
          <span className="font-medium text-slate-500">Summer: </span>
          <span className="italic">{summerNotes}</span>
        </div>
      )}
      {fallNotes && (
        <div>
          <span className="font-medium text-slate-500">Fall: </span>
          <span className="italic">{fallNotes}</span>
        </div>
      )}
    </div>
  );
}

function SessionChoicesCell({
  choices,
  fallbackLabels,
}: {
  choices: SessionChoiceSummary[];
  fallbackLabels: string[];
}) {
  if (choices.length === 0) {
    if (fallbackLabels.length === 0) return <span className="text-slate-400">—</span>;
    return (
      <div className="space-y-1">
        {fallbackLabels.map((label, index) => <div key={index}>{label}</div>)}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {choices.map(choice => {
        const startDate = formatStartDate(choice.start_date);
        return (
          <div key={choice.session_id} className="leading-tight">
            <div className="font-medium text-slate-700">
              {choice.weekday} {formatTime(choice.start_time)}
            </div>
            {startDate ? (
              <div className="mt-0.5 text-[11px] text-slate-500">
                Start: <span className="font-medium text-slate-700">{startDate}</span>
              </div>
            ) : (
              <div className="mt-0.5 text-[11px] font-medium text-amber-700">
                Start date missing
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AddedToPortalButton({
  requestId,
  addedAt,
  onChanged,
}: {
  requestId: string;
  addedAt: Date | null;
  onChanged: (requestId: string, addedAt: Date | null) => void;
}) {
  const [isPending, startTransition] = useTransition();
  if (addedAt) {
    return (
      <button
        disabled={isPending}
        onClick={() => startTransition(async () => {
          await clearAddedToPortal(requestId);
          onChanged(requestId, null);
        })}
        title={`Added to portal ${formatDate(addedAt)} — click to undo`}
        className="text-xs px-2 py-1 rounded border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 transition disabled:opacity-50"
      >
        {isPending ? '…' : `✓ In Portal (${formatDate(addedAt)})`}
      </button>
    );
  }
  return (
    <button
      disabled={isPending}
      onClick={() => startTransition(async () => {
        await markAddedToPortal(requestId);
        onChanged(requestId, new Date());
      })}
      className="text-xs px-2 py-1 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition disabled:opacity-50"
    >
      {isPending ? '…' : 'Added to Portal'}
    </button>
  );
}

function FollowupToggleButton({
  requestId,
  status,
  onChanged,
}: {
  requestId: string;
  status: string;
  onChanged: (requestId: string, status: SummerResponseRow['status']) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const isFollowup = status === 'needs_manual_followup';
  return (
    <button
      disabled={isPending}
      onClick={() => startTransition(async () => {
        if (isFollowup) {
          await clearFollowup(requestId);
          onChanged(requestId, 'pending');
        } else {
          await markNeedsFollowup(requestId);
          onChanged(requestId, 'needs_manual_followup');
        }
      })}
      title={isFollowup ? 'Clear followup flag (reset to pending)' : 'Flag this response as needing manual followup'}
      className={
        isFollowup
          ? 'text-xs px-2 py-1 rounded border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 transition disabled:opacity-50'
          : 'text-xs px-2 py-1 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition disabled:opacity-50'
      }
    >
      {isPending ? '…' : (isFollowup ? 'Clear Followup' : 'Mark Followup')}
    </button>
  );
}

function NoChangeCompleteButton({ onDone }: { onDone: (msg: string, updatedIds: string[]) => void }) {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      onClick={() => startTransition(async () => {
        const { updated, updatedIds } = await markAllNoChangeComplete();
        onDone(
          updated === 0 ? 'No pending no-change requests.' : `Marked ${updated} no-change as complete.`,
          updatedIds,
        );
      })}
      disabled={isPending}
      className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500 transition disabled:opacity-50"
    >
      {isPending ? 'Updating…' : 'Complete All No Change'}
    </button>
  );
}

export default function ResponsesTab({ rows, stats }: { rows: SummerResponseRow[]; stats: SummerStats }) {
  const [rowPatches, setRowPatches] = useState<Record<string, ResponsePatch>>({});
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [workflowFilter, setWorkflowFilter] = useState('needs_action');
  const [summerFilter, setSummerFilter] = useState('all');
  const [fallFilter, setFallFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [modalRow, setModalRow] = useState<SummerResponseRow | null>(null);
  const [showApproveAllModal, setShowApproveAllModal] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);

  const currentRows = useMemo(
    () => rows
      .filter(row => !removedIds.has(row.request_id))
      .map(row => ({ ...row, ...(rowPatches[row.request_id] ?? {}) })),
    [removedIds, rowPatches, rows],
  );
  const hasLocalChanges = removedIds.size > 0 || Object.keys(rowPatches).length > 0;
  const currentStats = useMemo(
    () => (hasLocalChanges ? deriveStats(stats, currentRows) : stats),
    [currentRows, hasLocalChanges, stats],
  );

  function patchResponse(requestId: string, patch: ResponsePatch) {
    setRowPatches(prev => ({
      ...prev,
      [requestId]: { ...(prev[requestId] ?? {}), ...patch },
    }));
    setModalRow(prevRow => (
      prevRow?.request_id === requestId ? { ...prevRow, ...patch } : prevRow
    ));
  }

  function patchResponses(requestIds: string[], patch: ResponsePatch) {
    const ids = new Set(requestIds);
    if (ids.size === 0) return;
    setRowPatches(prev => {
      const next = { ...prev };
      for (const id of ids) {
        next[id] = { ...(next[id] ?? {}), ...patch };
      }
      return next;
    });
    setModalRow(prevRow => (
      prevRow && ids.has(prevRow.request_id) ? { ...prevRow, ...patch } : prevRow
    ));
  }

  function removeResponse(requestId: string) {
    setRemovedIds(prev => new Set(prev).add(requestId));
    setRowPatches(prev => {
      const next = { ...prev };
      delete next[requestId];
      return next;
    });
    setModalRow(prevRow => (prevRow?.request_id === requestId ? null : prevRow));
  }

  const normalizedSearch = search.trim().toLowerCase();
  const filtered = useMemo(() => currentRows.filter(r => {
    if (workflowFilter === 'needs_action' && r.added_to_portal_at) return false;
    if (workflowFilter === 'added_to_portal' && !r.added_to_portal_at) return false;
    if (summerFilter !== 'all' && r.summer_status !== summerFilter) return false;
    if (fallFilter !== 'all' && r.fall_status !== fallFilter) return false;
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (normalizedSearch) {
      const searchableText = [
        r.student_name,
        r.parent_name,
        r.parent_email,
        r.custom_notes,
        r.fall_notes,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!searchableText.includes(normalizedSearch)) return false;
    }
    return true;
  }), [currentRows, fallFilter, normalizedSearch, statusFilter, summerFilter, workflowFilter]);

  const notResponded = currentStats.total_families - currentStats.responded;
  const pendingEnrollingCount = useMemo(() => currentRows.filter(
    r => r.summer_status === 'enrolling' && r.status === 'pending',
  ).length, [currentRows]);

  return (
    <div className="space-y-4">
      {/* Stats row 1 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total Families"  value={currentStats.total_families} />
        <StatCard label="Responded"       value={currentStats.responded}   color="text-emerald-700" />
        <StatCard label="Not Responded"   value={notResponded}      color={notResponded > 0 ? 'text-amber-600' : 'text-slate-800'} />
        <StatCard label="Exported"        value={currentStats.exported} />
      </div>

      {/* Stats row 2 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Enrolling"       value={currentStats.enrolling}      color="text-emerald-700" />
        <StatCard label="Pausing"         value={currentStats.pausing}        color="text-orange-600" />
        <StatCard label="No Change"       value={currentStats.no_change}      color="text-sky-700" />
        <StatCard label="Needs Followup"  value={currentStats.needs_followup} color={currentStats.needs_followup > 0 ? 'text-red-600' : 'text-slate-800'} />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center">
        <button
          onClick={() => { setBulkMessage(null); setShowApproveAllModal(true); }}
          disabled={pendingEnrollingCount === 0}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 transition disabled:opacity-40"
        >
          Approve All Enrolling ({pendingEnrollingCount})
        </button>
        <NoChangeCompleteButton
          onDone={(msg, updatedIds) => {
            setBulkMessage(msg);
            patchResponses(updatedIds, { status: 'completed' });
          }}
        />
        {bulkMessage && <span className="text-xs text-slate-500">{bulkMessage}</span>}
        <div className="h-5 border-l border-slate-200 hidden sm:block" />
        <input
          type="search"
          placeholder="Search by name…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="h-8 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-300"
        />
        <FilterSelect
          value={workflowFilter}
          onChange={setWorkflowFilter}
          options={[
            { value: 'needs_action',    label: 'Needs action' },
            { value: 'all',             label: 'All responses' },
            { value: 'added_to_portal', label: 'Added to portal' },
          ]}
        />
        <FilterSelect
          value={summerFilter}
          onChange={setSummerFilter}
          options={[
            { value: 'all',       label: 'All summer plans' },
            { value: 'enrolling', label: 'Enrolling' },
            { value: 'pausing',   label: 'Pausing' },
            { value: 'other',     label: 'Other' },
          ]}
        />
        <FilterSelect
          value={fallFilter}
          onChange={setFallFilter}
          options={[
            { value: 'all',    label: 'All fall plans' },
            { value: 'same',   label: 'Keep current' },
            { value: 'change', label: 'Requesting change' },
            { value: 'pause',  label: 'Pausing fall' },
          ]}
        />
        <FilterSelect
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: 'all',                   label: 'All statuses' },
            { value: 'pending',               label: 'Pending' },
            { value: 'completed',             label: 'Approved' },
            { value: 'needs_manual_followup', label: 'Needs Followup' },
          ]}
        />
        {(workflowFilter !== 'needs_action' || summerFilter !== 'all' || fallFilter !== 'all' || statusFilter !== 'all' || search) && (
          <button
            onClick={() => { setWorkflowFilter('needs_action'); setSummerFilter('all'); setFallFilter('all'); setStatusFilter('all'); setSearch(''); }}
            className="text-xs text-slate-500 underline"
          >
            Clear
          </button>
        )}
        <span className="ml-auto text-xs text-slate-500">
          {filtered.length} of {currentRows.length} responses
        </span>
      </div>

      {currentRows.length === 0 ? (
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
                <th className="px-4 py-3">Summer Sessions</th>
                <th className="px-4 py-3">Pickup</th>
                <th className="px-4 py-3">Fall Plan</th>
                <th className="px-4 py-3">Fall Sessions</th>
                <th className="px-4 py-3">Notes</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Submitted</th>
                <th className="px-4 py-3">Added to Portal</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-4 py-8 text-center text-slate-400 text-sm">
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
                    <SessionChoicesCell choices={row.session_choices} fallbackLabels={row.session_labels} />
                  </td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap">
                    {row.pickup_requested ? (
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 font-medium bg-amber-100 text-amber-700">
                        {row.pickup_school === 'other'
                          ? (row.pickup_school_other ?? 'Other')
                          : (row.pickup_school ?? 'Yes')}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-xs whitespace-nowrap">
                    {row.fall_status ? (FALL_STATUS_LABEL[row.fall_status] ?? row.fall_status) : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-xs">
                    <SessionChoicesCell choices={row.fall_session_choices} fallbackLabels={row.fall_session_labels} />
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs max-w-[180px]">
                    <NotesCell summerNotes={row.custom_notes} fallNotes={row.fall_notes} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                    {formatDate(row.submitted_at)}
                  </td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap">
                    {row.added_to_portal_at
                      ? <span className="text-emerald-700 font-medium">{formatDate(row.added_to_portal_at)}</span>
                      : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => setModalRow(row)}
                        className="text-xs px-2 py-1 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition"
                      >
                        {row.status === 'completed' ? 'Approve Again' : 'Review'}
                      </button>
                      <AddedToPortalButton
                        requestId={row.request_id}
                        addedAt={row.added_to_portal_at}
                        onChanged={(id, addedAt) => patchResponse(id, { added_to_portal_at: addedAt })}
                      />
                      <FollowupToggleButton
                        requestId={row.request_id}
                        status={row.status}
                        onChanged={(id, status) => patchResponse(id, { status })}
                      />
                      <DeleteResponseButton
                        requestId={row.request_id}
                        onDeleted={removeResponse}
                      />
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
          onApproved={requestId => {
            patchResponse(requestId, { status: 'completed' });
            setModalRow(null);
          }}
        />
      )}

      {showApproveAllModal && (
        <ApproveAllModal
          enrollingCount={pendingEnrollingCount}
          onClose={() => setShowApproveAllModal(false)}
          onDone={(msg, completedIds) => {
            setBulkMessage(msg);
            patchResponses(completedIds, { status: 'completed' });
          }}
        />
      )}
    </div>
  );
}
