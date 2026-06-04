'use client';

import { Fragment, useMemo, useState, useTransition } from 'react';
import { SessionChoiceSummary, SummerResponseRow, SummerStats } from '@/app/lib/definitions';
import {
  deleteSummerResponse,
  markAddedToPortal,
  clearAddedToPortal,
  markNeedsFollowup,
  clearFollowup,
  updateSummerResponseSource,
} from '@/app/lib/summer-actions';
import ApproveRequestModal from './approve-request-modal';

type ResponsePatch = Partial<Pick<
  SummerResponseRow,
  'status' | 'added_to_portal_at' | 'added_to_portal_by' | 'submitted_by' | 'submitted_by_name'
>>;

function formatTime(t: string | null): string {
  if (!t) return '—';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
}

const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric' });

function formatDate(d: Date | string): string {
  return SHORT_DATE_FORMATTER.format(new Date(d));
}

function formatStartDate(date: string | null): string | null {
  if (!date) return null;
  return SHORT_DATE_FORMATTER.format(new Date(`${date}T00:00:00`));
}

function formatCurrentSession(weekday: string | null, startTime: string | null): string | null {
  if (!weekday) return null;
  return `${weekday} ${formatTime(startTime)}`;
}

function formatCurrentSessions(row: SummerResponseRow): string {
  if (row.current_sessions_snapshot.length > 0) {
    return row.current_sessions_snapshot
      .map(session => {
        const slot = `${session.weekday} ${formatTime(session.start_time)}`;
        return session.course_name ? `${slot} (${session.course_name})` : slot;
      })
      .join(', ');
  }
  return row.current_weekday ? `${row.current_weekday} ${formatTime(row.current_start_time)}` : '—';
}

function formatFallStatus(row: SummerResponseRow): string {
  if (row.fall_status !== 'same') {
    return row.fall_status ? (FALL_STATUS_LABEL[row.fall_status] ?? row.fall_status) : '—';
  }

  const currentSession = formatCurrentSessions(row);
  return currentSession ? `${FALL_STATUS_LABEL.same} - ${currentSession}` : FALL_STATUS_LABEL.same;
}

const SUMMER_STATUS_STYLE: Record<string, string> = {
  enrolling: 'bg-emerald-100 text-emerald-700',
  pausing:   'bg-orange-100 text-orange-700',
  no_change: 'bg-sky-100 text-sky-700',
  other:     'bg-purple-100 text-purple-700',
};
const SUMMER_STATUS_LABEL: Record<string, string> = {
  enrolling: 'Attending',
  pausing:   'Pausing',
  no_change: 'No Change',
  other:     'Other',
};

const FALL_STATUS_LABEL: Record<string, string> = {
  same:          'Keep current',
  change:        'Requesting change',
  pause:         'Not sure yet',
  unsure:        'Returning, day TBD',
  not_returning: 'Definitely not returning',
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
  completed:             'Completed',
  needs_manual_followup: 'Needs Followup',
};

const SUBMISSION_SOURCE_STYLE: Record<string, string> = {
  parent: 'bg-emerald-100 text-emerald-700',
  staff:  'bg-amber-100 text-amber-800',
};
const SUBMISSION_SOURCE_LABEL: Record<string, string> = {
  parent: 'Parent',
  staff:  'Internal',
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

function SourceBadge({ source, name }: { source: string; name: string | null }) {
  const label = SUBMISSION_SOURCE_LABEL[source] ?? source;
  return (
    <span
      title={name ? `${label}: ${name}` : label}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${SUBMISSION_SOURCE_STYLE[source] ?? 'bg-slate-100 text-slate-500'}`}
    >
      {source === 'staff' && name ? `${label}: ${name}` : label}
    </span>
  );
}

function UpdatedBadge({
  count,
  expanded,
  onClick,
}: {
  count: number;
  expanded: boolean;
  onClick: () => void;
}) {
  if (count <= 0) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      title="Show previous submissions for this response."
      className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 ring-1 ring-indigo-100 hover:bg-indigo-100"
    >
      Updated {count + 1}x {expanded ? 'Hide history' : 'History'}
    </button>
  );
}

function StatCard({
  label,
  value,
  color,
  detail,
}: {
  label: string;
  value: number;
  color?: string;
  detail?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className={`text-2xl font-bold ${color ?? 'text-slate-800'}`}>{value}</div>
      <div className="text-xs text-slate-500 mt-0.5">{label}</div>
      {detail && <div className="mt-1 text-[11px] leading-4 text-slate-400">{detail}</div>}
    </div>
  );
}

function CompactStatCard({
  label,
  value,
  color,
  detail,
}: {
  label: string;
  value: number;
  color?: string;
  detail?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <div className="flex items-baseline gap-2">
        <div className={`text-lg font-bold ${color ?? 'text-slate-800'}`}>{value}</div>
        <div className="text-xs font-medium text-slate-600">{label}</div>
      </div>
      {detail && <div className="mt-0.5 text-[11px] leading-4 text-slate-400">{detail}</div>}
    </div>
  );
}

function familyKey(row: SummerResponseRow): string {
  return row.customer_id || `${row.parent_email}:${row.parent_name}`;
}

function countFamilies(rows: SummerResponseRow[], predicate: (row: SummerResponseRow) => boolean): number {
  return new Set(rows.filter(predicate).map(familyKey)).size;
}

function deriveStats(baseStats: SummerStats, rows: SummerResponseRow[]): SummerStats {
  const respondedFamilies = new Set(rows.map(familyKey));
  const parentSubmittedFamilies = new Set(rows
    .filter(row => row.submitted_by === 'parent')
    .map(familyKey));
  const staffSubmittedFamilies = new Set(rows
    .filter(row => row.submitted_by === 'staff')
    .map(familyKey));
  return {
    ...baseStats,
    responded_families: respondedFamilies.size,
    responded_students: rows.length,
    summer_attending_families: countFamilies(rows, row => row.summer_status === 'enrolling'),
    summer_attending_students: rows.filter(row => row.summer_status === 'enrolling').length,
    summer_pausing_families: countFamilies(rows, row => row.summer_status === 'pausing'),
    summer_pausing_students: rows.filter(row => row.summer_status === 'pausing').length,
    summer_custom_families: countFamilies(rows, row => row.summer_status === 'other'),
    summer_custom_students: rows.filter(row => row.summer_status === 'other').length,
    summer_no_change_families: countFamilies(rows, row => row.summer_status === 'no_change'),
    summer_no_change_students: rows.filter(row => row.summer_status === 'no_change').length,
    fall_keep_current_families: countFamilies(rows, row => row.fall_status === 'same'),
    fall_keep_current_students: rows.filter(row => row.fall_status === 'same').length,
    fall_change_families: countFamilies(rows, row => row.fall_status === 'change'),
    fall_change_students: rows.filter(row => row.fall_status === 'change').length,
    fall_unsure_or_pause_families: countFamilies(rows, row => row.fall_status === 'unsure' || row.fall_status === 'pause'),
    fall_unsure_or_pause_students: rows.filter(row => row.fall_status === 'unsure' || row.fall_status === 'pause').length,
    fall_not_returning_families: countFamilies(rows, row => row.fall_status === 'not_returning'),
    fall_not_returning_students: rows.filter(row => row.fall_status === 'not_returning').length,
    pending: rows.filter(row => row.status === 'pending').length,
    needs_followup: rows.filter(row => row.status === 'needs_manual_followup').length,
    parent_submitted: parentSubmittedFamilies.size,
    staff_submitted: staffSubmittedFamilies.size,
  };
}

function CsvExportStatus({ row }: { row: SummerResponseRow }) {
  if (row.token_export_count === 0) {
    return <div className="mt-1 text-[11px] font-medium text-amber-700">CSV not exported</div>;
  }
  return (
    <div className="mt-1 text-[11px] text-slate-500">
      CSV {row.token_last_exported_at ? formatDate(row.token_last_exported_at) : 'exported'}
      {row.token_export_count > 1 && <span> x{row.token_export_count}</span>}
    </div>
  );
}

function InternalToggleButton({
  requestId,
  submittedBy,
  onChanged,
}: {
  requestId: string;
  submittedBy: SummerResponseRow['submitted_by'];
  onChanged: (requestIds: string[], patch: Pick<SummerResponseRow, 'submitted_by' | 'submitted_by_name'>) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const isInternal = submittedBy === 'staff';
  return (
    <button
      disabled={isPending}
      onClick={() => startTransition(async () => {
        const result = await updateSummerResponseSource(requestId, isInternal ? 'parent' : 'staff');
        onChanged(result.request_ids, {
          submitted_by: result.submitted_by,
          submitted_by_name: result.submitted_by_name,
        });
      })}
      title={isInternal ? 'Mark this family as parent-submitted' : 'Mark as internal response'}
      className={
        isInternal
          ? 'text-xs px-2 py-1 rounded border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800 transition disabled:opacity-50'
          : 'text-xs px-2 py-1 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition disabled:opacity-50'
      }
    >
      {isPending ? '...' : (isInternal ? 'Clear Internal response' : 'Mark as internal response')}
    </button>
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

function DeleteResponseButton({ requestId, onDeleted }: { requestId: string; onDeleted: (id: string) => void }) {
  const [confirm, setConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (!confirm) {
    return (
      <button
        onClick={() => setConfirm(true)}
        title="Delete this test response permanently"
        className="text-xs px-2 py-1 rounded border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 transition"
      >
        Delete Response
      </button>
    );
  }
  return (
    <span className="flex flex-col gap-1">
      <span className="text-[10px] text-red-700 leading-tight">
        Delete is designed for test responses only. This permanently removes the response.
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
          {isPending ? '...' : 'Confirm Delete'}
        </button>
        <button onClick={() => setConfirm(false)} className="text-xs text-slate-400">Cancel</button>
      </span>
    </span>
  );
}

const NOTE_PREVIEW_LENGTH = 120;

function NoteBlock({ label, note }: { label: string; note: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = note.length > NOTE_PREVIEW_LENGTH;
  const visibleNote = expanded || !isLong ? note : `${note.slice(0, NOTE_PREVIEW_LENGTH).trimEnd()}...`;

  return (
    <div className="rounded-md border border-slate-100 bg-slate-50 px-2 py-1.5">
      <div className="font-medium text-slate-500">{label}</div>
      <div className="mt-0.5 whitespace-pre-wrap break-words italic leading-5 text-slate-600">
        {visibleNote}
      </div>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded(value => !value)}
          className="mt-1 text-[11px] font-medium text-sky-700 hover:text-sky-900"
        >
          {expanded ? 'Show less' : 'More details'}
        </button>
      )}
    </div>
  );
}

function NotesCell({ summerNotes, fallNotes }: { summerNotes: string | null; fallNotes: string | null }) {
  if (!summerNotes && !fallNotes) return <span className="text-slate-400">—</span>;
  return (
    <div className="space-y-2">
      {summerNotes && <NoteBlock label="Summer" note={summerNotes} />}
      {fallNotes && <NoteBlock label="Fall" note={fallNotes} />}
    </div>
  );
}

function PickupCell({
  pickupRequested,
  pickupSchool,
  pickupSchoolOther,
}: {
  pickupRequested: boolean;
  pickupSchool: string | null;
  pickupSchoolOther: string | null;
}) {
  if (!pickupRequested) return <span className="text-slate-400">—</span>;
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 font-medium bg-amber-100 text-amber-700">
      {pickupSchool === 'other'
        ? (pickupSchoolOther ?? 'Other')
        : (pickupSchool ?? 'Yes')}
    </span>
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

function LabelListCell({
  labels,
  emptyLabel = '—',
}: {
  labels: string[];
  emptyLabel?: string;
}) {
  if (labels.length === 0) return <span className="text-slate-400">{emptyLabel}</span>;
  return (
    <div className="space-y-1">
      {labels.map((label, index) => <div key={index}>{label}</div>)}
    </div>
  );
}

function WaitlistLabelsCell({ labels }: { labels: string[] }) {
  if (labels.length === 0) return null;
  return (
    <div className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700">
      Waitlist: {labels.join(', ')}
    </div>
  );
}

function formatHistoryFallStatus(item: SummerResponseRow['submission_history'][number]): string {
  if (!item.fall_status) return '—';
  return FALL_STATUS_LABEL[item.fall_status] ?? item.fall_status;
}

function formatHistoryFallChoice(
  item: SummerResponseRow['submission_history'][number],
  row: SummerResponseRow,
): string {
  if (item.fall_status !== 'same') return formatHistoryFallStatus(item);
  const currentSession = formatCurrentSession(row.current_weekday, row.current_start_time);
  return currentSession ? `${FALL_STATUS_LABEL.same} - ${currentSession}` : FALL_STATUS_LABEL.same;
}

function AddedToPortalCell({
  addedAt,
  addedBy,
}: {
  addedAt: Date | string | null;
  addedBy: string | null;
}) {
  if (!addedAt) return <span className="text-slate-400">—</span>;
  return (
    <div>
      <span className="text-emerald-700 font-medium">{formatDate(addedAt)}</span>
      {addedBy && (
        <div className="mt-0.5 text-[11px] text-slate-500">by {addedBy}</div>
      )}
    </div>
  );
}

function FamilyCell({ row, emailClassName = 'text-xs' }: { row: SummerResponseRow; emailClassName?: string }) {
  const alternateEmail = row.parent_alternate_email?.trim();
  const showAlternate = alternateEmail && alternateEmail.toLowerCase() !== row.parent_email.trim().toLowerCase();

  return (
    <>
      <div className="text-slate-700">{row.parent_name}</div>
      <div className={`${emailClassName} text-slate-400`}>{row.parent_email}</div>
      {showAlternate && (
        <div className={`${emailClassName} text-slate-400`}>{alternateEmail}</div>
      )}
    </>
  );
}

function ResponseHistoryRows({ row }: { row: SummerResponseRow }) {
  if (row.submission_history.length === 0) return null;
  return (
    <tr className="bg-indigo-50/40">
      <td colSpan={14} className="px-4 py-4">
        <div className="rounded-lg border border-indigo-100 bg-white">
          <div className="border-b border-indigo-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-indigo-700">
            Previous Submissions
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left font-semibold text-slate-500">
                  <th className="px-3 py-2">Student</th>
                  <th className="px-3 py-2">Family</th>
                  <th className="px-3 py-2 min-w-[160px]">Current</th>
                  <th className="px-3 py-2">Summer</th>
                  <th className="px-3 py-2">Summer Sessions</th>
                  <th className="px-3 py-2">Pickup</th>
                  <th className="px-3 py-2 min-w-[180px]">Fall</th>
                  <th className="px-3 py-2">Fall Sessions</th>
                  <th className="px-3 py-2 min-w-[200px]">Notes</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Submitted</th>
                  <th className="px-3 py-2">Source</th>
                  <th className="px-3 py-2">Added to Portal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {row.submission_history.map((item, index) => (
                  <tr key={item.request_id} className="align-top">
                    <td className="px-3 py-2 font-medium text-slate-800 whitespace-nowrap">
                      {row.student_name}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <FamilyCell row={row} emailClassName="text-[11px]" />
                    </td>
                    <td className="px-3 py-2 min-w-[160px] max-w-[200px] whitespace-normal break-words text-slate-500 leading-5">
                      {row.current_weekday
                        ? `${row.current_weekday} ${formatTime(row.current_start_time)}`
                        : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <SummerBadge status={item.summer_status} />
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      <LabelListCell labels={item.session_labels} />
                      <WaitlistLabelsCell labels={item.waitlist_session_labels} />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <PickupCell
                        pickupRequested={item.pickup_requested}
                        pickupSchool={item.pickup_school}
                        pickupSchoolOther={item.pickup_school_other}
                      />
                    </td>
                    <td className="px-3 py-2 min-w-[180px] max-w-[240px] whitespace-normal break-words text-slate-600 leading-5">
                      {formatHistoryFallChoice(item, row)}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      <LabelListCell
                        labels={item.fall_session_labels}
                        emptyLabel={item.fall_status === 'same' ? 'Keeping current session' : '—'}
                      />
                      <WaitlistLabelsCell labels={item.fall_waitlist_session_labels} />
                    </td>
                    <td className="px-3 py-2 min-w-[200px] max-w-[260px] text-slate-500">
                      <NotesCell summerNotes={item.custom_notes} fallNotes={item.fall_notes} />
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-500">
                      {formatDate(item.submitted_at)}
                      <div className="mt-0.5 text-[11px] text-slate-400">
                        Previous {row.submission_history.length - index}
                      </div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <SourceBadge source={item.submitted_by} name={item.submitted_by_name} />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <AddedToPortalCell
                        addedAt={item.added_to_portal_at}
                        addedBy={item.added_to_portal_by}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </td>
    </tr>
  );
}

function AddedToPortalButton({
  requestId,
  addedAt,
  addedBy,
  onChanged,
}: {
  requestId: string;
  addedAt: Date | null;
  addedBy: string | null;
  onChanged: (requestId: string, addedAt: Date | null, addedBy: string | null) => void;
}) {
  const [isPending, startTransition] = useTransition();
  if (addedAt) {
    return (
      <button
        disabled={isPending}
        onClick={() => startTransition(async () => {
          await clearAddedToPortal(requestId);
          onChanged(requestId, null, null);
        })}
        title={`Added to portal ${formatDate(addedAt)}${addedBy ? ` by ${addedBy}` : ''} - click to undo`}
        className="text-xs px-2 py-1 rounded border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 transition disabled:opacity-50"
      >
        {isPending ? '...' : `In Portal (${formatDate(addedAt)})`}
      </button>
    );
  }
  return (
    <button
      disabled={isPending}
      onClick={() => startTransition(async () => {
        const result = await markAddedToPortal(requestId);
        onChanged(requestId, result.added_to_portal_at, result.added_to_portal_by);
      })}
      className="text-xs px-2 py-1 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition disabled:opacity-50"
    >
      {isPending ? '...' : 'Added to Portal'}
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
      {isPending ? '…' : (isFollowup ? 'Clear Followup' : 'Mark Follow up Required')}
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
  const [submissionFilter, setSubmissionFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [expandedHistoryIds, setExpandedHistoryIds] = useState<Set<string>>(new Set());
  const [modalRow, setModalRow] = useState<SummerResponseRow | null>(null);

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
    setExpandedHistoryIds(prev => {
      const next = new Set(prev);
      next.delete(requestId);
      return next;
    });
  }

  function toggleHistory(requestId: string) {
    setExpandedHistoryIds(prev => {
      const next = new Set(prev);
      if (next.has(requestId)) {
        next.delete(requestId);
      } else {
        next.add(requestId);
      }
      return next;
    });
  }

  const normalizedSearch = search.trim().toLowerCase();
  const filtered = useMemo(() => currentRows.filter(r => {
    if (workflowFilter === 'needs_action' && r.added_to_portal_at) return false;
    if (workflowFilter === 'added_to_portal' && !r.added_to_portal_at) return false;
    if (submissionFilter === 'updated' && r.previous_submission_count === 0) return false;
    if (sourceFilter === 'parent' && r.submitted_by !== 'parent') return false;
    if (sourceFilter === 'staff' && r.submitted_by !== 'staff') return false;
    if (sourceFilter === 'not_exported' && r.token_export_count > 0) return false;
    if (summerFilter !== 'all' && r.summer_status !== summerFilter) return false;
    if (fallFilter !== 'all' && r.fall_status !== fallFilter) return false;
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (normalizedSearch) {
      const searchableText = [
        r.student_name,
        r.parent_name,
        r.parent_email,
        r.submitted_by_name,
        r.custom_notes,
        r.fall_notes,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!searchableText.includes(normalizedSearch)) return false;
    }
    return true;
  }), [currentRows, fallFilter, normalizedSearch, sourceFilter, statusFilter, submissionFilter, summerFilter, workflowFilter]);

  const notRespondedFamilies = Math.max(currentStats.total_families - currentStats.responded_families, 0);
  const notRespondedStudents = Math.max(currentStats.total_students - currentStats.responded_students, 0);
  return (
    <div className="space-y-4">
      {/* Response totals */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Families Responded"
          value={currentStats.responded_families}
          color="text-emerald-700"
          detail={`${currentStats.total_families} total - ${notRespondedFamilies} not responded`}
        />
        <StatCard
          label="Students Responded"
          value={currentStats.responded_students}
          color="text-emerald-700"
          detail={`${currentStats.total_students} expected - ${notRespondedStudents} not responded`}
        />
        <StatCard label="Pending Review" value={currentStats.pending} color={currentStats.pending > 0 ? 'text-amber-600' : 'text-slate-800'} />
        <StatCard label="Needs Followup" value={currentStats.needs_followup} color={currentStats.needs_followup > 0 ? 'text-red-600' : 'text-slate-800'} />
      </div>

      {/* Summer choices */}
      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <StatCard
          label="Summer Attending"
          value={currentStats.summer_attending_students}
          color="text-emerald-700"
          detail={`${currentStats.summer_attending_families} families selected attending`}
        />
        <StatCard
          label="Summer Pausing"
          value={currentStats.summer_pausing_students}
          color="text-orange-600"
          detail={`${currentStats.summer_pausing_families} families selected pausing`}
        />
        <StatCard
          label="Summer Custom"
          value={currentStats.summer_custom_students}
          color="text-purple-700"
          detail={`${currentStats.summer_custom_families} families selected custom`}
        />
        {currentStats.summer_no_change_students > 0 && (
          <StatCard
            label="Summer No Change"
            value={currentStats.summer_no_change_students}
            color="text-sky-700"
            detail={`${currentStats.summer_no_change_families} families selected legacy no change`}
          />
        )}
      </div>

      {/* Fall choices */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Fall Keep Current"
          value={currentStats.fall_keep_current_students}
          color="text-sky-700"
          detail={`${currentStats.fall_keep_current_families} families selected keep current`}
        />
        <StatCard
          label="Fall Change"
          value={currentStats.fall_change_students}
          color="text-indigo-700"
          detail={`${currentStats.fall_change_families} families requested a change`}
        />
        <StatCard
          label="Fall Unsure"
          value={currentStats.fall_unsure_or_pause_students}
          color="text-amber-700"
          detail={`${currentStats.fall_unsure_or_pause_families} families selected unsure/not sure`}
        />
        <StatCard
          label="Fall Not Returning"
          value={currentStats.fall_not_returning_students}
          color="text-red-600"
          detail={`${currentStats.fall_not_returning_families} families selected not returning`}
        />
      </div>

      {/* Source/export stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <CompactStatCard label="Parent" value={currentStats.parent_submitted} color="text-emerald-700" detail="families submitted" />
        <CompactStatCard label="Internal" value={currentStats.staff_submitted} color={currentStats.staff_submitted > 0 ? 'text-amber-700' : 'text-slate-800'} detail="families staff-entered" />
        <CompactStatCard label="Email" value={currentStats.exported} detail="(Exported)" />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center">
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
            { value: 'enrolling', label: 'Attending' },
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
            { value: 'unsure', label: 'Returning, day TBD' },
            { value: 'not_returning', label: 'Not returning' },
            { value: 'pause',  label: 'Not sure yet (legacy)' },
          ]}
        />
        <FilterSelect
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: 'all',                   label: 'All statuses' },
            { value: 'pending',               label: 'Pending' },
            { value: 'completed',             label: 'Completed' },
            { value: 'needs_manual_followup', label: 'Needs Followup' },
          ]}
        />
        <FilterSelect
          value={submissionFilter}
          onChange={setSubmissionFilter}
          options={[
            { value: 'all',     label: 'Current responses' },
            { value: 'updated', label: 'Updated only' },
          ]}
        />
        <FilterSelect
          value={sourceFilter}
          onChange={setSourceFilter}
          options={[
            { value: 'all',          label: 'All sources' },
            { value: 'parent',       label: 'Parent submitted' },
            { value: 'staff',        label: 'Internal' },
            { value: 'not_exported', label: 'CSV not exported' },
          ]}
        />
        {(workflowFilter !== 'needs_action' || summerFilter !== 'all' || fallFilter !== 'all' || statusFilter !== 'all' || submissionFilter !== 'all' || sourceFilter !== 'all' || search) && (
          <button
            onClick={() => { setWorkflowFilter('needs_action'); setSummerFilter('all'); setFallFilter('all'); setStatusFilter('all'); setSubmissionFilter('all'); setSourceFilter('all'); setSearch(''); }}
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
                <th className="px-4 py-3 min-w-[190px]">Current</th>
                <th className="px-4 py-3">Summer</th>
                <th className="px-4 py-3">Summer Sessions</th>
                <th className="px-4 py-3">Pickup</th>
                <th className="px-4 py-3 min-w-[240px]">Fall Plan</th>
                <th className="px-4 py-3">Fall Sessions</th>
                <th className="px-4 py-3 min-w-[240px]">Notes</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Submitted</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Added to Portal</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={14} className="px-4 py-8 text-center text-slate-400 text-sm">
                    No matching responses.
                  </td>
                </tr>
              ) : filtered.map(row => (
                <Fragment key={row.request_id}>
                <tr className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
                    <div className="space-y-1">
                      <div>{row.student_name}</div>
                      <UpdatedBadge
                        count={row.previous_submission_count}
                        expanded={expandedHistoryIds.has(row.request_id)}
                        onClick={() => toggleHistory(row.request_id)}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <FamilyCell row={row} />
                  </td>
                  <td className="px-4 py-3 min-w-[190px] max-w-[240px] whitespace-normal break-words text-xs leading-5 text-slate-500">
                    {formatCurrentSessions(row)}
                  </td>
                  <td className="px-4 py-3">
                    <SummerBadge status={row.summer_status} />
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-xs">
                    <SessionChoicesCell choices={row.session_choices} fallbackLabels={row.session_labels} />
                    <WaitlistLabelsCell labels={row.waitlist_session_labels} />
                  </td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap">
                    <PickupCell
                      pickupRequested={row.pickup_requested}
                      pickupSchool={row.pickup_school}
                      pickupSchoolOther={row.pickup_school_other}
                    />
                  </td>
                  <td className="px-4 py-3 min-w-[240px] max-w-[320px] whitespace-normal break-words text-xs leading-5 text-slate-600">
                    {row.fall_status ? formatFallStatus(row) : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-xs">
                    <SessionChoicesCell choices={row.fall_session_choices} fallbackLabels={row.fall_session_labels} />
                    <WaitlistLabelsCell labels={row.fall_waitlist_session_labels} />
                  </td>
                  <td className="px-4 py-3 min-w-[220px] max-w-[280px] text-xs text-slate-500">
                    <NotesCell summerNotes={row.custom_notes} fallNotes={row.fall_notes} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                    {formatDate(row.submitted_at)}
                  </td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap">
                    <SourceBadge source={row.submitted_by} name={row.submitted_by_name} />
                    <CsvExportStatus row={row} />
                  </td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap">
                    <AddedToPortalCell
                      addedAt={row.added_to_portal_at}
                      addedBy={row.added_to_portal_by}
                    />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => setModalRow(row)}
                        className="text-xs px-2 py-1 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition"
                      >
                        {row.previous_submission_count > 0 ? 'Review Latest' : 'Review'}
                      </button>
                      {row.previous_submission_count > 0 && (
                        <button
                          onClick={() => toggleHistory(row.request_id)}
                          className="text-xs px-2 py-1 rounded border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition"
                        >
                          {expandedHistoryIds.has(row.request_id) ? 'Hide History' : 'History'}
                        </button>
                      )}
                      <AddedToPortalButton
                        requestId={row.request_id}
                        addedAt={row.added_to_portal_at}
                        addedBy={row.added_to_portal_by}
                        onChanged={(id, addedAt, addedBy) => patchResponse(id, {
                          added_to_portal_at: addedAt,
                          added_to_portal_by: addedBy,
                        })}
                      />
                      <FollowupToggleButton
                        requestId={row.request_id}
                        status={row.status}
                        onChanged={(id, status) => patchResponse(id, { status })}
                      />
                      <InternalToggleButton
                        requestId={row.request_id}
                        submittedBy={row.submitted_by}
                        onChanged={(ids, patch) => patchResponses(ids, patch)}
                      />
                      <DeleteResponseButton
                        requestId={row.request_id}
                        onDeleted={removeResponse}
                      />
                    </div>
                  </td>
                </tr>
                {expandedHistoryIds.has(row.request_id) && <ResponseHistoryRows row={row} />}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalRow && (
        <ApproveRequestModal
          row={modalRow}
          onClose={() => setModalRow(null)}
        />
      )}

    </div>
  );
}
