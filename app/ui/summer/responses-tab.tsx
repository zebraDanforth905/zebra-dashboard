'use client';

import { Fragment, useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  listStudentPortalEnrolments,
  loadSummerEnrolOptions,
  addPortalEnrolmentForSummerSession,
} from '@/app/lib/actions';
import { listPendingInactivations } from '@/app/lib/inactivation-actions';
import ManageInactivationModal from '@/app/ui/students/manage-inactivation-modal';
import type { EnrolmentView } from '@/app/ui/students/student-enrolments';
import {
  SessionChoiceSummary,
  SummerResponseRow,
  SummerStats,
} from '@/app/lib/definitions';
import {
  approveAllEnrolling,
  deleteSummerRecurringInvoice,
  deleteSummerResponse,
  markAllNoChangeComplete,
  markAddedToPortal,
  clearAddedToPortal,
  markNeedsFollowup,
  pauseSummerRecurringInvoiceUntilSeptember,
  clearFollowup,
  updateSummerResponseSource,
} from '@/app/lib/summer-actions';
import ApproveRequestModal from './approve-request-modal';
import StudentNotesModal from '@/app/ui/students/student-notes-modal';
import CustomerNotesModal from '@/app/ui/billing/customer-notes-modal';

type ResponsePatch = Partial<Pick<
  SummerResponseRow,
  'status' | 'added_to_portal_at' | 'added_to_portal_by' | 'submitted_by' | 'submitted_by_name' | 'recurring_invoices'
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

function formatStartSuffix(date: string | null): string {
  const startDate = formatStartDate(date);
  return startDate ? ` (start ${startDate})` : '';
}

function formatCurrentSession(weekday: string | null, startTime: string | null): string | null {
  if (!weekday) return null;
  return `${weekday} ${formatTime(startTime)}`;
}

function formatIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function nextUpcomingWeekdayDate(weekday: SessionChoiceSummary['weekday']): string {
  const weekdayIndex: Record<SessionChoiceSummary['weekday'], number> = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
  };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = weekdayIndex[weekday];
  const delta = (target - today.getDay() + 7) % 7;
  today.setDate(today.getDate() + delta);
  return formatIsoDate(today);
}

// Default the enrol start-date picker to the session's own start date when the
// plan carries one, otherwise the next upcoming matching weekday.
function defaultEnrolStartDate(choice: SessionChoiceSummary): string {
  if (choice.start_date && /^\d{4}-\d{2}-\d{2}$/.test(choice.start_date)) {
    return choice.start_date;
  }
  return nextUpcomingWeekdayDate(choice.weekday);
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

function currentSessionLabels(row: SummerResponseRow): string[] {
  if (row.current_sessions_snapshot.length > 0) {
    return row.current_sessions_snapshot.map(session => {
      const slot = `${session.weekday} ${formatTime(session.start_time)}`;
      return session.course_name ? `${slot} (${session.course_name})` : slot;
    });
  }
  if (row.current_weekday) {
    return [`${row.current_weekday} ${formatTime(row.current_start_time)}`];
  }
  return [];
}

function formatFallStatus(row: SummerResponseRow): string {
  if (row.fall_status !== 'same') {
    return row.fall_status ? (FALL_STATUS_LABEL[row.fall_status] ?? row.fall_status) : '—';
  }

  const currentSession = formatCurrentSessions(row);
  const startSuffix = formatStartSuffix(row.fall_start_date);
  return currentSession ? `${FALL_STATUS_LABEL.same} - ${currentSession}${startSuffix}` : `${FALL_STATUS_LABEL.same}${startSuffix}`;
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
  completed:             'Approved',
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

const PERCENT_FORMATTER = new Intl.NumberFormat('en-CA', {
  style: 'percent',
  maximumFractionDigits: 0,
});

function formatPercent(part: number, total: number): string {
  return total > 0 ? PERCENT_FORMATTER.format(part / total) : '0%';
}

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
    waitlisted_students: rows.filter(row => (
      row.waitlist_session_labels.length > 0
      || row.fall_waitlist_session_labels.length > 0
    )).length,
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
        title="Hide this test response from active summer views"
        className="text-xs px-2 py-1 rounded border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 transition"
      >
        Remove Response
      </button>
    );
  }
  return (
    <span className="flex flex-col gap-1">
      <span className="text-[10px] text-red-700 leading-tight">
        Remove is designed for test responses only. This hides the response without deleting history.
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
          {isPending ? '...' : 'Confirm Remove'}
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
      <div className="flex flex-wrap gap-1.5">
        {fallbackLabels.map((label, index) => (
          <span
            key={index}
            className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-800"
          >
            {label}
          </span>
        ))}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {choices.map(choice => {
        const startDate = formatStartDate(choice.start_date);
        return (
          <span
            key={choice.session_id}
            className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-800"
            title={startDate ? `Starts ${startDate}` : 'Start date missing'}
          >
            {choice.weekday} {formatTime(choice.start_time)}
          </span>
        );
      })}
    </div>
  );
}

type EnrolProgramOption = {
  course_id: number;
  name: string;
  course_code: string;
  sub_courses: { sub_course_id: number; code: string; name: string }[];
};

function SummerSessionEnrolControl({
  studentId,
  choice,
}: {
  studentId: string;
  choice: SessionChoiceSummary;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [programs, setPrograms] = useState<EnrolProgramOption[]>([]);
  const [courseId, setCourseId] = useState<number | null>(null);
  const [subCourseId, setSubCourseId] = useState<number | null>(null);
  const [startDate, setStartDate] = useState(() => defaultEnrolStartDate(choice));
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<'error' | 'success'>('success');
  const [isPending, startTransition] = useTransition();

  const selectedProgram = programs.find((program) => program.course_id === courseId) ?? null;
  const canConfirm = courseId != null && subCourseId != null && Boolean(startDate);

  async function openEnrol() {
    setStartDate(defaultEnrolStartDate(choice));
    setMessage(null);
    setExpanded(true);
    setOptionsLoading(true);
    const result = await loadSummerEnrolOptions(Number(studentId));
    setOptionsLoading(false);
    if (!result.ok) {
      setMessage(result.error);
      setMessageTone('error');
      return;
    }
    setPrograms(result.programs);
    // Autopopulate from the most recently ended enrolment when available.
    if (result.suggested) {
      setCourseId(result.suggested.course_id);
      setSubCourseId(result.suggested.sub_course_id);
    }
  }

  function handleCourseChange(nextCourseId: number) {
    setCourseId(nextCourseId);
    const program = programs.find((candidate) => candidate.course_id === nextCourseId) ?? null;
    setSubCourseId(program?.sub_courses[0]?.sub_course_id ?? null);
  }

  function confirmEnrol() {
    if (courseId == null || subCourseId == null) {
      setMessage('Select a course and level first.');
      setMessageTone('error');
      return;
    }
    startTransition(async () => {
      const result = await addPortalEnrolmentForSummerSession({
        studentId: Number(studentId),
        sessionId: choice.session_id,
        startDate,
        courseId,
        subCourseId,
      });
      if (!result.ok) {
        setMessage(result.error);
        setMessageTone('error');
        return;
      }
      setMessage('Portal enrolment created.');
      setMessageTone('success');
      setExpanded(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-800">
          {choice.weekday} {formatTime(choice.start_time)}
        </span>
        {!expanded && (
          <button
            type="button"
            onClick={openEnrol}
            className="text-[11px] px-2 py-0.5 rounded border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700"
          >
            Enrol
          </button>
        )}
      </div>

      {expanded && (
        <div className="flex flex-col gap-1.5 rounded border border-emerald-100 bg-emerald-50/60 p-2">
          {optionsLoading ? (
            <span className="text-[11px] text-slate-500">Loading courses…</span>
          ) : (
            <>
              <label className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Course</label>
              <select
                value={courseId ?? ''}
                onChange={(event) => handleCourseChange(Number(event.target.value))}
                className="rounded border border-slate-300 px-2 py-1 text-[11px] text-slate-700"
              >
                <option value="" disabled>Select course…</option>
                {programs.map((program) => (
                  <option key={program.course_id} value={program.course_id}>
                    {program.name} ({program.course_code})
                  </option>
                ))}
              </select>

              {selectedProgram && selectedProgram.sub_courses.length > 0 && (
                <>
                  <label className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Level</label>
                  <select
                    value={subCourseId ?? ''}
                    onChange={(event) => setSubCourseId(Number(event.target.value))}
                    className="rounded border border-slate-300 px-2 py-1 text-[11px] text-slate-700"
                  >
                    <option value="" disabled>Select level…</option>
                    {selectedProgram.sub_courses.map((sub) => (
                      <option key={sub.sub_course_id} value={sub.sub_course_id}>
                        {sub.name} ({sub.code})
                      </option>
                    ))}
                  </select>
                </>
              )}

              <label className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Start date</label>
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                className="rounded border border-slate-300 px-2 py-1 text-[11px] text-slate-700"
              />

              <div className="flex items-center gap-2 pt-0.5">
                <button
                  type="button"
                  disabled={isPending || !canConfirm}
                  onClick={confirmEnrol}
                  className="text-[11px] px-2 py-0.5 rounded border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 disabled:opacity-50"
                >
                  {isPending ? 'Enrolling…' : 'Confirm'}
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => {
                    setExpanded(false);
                    setMessage(null);
                  }}
                  className="text-[11px] px-2 py-0.5 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {message && (
        <span className={messageTone === 'error' ? 'text-[11px] text-red-600' : 'text-[11px] text-emerald-700'}>
          {message}
        </span>
      )}
    </div>
  );
}

function SummerSessionChoicesCell({
  studentId,
  choices,
  fallbackLabels,
}: {
  studentId: string;
  choices: SessionChoiceSummary[];
  fallbackLabels: string[];
}) {
  if (choices.length === 0) {
    return <SessionChoicesCell choices={choices} fallbackLabels={fallbackLabels} />;
  }

  return (
    <div className="space-y-1.5">
      {choices.map((choice) => (
        <SummerSessionEnrolControl key={choice.session_id} studentId={studentId} choice={choice} />
      ))}
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
    <div className="flex flex-wrap gap-1.5">
      {labels.map((label, index) => (
        <span
          key={index}
          className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-800"
        >
          {label}
        </span>
      ))}
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

function SummerPlanCell({ row }: { row: SummerResponseRow }) {
  return (
    <div className="space-y-2 text-xs text-slate-600">
      <div>
        <span className="mr-1 font-medium text-slate-500">Summer:</span>
        <SummerBadge status={row.summer_status} />
      </div>
      <div>
        <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Summer sessions</div>
        <SummerSessionChoicesCell
          studentId={row.student_id}
          choices={row.session_choices}
          fallbackLabels={row.session_labels}
        />
        <WaitlistLabelsCell labels={row.waitlist_session_labels} />
      </div>
      <div>
        <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Notes</div>
        {row.custom_notes ? (
          <div className="italic text-slate-600">{row.custom_notes}</div>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </div>
    </div>
  );
}

function FallPlanCell({ row }: { row: SummerResponseRow }) {
  const fallbackLabels = row.fall_status === 'same'
    ? currentSessionLabels(row)
    : row.fall_session_labels;

  return (
    <div className="space-y-2 text-xs text-slate-600">
      <div>
        <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Fall plan</div>
        <div className="text-slate-600">
          {row.fall_status ? formatFallStatus(row) : <span className="text-slate-400">—</span>}
        </div>
      </div>
      <div>
        <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Fall sessions</div>
        <SessionChoicesCell choices={row.fall_session_choices} fallbackLabels={fallbackLabels} />
        <WaitlistLabelsCell labels={row.fall_waitlist_session_labels} />
      </div>
      <div>
        <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Pickup</div>
        <PickupCell
          pickupRequested={row.pickup_requested}
          pickupSchool={row.pickup_school}
          pickupSchoolOther={row.pickup_school_other}
        />
      </div>
      <div>
        <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Fall notes</div>
        {row.fall_notes ? (
          <div className="italic text-slate-600">{row.fall_notes}</div>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </div>
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
  const startSuffix = formatStartSuffix(item.fall_start_date);
  return currentSession ? `${FALL_STATUS_LABEL.same} - ${currentSession}${startSuffix}` : `${FALL_STATUS_LABEL.same}${startSuffix}`;
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

function formatRecurringCurrency(cents: number): string {
  return (Number(cents) / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  });
}

function RecurringInvoicesCell({
  invoices,
  onChanged,
}: {
  invoices: SummerResponseRow['recurring_invoices'];
  onChanged: (nextInvoices: SummerResponseRow['recurring_invoices']) => void;
}) {
  const [isPending, startTransition] = useTransition();

  if (!invoices || invoices.length === 0) {
    return <span className="text-slate-400">—</span>;
  }

  return (
    <div className="space-y-2 min-w-[220px]">
      {invoices.map((invoice) => (
        <div key={invoice.id} className="rounded-md border border-slate-200 bg-slate-50 p-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-slate-700">{formatRecurringCurrency(invoice.amount)}</span>
            <span className="text-[11px] text-slate-500">Every {invoice.every} mo</span>
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">
            Next: {formatDate(invoice.next_date)}
          </div>
          {invoice.description && (
            <div className="mt-0.5 line-clamp-2 text-[11px] text-slate-500">{invoice.description}</div>
          )}
          <div className="mt-1.5 flex flex-wrap gap-2">
            <button
              disabled={isPending}
              onClick={() => startTransition(async () => {
                const result = await pauseSummerRecurringInvoiceUntilSeptember(invoice.id);
                onChanged(invoices.map((currentInvoice) => (
                  currentInvoice.id === invoice.id
                    ? { ...currentInvoice, next_date: result.next_date }
                    : currentInvoice
                )));
              })}
              className="text-xs px-2 py-1 rounded border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800 transition disabled:opacity-50"
              title="Pause this recurring invoice until September 1st"
            >
              {isPending ? '...' : 'Pause to Sep 1'}
            </button>
            <button
              disabled={isPending}
              onClick={() => startTransition(async () => {
                await deleteSummerRecurringInvoice(invoice.id);
                onChanged(invoices.filter((currentInvoice) => currentInvoice.id !== invoice.id));
              })}
              className="text-xs px-2 py-1 rounded border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 transition disabled:opacity-50"
              title="Delete this recurring invoice"
            >
              {isPending ? '...' : 'Delete'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

type PortalEnrolmentRow = {
  student_batch_id: number;
  course_name: string;
  sub_course_code: string | null;
  total_amount: string;
  batches: Array<{ batch_id: number; day?: string; start_time?: string }>;
};

// Map a portal enrolment row into the EnrolmentView shape the shared
// ManageInactivationModal expects (it reuses the same scheduling action as the
// students edit page).
function toEnrolmentView(enrolment: PortalEnrolmentRow): EnrolmentView {
  const batch = enrolment.batches[0];
  return {
    studentBatchId: enrolment.student_batch_id,
    courseName: enrolment.course_name,
    subCourseCode: enrolment.sub_course_code,
    totalAmount: enrolment.total_amount,
    enrolledOn: null,
    isCurrent: true,
    batch: batch
      ? {
          batchId: batch.batch_id,
          day: batch.day ?? '',
          startTime: batch.start_time ?? '',
          endTime: '',
          endDate: null,
        }
      : null,
  };
}

function CurrentEnrolmentsCell({ studentId, studentName }: { studentId: string; studentName: string }) {
  const [enrolments, setEnrolments] = useState<PortalEnrolmentRow[] | null>(null);
  // student_batch_id -> queued end date (YYYY-MM-DD) for a scheduled unenrol.
  const [pending, setPending] = useState<Record<number, string>>({});
  const [ending, setEnding] = useState<EnrolmentView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const parsedStudentId = Number(studentId);

  useEffect(() => {
    let isMounted = true;
    if (!Number.isFinite(parsedStudentId)) {
      setError('Invalid student ID');
      return;
    }
    setIsLoading(true);
    setError(null);
    Promise.all([
      listStudentPortalEnrolments(parsedStudentId),
      listPendingInactivations(parsedStudentId),
    ])
      .then(([result, pendingRows]) => {
        if (!isMounted) return;
        if (!result.ok) {
          setError(result.error);
          setEnrolments([]);
          return;
        }
        setEnrolments(result.enrolments as PortalEnrolmentRow[]);
        setPending(Object.fromEntries(pendingRows.map((row) => [row.studentBatchId, row.endDate])));
      })
      .catch((e) => {
        if (!isMounted) return;
        setError(e instanceof Error ? e.message : String(e));
        setEnrolments([]);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [parsedStudentId]);

  function handleInactivationChanged(
    studentBatchId: number,
    endDate: string | null,
    action: 'now' | 'scheduled' | 'cancelled',
  ) {
    setPending((prev) => {
      const next = { ...prev };
      if (endDate) next[studentBatchId] = endDate;
      else delete next[studentBatchId];
      return next;
    });
    // Inactivated immediately -> the enrolment is no longer active, drop it.
    // A scheduled date or an undo keeps the enrolment in the list.
    if (action === 'now') {
      setEnrolments((prev) => (prev ?? []).filter((item) => item.student_batch_id !== studentBatchId));
    }
  }

  if (isLoading && enrolments === null) {
    return <span className="text-slate-400">Loading…</span>;
  }

  if (error) {
    return <span className="text-red-600 text-[11px]">{error}</span>;
  }

  if (!enrolments || enrolments.length === 0) {
    return <span className="text-slate-400">—</span>;
  }

  return (
    <div className="space-y-1 min-w-[240px]">
      {enrolments.map((enrolment) => {
        const pendingEndDate = pending[enrolment.student_batch_id] ?? null;
        return (
          <div key={enrolment.student_batch_id} className="rounded border border-slate-200 bg-slate-50 p-2">
            <div className="text-[11px] font-medium text-slate-700">{enrolment.course_name}</div>
            <div className="text-[10px] text-slate-500">
              {(enrolment.sub_course_code ?? 'No level')} · ${enrolment.total_amount}
            </div>
            {enrolment.batches.length > 0 && (
              <div className="text-[10px] text-slate-500 mt-0.5">
                {enrolment.batches.map((batch) => `${batch.day ?? 'Day TBD'} ${formatTime(batch.start_time ?? null)}`).join(', ')}
              </div>
            )}
            {pendingEndDate && (
              <div className="mt-1 inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800 ring-1 ring-amber-100">
                Unenrolling {formatDate(pendingEndDate)}
              </div>
            )}
            <button
              type="button"
              onClick={() => setEnding(toEnrolmentView(enrolment))}
              className={
                pendingEndDate
                  ? 'mt-1 block text-[11px] px-2 py-1 rounded border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800 transition'
                  : 'mt-1 block text-[11px] px-2 py-1 rounded border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 transition'
              }
              title={pendingEndDate ? 'Edit or undo the scheduled unenrol date' : 'Unenrol now or schedule a future date'}
            >
              {pendingEndDate ? 'Edit unenrol date' : 'Unenrol'}
            </button>
          </div>
        );
      })}
      {ending && (
        <ManageInactivationModal
          studentId={parsedStudentId}
          studentName={studentName}
          enrolment={ending}
          pendingEndDate={pending[ending.studentBatchId] ?? null}
          onClose={() => setEnding(null)}
          onChanged={handleInactivationChanged}
        />
      )}
    </div>
  );
}

function StudentCell({ row, currentUserName }: { row: SummerResponseRow; currentUserName: string }) {
  const [showModal, setShowModal] = useState(false);

  return (
    <div className="space-y-1">
      <div className="font-medium text-slate-800 whitespace-nowrap">{row.student_name}</div>
      <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1">
        <div className="px-2 pt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Student Notes</div>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="mt-1 w-full rounded-md border border-sky-200 bg-white px-2 py-1 text-left text-[11px] text-slate-700 hover:bg-sky-50"
        >
          <div className="font-medium text-sky-700">Open notes</div>
          <div className="mt-0.5 line-clamp-2 text-slate-600">
            {row.student_note ?? 'No notes yet. Click to add one.'}
          </div>
        </button>
        {showModal && (
          <StudentNotesModal
            studentId={row.student_id}
            studentName={row.student_name}
            currentUserName={currentUserName}
            onClose={() => setShowModal(false)}
          />
        )}
      </div>
    </div>
  );
}

function FamilyCell({
  row,
  currentUserName,
  emailClassName = 'text-xs',
  showNotes = true,
}: {
  row: SummerResponseRow;
  currentUserName: string;
  emailClassName?: string;
  showNotes?: boolean;
}) {
  const [showModal, setShowModal] = useState(false);
  const alternateEmail = row.parent_alternate_email?.trim();
  const showAlternate = alternateEmail && alternateEmail.toLowerCase() !== row.parent_email.trim().toLowerCase();

  return (
    <div>
      <div className="text-slate-700">{row.parent_name}</div>
      <div className={`${emailClassName} text-slate-400`}>{row.parent_email}</div>
      {showAlternate && (
        <div className={`${emailClassName} text-slate-400`}>{alternateEmail}</div>
      )}
      {showNotes && (
        <div className="mt-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1">
          <div className="px-2 pt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Family Notes</div>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="mt-1 w-full rounded-md border border-sky-200 bg-white px-2 py-1 text-left text-[11px] text-slate-700 hover:bg-sky-50"
          >
            <div className="font-medium text-sky-700">Open notes</div>
            <div className="mt-0.5 line-clamp-2 text-slate-600">
              {row.customer_note ?? 'No notes yet. Click to add one.'}
            </div>
          </button>
          {showModal && (
            <CustomerNotesModal
              customerId={row.customer_id}
              customerName={row.parent_name}
              currentUserName={currentUserName}
              onClose={() => setShowModal(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}

function ResponseHistoryRows({ row, currentUserName }: { row: SummerResponseRow; currentUserName: string }) {
  if (row.submission_history.length === 0) return null;
  return (
    <tr className="bg-indigo-50/40">
      <td colSpan={11} className="px-3 py-3">
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
                  <th className="px-3 py-2">Current</th>
                  <th className="px-3 py-2">Summer</th>
                  <th className="px-3 py-2">Summer Sessions</th>
                  <th className="px-3 py-2">Pickup</th>
                  <th className="px-3 py-2">Fall</th>
                  <th className="px-3 py-2">Fall Sessions</th>
                  <th className="px-3 py-2">Notes</th>
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
                      <FamilyCell row={row} currentUserName={currentUserName} emailClassName="text-[11px]" showNotes={false} />
                    </td>
                    <td className="px-3 py-2 text-slate-500 whitespace-nowrap">
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
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                      {formatHistoryFallChoice(item, row)}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      <LabelListCell
                        labels={item.fall_session_labels}
                        emptyLabel={item.fall_status === 'same' ? 'Keeping current session' : '—'}
                      />
                      <WaitlistLabelsCell labels={item.fall_waitlist_session_labels} />
                    </td>
                    <td className="px-3 py-2 text-slate-500 max-w-[220px]">
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

export default function ResponsesTab({
  rows,
  stats,
  currentUserName,
}: {
  rows: SummerResponseRow[];
  stats: SummerStats;
  currentUserName: string;
}) {
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
  const familyResponsePercent = formatPercent(currentStats.responded_families, currentStats.total_families);
  const studentResponsePercent = formatPercent(currentStats.responded_students, currentStats.total_students);
  const reviewQueue = currentStats.pending + currentStats.needs_followup;
  const pendingEnrollingCount = useMemo(() => currentRows.filter(
    r => r.summer_status === 'enrolling' && r.status === 'pending',
  ).length, [currentRows]);

  return (
    <div className="space-y-4">
      {/* Response totals */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Families Responded"
          value={currentStats.responded_families}
          color="text-emerald-700"
          detail={`${familyResponsePercent} of ${currentStats.total_families} total - ${currentStats.parent_submitted} parent / ${currentStats.staff_submitted} internal - ${notRespondedFamilies} not responded`}
        />
        <StatCard
          label="Students Responded"
          value={currentStats.responded_students}
          color="text-emerald-700"
          detail={`${studentResponsePercent} of ${currentStats.total_students} expected - ${notRespondedStudents} not responded`}
        />
        <StatCard
          label="Review Queue"
          value={reviewQueue}
          color={currentStats.needs_followup > 0 ? 'text-red-600' : reviewQueue > 0 ? 'text-amber-600' : 'text-slate-800'}
          detail={`${currentStats.pending} pending - ${currentStats.needs_followup} followup`}
        />
        <StatCard
          label="Email Exported"
          value={currentStats.exported}
          detail="families whose link was exported"
        />
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
        <StatCard
          label="Waitlisted Students"
          value={currentStats.waitlisted_students}
          color={currentStats.waitlisted_students > 0 ? 'text-amber-700' : 'text-slate-800'}
          detail="summer or fall waitlist requests"
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
            { value: 'completed',             label: 'Approved' },
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
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">
                <th className="px-3 py-2">Student</th>
                <th className="px-3 py-2">Family</th>
                <th className="px-3 py-2">Summer Plan</th>
                <th className="px-3 py-2">Fall Plan</th>
                <th className="px-3 py-2">Current Enrolments</th>
                <th className="px-3 py-2">Recurring Invoices</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Submitted</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Added to Portal</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-3 py-6 text-center text-slate-400 text-sm">
                    No matching responses.
                  </td>
                </tr>
              ) : filtered.map(row => (
                <Fragment key={row.request_id}>
                <tr className="hover:bg-slate-50">
                  <td className="px-3 py-2 align-top min-w-[220px]">
                    <div className="space-y-1">
                      <StudentCell row={row} currentUserName={currentUserName} />
                      <UpdatedBadge
                        count={row.previous_submission_count}
                        expanded={expandedHistoryIds.has(row.request_id)}
                        onClick={() => toggleHistory(row.request_id)}
                      />
                    </div>
                  </td>
                  <td className="px-3 py-2 align-top min-w-[240px]">
                    <FamilyCell row={row} currentUserName={currentUserName} />
                  </td>
                  <td className="px-3 py-2 align-top min-w-[240px]">
                    <SummerPlanCell row={row} />
                  </td>
                  <td className="px-3 py-2 align-top min-w-[240px]">
                    <FallPlanCell row={row} />
                  </td>
                  <td className="px-3 py-2 align-top min-w-[260px]">
                    <CurrentEnrolmentsCell studentId={row.student_id} studentName={row.student_name} />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <RecurringInvoicesCell
                      invoices={row.recurring_invoices}
                      onChanged={(recurring_invoices) => patchResponse(row.request_id, { recurring_invoices })}
                    />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="px-3 py-2 align-top text-slate-400 whitespace-nowrap">
                    {formatDate(row.submitted_at)}
                  </td>
                  <td className="px-3 py-2 align-top whitespace-nowrap">
                    <SourceBadge source={row.submitted_by} name={row.submitted_by_name} />
                    <CsvExportStatus row={row} />
                  </td>
                  <td className="px-3 py-2 align-top whitespace-nowrap">
                    <AddedToPortalCell
                      addedAt={row.added_to_portal_at}
                      addedBy={row.added_to_portal_by}
                    />
                  </td>
                  <td className="px-3 py-2 align-top whitespace-nowrap">
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => setModalRow(row)}
                        className="text-xs px-2 py-1 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition"
                      >
                        {row.previous_submission_count > 0 ? 'Review Latest' : row.status === 'completed' ? 'Approve Again' : 'Review'}
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
                {expandedHistoryIds.has(row.request_id) && (
                  <ResponseHistoryRows row={row} currentUserName={currentUserName} />
                )}
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
