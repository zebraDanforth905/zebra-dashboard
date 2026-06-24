'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ClipboardDocumentIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import {
  assignCampLmsExpectedCourse,
  createCampLmsCanvasUser,
  refreshCampLmsWeek,
  runCampLmsCanvasTestAction,
  searchCampLmsCanvasCourses,
  syncCampLmsCanvasWeek,
  updateCampLmsStatus,
} from '@/app/lib/actions';
import type {
  CampLmsCanvasCourseCatalogItem,
  CampLmsCanvasIssue,
  CampLmsChecklistData,
  CampLmsChecklistRow,
  CampLmsStatus,
  CampLmsSuggestedAction,
} from '@/app/lib/definitions';

type Props = {
  startDate: string;
  endDate: string;
  checklist: CampLmsChecklistData;
};

const STATUS_OPTIONS: Array<{ value: CampLmsStatus; label: string; className: string }> = [
  { value: 'verified', label: 'Verified', className: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' },
  { value: 'missing_user', label: 'Missing user', className: 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100' },
  { value: 'missing_course', label: 'Missing course', className: 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100' },
  { value: 'needs_followup', label: 'Follow-up', className: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100' },
  { value: 'not_applicable', label: 'N/A', className: 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100' },
];

const STATUS_LABELS: Record<CampLmsStatus, string> = {
  verified: 'Verified',
  missing_user: 'Missing user',
  missing_course: 'Missing course',
  needs_followup: 'Needs follow-up',
  not_applicable: 'Not applicable',
};

const STATUS_BADGES: Record<CampLmsStatus, string> = {
  verified: 'bg-emerald-100 text-emerald-800',
  missing_user: 'bg-rose-100 text-rose-800',
  missing_course: 'bg-orange-100 text-orange-800',
  needs_followup: 'bg-amber-100 text-amber-800',
  not_applicable: 'bg-slate-100 text-slate-700',
};

const CANVAS_BADGES: Record<CampLmsCanvasIssue, string> = {
  ok: 'bg-emerald-100 text-emerald-800',
  not_synced: 'bg-slate-100 text-slate-700',
  unmapped_course: 'bg-orange-100 text-orange-800',
  needs_manual_course: 'bg-amber-100 text-amber-800',
  missing_canvas_user: 'bg-rose-100 text-rose-800',
  missing_expected_course: 'bg-amber-100 text-amber-800',
  inactive_expected_course: 'bg-violet-100 text-violet-800',
  extra_active_course: 'bg-sky-100 text-sky-800',
};

function formatDateTime(value: Date | string | null) {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Never';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function courseLabel(row: CampLmsChecklistRow) {
  return row.course_name && row.course_name !== row.course_id
    ? `${row.course_name} (${row.course_id ?? 'No ID'})`
    : row.course_id ?? 'No course ID';
}

function makeInitialNotes(rows: CampLmsChecklistRow[]) {
  return Object.fromEntries(
    rows.map((row) => [row.camp_enrolment_id, row.status_note ?? ''])
  );
}

function makeInitialAssignments(rows: CampLmsChecklistRow[]) {
  return Object.fromEntries(
    rows.map((row) => [row.camp_enrolment_id, row.assigned_catalog_course_id ?? ''])
  );
}

function makeChecklistText(rows: CampLmsChecklistRow[]) {
  const header = [
    'Student',
    'Student ID',
    'Suggested Login',
    'Canvas User',
    'Camp Course',
    'Expected Family',
    'Active Canvas Courses',
    'Inactive Canvas Courses',
    'Canvas Status',
    'Suggested Fix',
    'Office Status',
    'Office Note',
  ].join('\t');

  const body = rows.map((row) => [
    row.student_name,
    row.student_id,
    row.suggested_lms_login,
    row.canvas_user_login ?? row.canvas_user_name ?? 'NOT FOUND',
    courseLabel(row),
    row.canvas_course_family ?? 'UNMAPPED',
    row.active_canvas_enrollments.map((enrollment) => enrollment.course_name ?? enrollment.course_id).join(', '),
    row.inactive_canvas_enrollments.map((enrollment) => enrollment.course_name ?? enrollment.course_id).join(', '),
    row.canvas_status_label,
    row.suggested_fix,
    row.status ? STATUS_LABELS[row.status] : 'Unchecked',
    row.status_note ?? '',
  ].join('\t'));

  return [header, ...body].join('\n');
}

function EnrollmentList({ enrollments }: { enrollments: CampLmsChecklistRow['active_canvas_enrollments'] }) {
  if (enrollments.length === 0) {
    return <span className="text-xs text-slate-400">None</span>;
  }

  return (
    <div className="space-y-1">
      {enrollments.map((enrollment) => (
        <div key={enrollment.enrollment_id} className="text-xs leading-5 text-slate-700">
          <span className="font-medium">{enrollment.course_name ?? enrollment.course_id}</span>
          <span className="ml-1 text-slate-400">#{enrollment.course_id}</span>
        </div>
      ))}
    </div>
  );
}

function ExpectedCourses({ row }: { row: CampLmsChecklistRow }) {
  if (row.expected_canvas_courses.length === 0) {
    return (
      <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800">
        Unmapped
      </span>
    );
  }

  return (
    <div className="space-y-1 text-xs text-slate-700">
      <div className="font-medium text-slate-900">{row.canvas_course_family ?? row.lms_course_name ?? 'Mapped family'}</div>
      {row.expected_canvas_courses.map((course) => (
        <div key={`${course.level}-${course.course_id}`}>
          <span className="capitalize">{course.level}</span>
          <span className="ml-1 text-slate-500">#{course.course_id}</span>
          {course.course_name && <span className="ml-1 text-slate-600">{course.course_name}</span>}
          {course.requires_verification && (
            <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
              verify version
            </span>
          )}
        </div>
      ))}
      {row.assigned_at && (
        <div className="text-slate-500">
          Assigned {formatDateTime(row.assigned_at)}
          {row.assigned_by_name ? ` by ${row.assigned_by_name}` : ''}
        </div>
      )}
      {row.mapping_notes && <div className="text-slate-500">{row.mapping_notes}</div>}
      {row.assigned_canvas_notes && <div className="text-amber-700">{row.assigned_canvas_notes}</div>}
    </div>
  );
}

function catalogLabel(course: CampLmsCanvasCourseCatalogItem) {
  const code = course.canvas_course_code ? `${course.canvas_course_code} | ` : '';
  const version = course.version_label ? ` ${course.version_label}` : '';
  const verify = course.requires_verification ? ' | verify' : '';
  return `${code}${course.canvas_course_name}${version} (#${course.canvas_course_id})${verify}`;
}

function CanvasActionButton({
  action,
  row,
  disabled,
  onRun,
}: {
  action: CampLmsSuggestedAction;
  row: CampLmsChecklistRow;
  disabled: boolean;
  onRun: (row: CampLmsChecklistRow, action: CampLmsSuggestedAction) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onRun(row, action)}
      disabled={disabled}
      className="rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-medium text-sky-800 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
      title={action.canvas_course_name ?? action.canvas_course_id ?? action.canvas_enrollment_id}
    >
      {action.label}
    </button>
  );
}

export default function CampLmsChecklist({ startDate, endDate, checklist }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>(
    () => makeInitialNotes(checklist.rows)
  );
  const [assignmentDrafts, setAssignmentDrafts] = useState<Record<string, string>>(
    () => makeInitialAssignments(checklist.rows)
  );
  const [courseSearchTerm, setCourseSearchTerm] = useState('');
  const [courseSearchResults, setCourseSearchResults] = useState<Array<{
    id: string;
    name: string;
    course_code: string | null;
    workflow_state: string | null;
    total_students: number | null;
  }>>([]);

  const unmappedCourses = useMemo(() => {
    const courses = new Map<string, { courseId: string; label: string; count: number }>();

    checklist.rows.forEach((row) => {
      if (row.expected_canvas_course_ids.length > 0 || !row.course_id) return;

      const existing = courses.get(row.course_id);
      if (existing) {
        existing.count += 1;
      } else {
        courses.set(row.course_id, {
          courseId: row.course_id,
          label: courseLabel(row),
          count: 1,
        });
      }
    });

    return Array.from(courses.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [checklist.rows]);

  const rowsWithoutCourseId = checklist.rows.filter((row) => !row.course_id).length;
  const suggestedActionCount = checklist.rows.reduce((count, row) => count + row.suggested_actions.length, 0);

  const handleRefresh = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await refreshCampLmsWeek(startDate, endDate);
      if (!result.ok) {
        setMessage(result.error ?? 'Portal refresh failed.');
        return;
      }
      setMessage('Portal roster refreshed.');
      router.refresh();
    });
  };

  const handleSyncCanvas = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await syncCampLmsCanvasWeek(startDate, endDate);
      if (!result.ok) {
        setMessage(result.error ?? 'Canvas sync failed.');
        return;
      }
      const errorCount = result.errors?.length ?? 0;
      setMessage(errorCount > 0
        ? `Canvas sync finished for ${result.synced} row(s); ${errorCount} row(s) need attention.`
        : `Canvas sync finished for ${result.synced} row(s).`
      );
      router.refresh();
    });
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(makeChecklistText(checklist.rows));
      setMessage('Checklist copied.');
    } catch {
      setMessage('Could not copy checklist.');
    }
  };

  const handleAssignExpectedCourse = (row: CampLmsChecklistRow) => {
    const catalogCourseId = assignmentDrafts[row.camp_enrolment_id] || null;
    setMessage(null);
    startTransition(async () => {
      const result = await assignCampLmsExpectedCourse({
        campEnrolmentId: row.camp_enrolment_id,
        catalogCourseId,
      });
      if (!result.ok) {
        setMessage(result.error ?? 'Expected course assignment failed.');
        return;
      }
      setMessage(catalogCourseId ? 'Expected Canvas course assigned.' : 'Expected Canvas course cleared.');
      router.refresh();
    });
  };

  const handleCreateCanvasUser = (row: CampLmsChecklistRow) => {
    const confirmed = window.confirm(`Create Canvas LMS account for ${row.student_name} with login ${row.suggested_lms_login}?`);
    if (!confirmed) return;

    setMessage(null);
    startTransition(async () => {
      const result = await createCampLmsCanvasUser({
        campEnrolmentId: row.camp_enrolment_id,
      });
      if (!result.ok) {
        setMessage(result.error ?? 'Canvas user creation failed.');
        return;
      }
      setMessage(`Canvas account created. Login: ${result.login}. Password: ${result.password}. This password is shown once.`);
      router.refresh();
    });
  };

  const handleCourseSearch = () => {
    setMessage(null);
    setCourseSearchResults([]);
    startTransition(async () => {
      const result = await searchCampLmsCanvasCourses({ term: courseSearchTerm });
      if (!result.ok) {
        setMessage(result.error ?? 'Canvas course search failed.');
        return;
      }
      setCourseSearchResults(result.courses ?? []);
      setMessage(`Found ${result.courses?.length ?? 0} Canvas course candidate(s).`);
    });
  };

  const handleStatus = (row: CampLmsChecklistRow, status: CampLmsStatus | null) => {
    setMessage(null);
    startTransition(async () => {
      const result = await updateCampLmsStatus({
        enrolmentId: row.camp_enrolment_id,
        status,
        note: noteDrafts[row.camp_enrolment_id] ?? '',
      });
      if (!result.ok) {
        setMessage(result.error ?? 'Status update failed.');
        return;
      }
      setMessage(status ? 'LMS status updated.' : 'LMS status cleared.');
      router.refresh();
    });
  };

  const handleCanvasAction = (row: CampLmsChecklistRow, action: CampLmsSuggestedAction) => {
    const target = action.canvas_course_name ?? action.canvas_course_id ?? action.canvas_enrollment_id ?? 'Canvas';
    const confirmed = window.confirm(`Run audited Canvas action for ${row.student_name}: ${action.label} (${target})?`);
    if (!confirmed) return;

    setMessage(null);
    startTransition(async () => {
      const result = await runCampLmsCanvasTestAction({
        campEnrolmentId: row.camp_enrolment_id,
        type: action.type,
        canvasCourseId: action.canvas_course_id,
        canvasEnrollmentId: action.canvas_enrollment_id,
      });
      if (!result.ok) {
        setMessage(result.error ?? 'Canvas action failed.');
        return;
      }
      setMessage('Canvas action completed and audited.');
      router.refresh();
    });
  };

  return (
    <section className="mt-8 border-t border-slate-300 pt-6 print:hidden">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">LMS Checklist</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>Canvas: {checklist.canvas_base_url}</span>
            <span>|</span>
            <span>Last sync: {formatDateTime(checklist.canvas_last_synced_at)}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/camp/lms-course-mapping"
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            LMS Course Mapping
          </Link>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-md bg-slate-700 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <ArrowPathIcon className="h-4 w-4" />
            Refresh Portal
          </button>
          <button
            type="button"
            onClick={handleSyncCanvas}
            disabled={!checklist.schema_ready || !checklist.canvas_configured || isPending}
            className="inline-flex items-center gap-2 rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <ArrowPathIcon className="h-4 w-4" />
            Sync LMS
          </button>
          <button
            type="button"
            disabled
            className="inline-flex cursor-not-allowed items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-400"
          >
            <CheckCircleIcon className="h-4 w-4" />
            Add All Preview ({suggestedActionCount})
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <ClipboardDocumentIcon className="h-4 w-4" />
            Copy
          </button>
        </div>
      </div>

      {!checklist.schema_ready && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Apply migrations <span className="font-mono">024_lms_camp_checklist.sql</span>, <span className="font-mono">025_canvas_lms_workflow.sql</span>, and <span className="font-mono">026_rename_lms_status_note.sql</span>.
        </div>
      )}

      {checklist.schema_ready && !checklist.canvas_configured && (
        <div className="mt-4 flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 flex-none" />
          <span><span className="font-mono">CANVAS_API_TOKEN</span> is not configured.</span>
        </div>
      )}

      {message && (
        <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          {message}
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        {[
          ['Total', checklist.summary.total],
          ['Canvas OK', checklist.summary.canvas_ok],
          ['Not synced', checklist.summary.canvas_not_synced],
          ['Missing user', checklist.summary.canvas_missing_user],
          ['Missing course', checklist.summary.canvas_missing_course],
          ['Inactive expected', checklist.summary.canvas_inactive_expected],
          ['Extra active', checklist.summary.canvas_extra_active],
        ].map(([label, value]) => (
          <div key={label} className="rounded-md border border-slate-200 bg-white p-3">
            <div className="text-xs font-medium uppercase text-slate-500">{label}</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        {[
          ['Verified', checklist.summary.verified],
          ['Missing setup', checklist.summary.missing_setup],
          ['Follow-up', checklist.summary.needs_followup],
          ['Unmapped', checklist.summary.canvas_unmapped],
          ['Unchecked', checklist.summary.unchecked],
          ['N/A', checklist.summary.not_applicable],
          ['No course ID', rowsWithoutCourseId],
        ].map(([label, value]) => (
          <div key={label} className="rounded-md border border-slate-200 bg-white p-3">
            <div className="text-xs font-medium uppercase text-slate-500">{label}</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div>
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-md border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-72 flex-1">
            <span className="text-sm font-semibold text-slate-900">Canvas Course Lookup</span>
            <input
              value={courseSearchTerm}
              onChange={(event) => setCourseSearchTerm(event.target.value)}
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="Search Canvas by name or version, e.g. Python 1.1 or Minecraft 2.1"
              disabled={!checklist.canvas_configured || isPending}
            />
          </label>
          <button
            type="button"
            onClick={handleCourseSearch}
            disabled={!checklist.canvas_configured || isPending || courseSearchTerm.trim().length < 2}
            className="rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Search Canvas
          </button>
        </div>
        {courseSearchResults.length > 0 && (
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {courseSearchResults.map((course) => (
              <div key={course.id} className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                <div className="font-medium text-slate-900">{course.name}</div>
                <div className="mt-1">Canvas #{course.id}{course.course_code ? ` | ${course.course_code}` : ''}</div>
                <div className="text-slate-500">
                  {course.workflow_state ?? 'unknown state'}
                  {course.total_students == null ? '' : ` | ${course.total_students} student(s)`}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {(unmappedCourses.length > 0 || rowsWithoutCourseId > 0) && (
        <div className="mt-5 rounded-md border border-orange-200 bg-orange-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-orange-900">Camp Courses Needing Mapping Defaults</h3>
            <Link
              href="/dashboard/camp/lms-course-mapping"
              className="rounded-md bg-orange-600 px-3 py-2 text-sm font-medium text-white hover:bg-orange-700"
            >
              Fix in LMS Course Mapping
            </Link>
          </div>
          {rowsWithoutCourseId > 0 && (
            <p className="mt-2 text-sm text-orange-800">
              {rowsWithoutCourseId} camper row(s) have no portal course id.
            </p>
          )}
          {unmappedCourses.length > 0 && (
            <div className="mt-3 space-y-3">
              {unmappedCourses.map((course) => {
                return (
                  <div key={course.courseId} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-orange-200 bg-white p-3">
                    <div>
                      <div className="text-sm font-medium text-slate-900">{course.label}</div>
                      <div className="text-xs text-slate-500">
                        {course.count} camper row(s). Fill in the Canvas course IDs on the LMS Course Mapping page.
                      </div>
                    </div>
                    <Link
                      href="/dashboard/camp/lms-course-mapping"
                      className="rounded-md border border-orange-300 bg-orange-50 px-3 py-2 text-sm font-medium text-orange-800 hover:bg-orange-100"
                    >
                      Fix Mapping
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="mt-5 overflow-x-auto rounded-md border border-slate-200 bg-white">
        <table className="min-w-[1600px] w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Student</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Canvas User</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Camp Course</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Expected</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Active LMS</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Inactive LMS</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Canvas Status</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Suggested Fix</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Canvas Action</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Office</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {checklist.rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-slate-500">
                  No campers found for this week.
                </td>
              </tr>
            ) : (
              checklist.rows.map((row) => (
                <tr key={row.camp_enrolment_id} className="align-top">
                  <td className="px-3 py-3">
                    <div className="font-medium text-slate-900">{row.student_name}</div>
                    <div className="text-xs text-slate-500">ID {row.student_id}</div>
                    <div className="mt-1 font-mono text-xs text-slate-600">{row.suggested_lms_login}</div>
                  </td>
                  <td className="px-3 py-3">
                    {row.canvas_user_found ? (
                      <div className="space-y-1 text-xs text-slate-700">
                        <div className="font-medium text-slate-900">{row.canvas_user_name ?? row.canvas_user_login}</div>
                        <div>{row.canvas_user_login ?? row.canvas_user_email}</div>
                        <div className="text-slate-500">Canvas #{row.canvas_user_id}</div>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-800">
                          Not found
                        </span>
                        {row.canvas_sync_status === 'synced' && row.canvas_user_matches.length === 0 && (
                          <button
                            type="button"
                            onClick={() => handleCreateCanvasUser(row)}
                            disabled={!checklist.schema_ready || !checklist.canvas_configured || isPending}
                            className="block rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-800 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Create LMS Account
                          </button>
                        )}
                        {row.canvas_user_matches.length > 0 && (
                          <div className="text-xs text-slate-500">{row.canvas_user_matches.length} candidate(s)</div>
                        )}
                        {row.canvas_sync_error && (
                          <div className="max-w-48 text-xs text-rose-700">{row.canvas_sync_error}</div>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-slate-700">
                    <div>{courseLabel(row)}</div>
                    <div className="mt-1 text-xs text-slate-500">{row.camp_type}{row.extended_care ? ' EX' : ''}</div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="w-72 space-y-2">
                      <ExpectedCourses row={row} />
                      <div className="flex gap-1.5">
                        <select
                          value={assignmentDrafts[row.camp_enrolment_id] ?? ''}
                          onChange={(event) => setAssignmentDrafts((current) => ({
                            ...current,
                            [row.camp_enrolment_id]: event.target.value,
                          }))}
                          disabled={!checklist.schema_ready || isPending || checklist.course_catalog.length === 0}
                          className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs"
                        >
                          <option value="">Manual course choice</option>
                          {checklist.course_catalog.map((course) => (
                            <option key={course.id} value={course.id}>
                              {catalogLabel(course)}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => handleAssignExpectedCourse(row)}
                          disabled={!checklist.schema_ready || isPending}
                          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Save
                        </button>
                      </div>
                      {row.course_id && checklist.course_catalog.some((course) => course.suggested_portal_course_ids.includes(row.course_id ?? '')) && (
                        <div className="text-xs text-slate-500">
                          Suggested: {checklist.course_catalog
                            .filter((course) => course.suggested_portal_course_ids.includes(row.course_id ?? ''))
                            .slice(0, 3)
                            .map((course) => course.canvas_course_name)
                            .join(', ')}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <EnrollmentList enrollments={row.active_canvas_enrollments} />
                  </td>
                  <td className="px-3 py-3">
                    <EnrollmentList enrollments={row.inactive_canvas_enrollments} />
                  </td>
                  <td className="px-3 py-3">
                    <div className="space-y-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CANVAS_BADGES[row.canvas_status]}`}>
                        {row.canvas_status_label}
                      </span>
                      {row.canvas_issues.length > 1 && (
                        <div className="space-y-1">
                          {row.canvas_issues
                            .filter((issue) => issue !== row.canvas_status)
                            .map((issue) => (
                              <div key={issue} className="text-xs text-slate-500">
                                {issue.replaceAll('_', ' ')}
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="max-w-72 space-y-2 text-xs leading-5 text-slate-700">
                      <div>{row.suggested_fix}</div>
                      {(row.canvas_issues.includes('needs_manual_course') || row.canvas_issues.includes('unmapped_course')) && (
                        <Link
                          href="/dashboard/camp/lms-course-mapping"
                          className="inline-flex rounded-md border border-orange-200 bg-orange-50 px-2 py-1 font-medium text-orange-800 hover:bg-orange-100"
                        >
                          Fix in LMS Course Mapping
                        </Link>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    {row.suggested_actions.length === 0 ? (
                      <span className="text-xs text-slate-400">None</span>
                    ) : (
                      <div className="flex w-44 flex-wrap gap-1.5">
                        {row.suggested_actions.map((action) => (
                          <CanvasActionButton
                            key={`${action.type}-${action.canvas_course_id ?? ''}-${action.canvas_enrollment_id ?? ''}`}
                            action={action}
                            row={row}
                            disabled={!checklist.schema_ready || !checklist.canvas_configured || isPending}
                            onRun={handleCanvasAction}
                          />
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <div className="w-72 space-y-2">
                      {row.status ? (
                        <div className="space-y-1">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGES[row.status]}`}>
                            {STATUS_LABELS[row.status]}
                          </span>
                          <div className="text-xs text-slate-500">
                            {formatDateTime(row.checked_at)}
                            {row.checked_by_name ? ` by ${row.checked_by_name}` : ''}
                          </div>
                        </div>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                          Unchecked
                        </span>
                      )}
                      <textarea
                        value={noteDrafts[row.camp_enrolment_id] ?? ''}
                        onChange={(event) => setNoteDrafts((current) => ({
                          ...current,
                          [row.camp_enrolment_id]: event.target.value,
                        }))}
                        rows={2}
                        className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                        placeholder="Office note"
                        disabled={!checklist.schema_ready || isPending}
                      />
                      <div className="flex flex-wrap gap-1.5">
                        {STATUS_OPTIONS.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => handleStatus(row, option.value)}
                            disabled={!checklist.schema_ready || isPending}
                            className={`rounded-md border px-2 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 ${option.className}`}
                          >
                            {option.label}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => handleStatus(row, null)}
                          disabled={!checklist.schema_ready || isPending}
                          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
