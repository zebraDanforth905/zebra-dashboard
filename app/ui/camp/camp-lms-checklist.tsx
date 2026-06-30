'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ClipboardDocumentIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import {
  refreshCampLmsWeek,
  runCampLmsCanvasTestAction,
  saveCanvasApiToken,
  searchCampLmsCanvasCourses,
  syncCampLmsCanvasWeek,
  updatePaDayCampAssignment,
} from '@/app/lib/actions';
import Link from 'next/link';
import type {
  CampLmsCanvasActionType,
  CampLmsCanvasCourseSearchResult,
  CampLmsCanvasEnrollment,
  CampLmsChecklistData,
  CampLmsChecklistRow,
  CampLmsSuggestedAction,
} from '@/app/lib/definitions';

type Props = {
  startDate: string;
  endDate: string;
  scopeLabel: string;
  checklist: CampLmsChecklistData;
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

function originalCourseLabel(row: CampLmsChecklistRow) {
  return row.original_course_name && row.original_course_name !== row.original_course_id
    ? row.original_course_name
    : row.original_course_id ?? 'Day Camp';
}

function isManualDayCamp(row: CampLmsChecklistRow) {
  return row.is_day_camp && !row.day_camp_assigned_course_id;
}

function expectedMappingLabel(row: CampLmsChecklistRow) {
  if (isManualDayCamp(row)) return 'Manual';
  if (row.expected_canvas_courses.length === 0) return 'UNMAPPED';

  return row.expected_canvas_courses
    .map((course) => course.course_name ? `${course.course_name} (#${course.course_id})` : `#${course.course_id}`)
    .join(', ');
}

function lmsSummaryCards(checklist: CampLmsChecklistData) {
  const cards = [
    {
      label: 'Total LMS Students',
      value: checklist.summary.total,
      hint: 'Unique campers this week',
    },
    {
      label: 'Create LMS Accounts',
      value: checklist.summary.lms_accounts_needed,
      hint: 'Synced rows with no Canvas user',
    },
  ];

  if (checklist.summary.day_camp_total > 0) {
    cards.push({
      label: 'Assign Day Camp',
      value: checklist.summary.day_camp_assignments_needed,
      hint: 'Day Camp campers missing a camp',
    });
  }

  cards.push(
    {
      label: 'Map Assigned Camps',
      value: checklist.summary.unmapped_assigned_camps,
      hint: 'Camp assignments without LMS mapping',
    },
    {
      label: 'Fix LMS Courses',
      value: checklist.summary.lms_course_fixes_needed,
      hint: 'Add, reactivate, or remove courses',
    }
  );

  return cards;
}

function syncErrorMessage(error: string) {
  return `Press "Sync LMS" to refresh this Canvas status. Last error: ${error}`;
}

function uniqueRowsBy(
  rows: CampLmsChecklistRow[],
  keyForRow: (row: CampLmsChecklistRow) => string
) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = keyForRow(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function makeChecklistText(rows: CampLmsChecklistRow[]) {
  const header = [
    'Student',
    'Student ID',
    'Suggested Login',
    'Canvas User',
    'Camp Course',
    'Expected Mapping',
    'Active Canvas Courses',
    'Inactive Canvas Courses',
  ].join('\t');

  const body = rows.map((row) => [
    row.student_name,
    row.student_id,
    row.suggested_lms_login,
    row.canvas_user_login ?? row.canvas_user_name ?? 'NOT FOUND',
    courseLabel(row),
    expectedMappingLabel(row),
    row.active_canvas_enrollments.map((enrollment) => enrollment.course_name ?? enrollment.course_id).join(', '),
    row.inactive_canvas_enrollments.map((enrollment) => enrollment.course_name ?? enrollment.course_id).join(', '),
  ].join('\t'));

  return [header, ...body].join('\n');
}

function EnrollmentList({
  enrollments,
  actionLabel,
  actionType,
  disabled,
  onRun,
  expanded,
  onToggleExpanded,
  canRun,
}: {
  enrollments: CampLmsCanvasEnrollment[];
  actionLabel?: string;
  actionType?: CampLmsCanvasActionType;
  disabled?: boolean;
  onRun?: (enrollment: CampLmsCanvasEnrollment) => void;
  expanded: boolean;
  onToggleExpanded: () => void;
  canRun?: (enrollment: CampLmsCanvasEnrollment) => boolean;
}) {
  if (enrollments.length === 0) {
    return <span className="text-xs text-slate-400">None</span>;
  }

  const visibleEnrollments = expanded ? enrollments : enrollments.slice(0, 3);
  const hiddenCount = enrollments.length - visibleEnrollments.length;

  return (
    <div className="space-y-1">
      {visibleEnrollments.map((enrollment) => (
        <div key={enrollment.enrollment_id} className="space-y-1 rounded-md border border-slate-100 bg-slate-50 p-2 text-xs leading-5 text-slate-700">
          <div>
            <span className="font-medium">{enrollment.course_name ?? enrollment.course_id}</span>
            <span className="ml-1 text-slate-400">#{enrollment.course_id}</span>
          </div>
          {actionLabel && actionType && onRun && (!canRun || canRun(enrollment)) && (
            <button
              type="button"
              onClick={() => onRun(enrollment)}
              disabled={disabled}
              data-lms-action={actionType}
              data-lms-course-id={enrollment.course_id}
              data-lms-enrollment-id={enrollment.enrollment_id}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              title={`${actionLabel} ${enrollment.course_name ?? enrollment.course_id}`}
            >
              {actionLabel}
            </button>
          )}
        </div>
      ))}
      {enrollments.length > 3 && (
        <button
          type="button"
          onClick={onToggleExpanded}
          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          {expanded ? 'Show less' : `Show ${hiddenCount} more`}
        </button>
      )}
    </div>
  );
}

function ExpectedCourses({
  row,
  addExpectedAction,
  disabled,
  onRun,
}: {
  row: CampLmsChecklistRow;
  addExpectedAction?: CampLmsSuggestedAction;
  disabled: boolean;
  onRun: (row: CampLmsChecklistRow, action: CampLmsSuggestedAction) => void;
}) {
  if (row.expected_canvas_courses.length === 0) {
    if (isManualDayCamp(row)) {
      return (
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
          Manual
        </span>
      );
    }

    return (
      <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800">
        Unmapped
      </span>
    );
  }

  return (
    <div className="space-y-1 text-xs text-slate-700">
      <div className="font-medium text-slate-900">{row.lms_course_name ?? row.course_name ?? 'Mapped Canvas course'}</div>
      {row.expected_canvas_courses.map((course) => (
        <div key={`${course.level}-${course.course_id}`}>
          <span className="capitalize">{course.level}</span>
          <span className="ml-1 text-slate-500">#{course.course_id}</span>
          {course.course_name && <span className="ml-1 text-slate-600">{course.course_name}</span>}
        </div>
      ))}
      {row.mapping_notes && <div className="text-slate-500">{row.mapping_notes}</div>}
      {row.inactive_expected_enrollments.length > 0 && (
        <div className="text-violet-700">Expected course is inactive. Use Make active.</div>
      )}
      {addExpectedAction && (
        <div className="pt-1">
          <CanvasActionButton
            action={addExpectedAction}
            row={row}
            disabled={disabled}
            onRun={onRun}
          />
        </div>
      )}
    </div>
  );
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
      data-lms-action={action.type}
      data-lms-course-id={action.canvas_course_id}
      data-lms-enrollment-id={action.canvas_enrollment_id}
      className="rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-medium text-sky-800 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
      title={action.canvas_course_name ?? action.canvas_course_id ?? action.canvas_enrollment_id}
    >
      {action.label}
    </button>
  );
}

export default function CampLmsChecklist({ startDate, endDate, scopeLabel, checklist }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [courseSearchTerms, setCourseSearchTerms] = useState<Record<string, string>>({});
  const [courseSearchResults, setCourseSearchResults] = useState<Record<string, CampLmsCanvasCourseSearchResult[]>>({});
  const [selectedCourseIds, setSelectedCourseIds] = useState<Record<string, string>>({});
  const [dayCampDrafts, setDayCampDrafts] = useState<Record<string, string>>({});
  const [expandedEnrollments, setExpandedEnrollments] = useState<Record<string, boolean>>({});
  const [canvasTokenDraft, setCanvasTokenDraft] = useState('');
  const [isSavingCanvasToken, setIsSavingCanvasToken] = useState(false);

  const unmappedCourses = useMemo(() => {
    const courses = new Map<string, { courseId: string; label: string; count: number }>();

    checklist.rows.forEach((row) => {
      if (row.expected_canvas_course_ids.length > 0 || !row.course_id || isManualDayCamp(row)) return;

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
  const showCanvasTokenPrompt = checklist.schema_ready && (!checklist.canvas_configured || !checklist.canvas_token_ok);
  const canvasTokenLooksGood = checklist.schema_ready && checklist.canvas_configured && checklist.canvas_token_ok;
  const addExpectedActionFor = (row: CampLmsChecklistRow) =>
    row.suggested_actions.find((action) => action.type === 'add_expected_beginner');
  const rowsNeedingLmsAccount = uniqueRowsBy(
    checklist.rows.filter((row) =>
      row.canvas_sync_status === 'synced'
      && !row.canvas_user_found
      && row.canvas_user_matches.length === 0
    ),
    (row) => row.suggested_lms_login || row.student_id
  );
  const rowsNeedingExpectedCourse = uniqueRowsBy(
    checklist.rows.filter((row) =>
      row.canvas_user_found && Boolean(addExpectedActionFor(row))
    ),
    (row) => {
      const action = addExpectedActionFor(row);
      return `${row.canvas_user_id ?? row.student_id}:${action?.canvas_course_id ?? row.course_id ?? row.camp_enrolment_id}`;
    }
  );
  const resolveAllCount = rowsNeedingLmsAccount.length + rowsNeedingExpectedCourse.length;
  const tokenSourceLabel =
    checklist.canvas_token_source === 'environment'
      ? 'environment variable'
      : checklist.canvas_token_source === 'database'
        ? 'dashboard setting'
        : 'not configured';
  const refreshChecklistView = () => {
    router.refresh();
    window.setTimeout(() => router.refresh(), 750);
  };

  const handleCanvasTokenSave = async (formData: FormData) => {
    setIsSavingCanvasToken(true);
    setMessage(null);
    console.debug('[canvas token save] submitting token save', {
      draftLength: canvasTokenDraft.trim().length,
      currentSource: checklist.canvas_token_source,
      currentMaskedToken: checklist.canvas_masked_token,
    });

    const result = await saveCanvasApiToken(formData);
    console.debug('[canvas token save] result', result);
    if (!result.ok) {
      setMessage(result.error ?? 'Canvas API token save failed.');
      setIsSavingCanvasToken(false);
      return;
    }

    setCanvasTokenDraft('');
    setMessage(result.message ?? 'Canvas API token saved. Press "Sync LMS" to refresh Canvas status.');
    setIsSavingCanvasToken(false);
    refreshChecklistView();
  };

  const handleRefresh = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await refreshCampLmsWeek(startDate, endDate);
      if (!result.ok) {
        setMessage(result.error ?? 'Portal refresh failed.');
        return;
      }
      setMessage('Portal roster refreshed.');
      refreshChecklistView();
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
      refreshChecklistView();
    });
  };

  const handleResolveAllLmsAccounts = () => {
    if (resolveAllCount === 0) {
      setMessage('No LMS accounts or expected courses need automatic fixes.');
      return;
    }

    const confirmed = window.confirm(
      `Resolve ${resolveAllCount} LMS item(s)? This will create missing Canvas users and add expected LMS courses where the mapping is ready.`
    );
    if (!confirmed) return;

    setMessage(null);
    startTransition(async () => {
      let createdUsers = 0;
      let addedExpectedCourses = 0;
      const errors: string[] = [];

      for (const row of rowsNeedingLmsAccount) {
        const result = await runCampLmsCanvasTestAction({
          campEnrolmentId: row.camp_enrolment_id,
          type: 'create_user',
          startDate,
          endDate,
        });
        if (result.ok) {
          createdUsers += 1;
        } else {
          errors.push(`${row.student_name}: ${result.error ?? 'Create LMS user failed'}`);
        }
      }

      for (const row of rowsNeedingExpectedCourse) {
        const action = addExpectedActionFor(row);
        if (!action) continue;

        const result = await runCampLmsCanvasTestAction({
          campEnrolmentId: row.camp_enrolment_id,
          type: action.type,
          canvasCourseId: action.canvas_course_id,
          canvasEnrollmentId: action.canvas_enrollment_id,
          startDate,
          endDate,
        });
        if (result.ok) {
          addedExpectedCourses += 1;
        } else {
          errors.push(`${row.student_name}: ${result.error ?? 'Add expected course failed'}`);
        }
      }

      const summary = `Resolved LMS accounts: ${createdUsers} user setup(s) run, ${addedExpectedCourses} existing user course(s) added.`;
      setMessage(errors.length > 0
        ? `${summary} ${errors.length} issue(s): ${errors.slice(0, 3).join(' | ')}`
        : summary
      );
      refreshChecklistView();
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

  const enrollmentListKey = (row: CampLmsChecklistRow, kind: 'active' | 'inactive') =>
    `${row.camp_enrolment_id}:${kind}`;

  const toggleEnrollmentList = (row: CampLmsChecklistRow, kind: 'active' | 'inactive') => {
    const key = enrollmentListKey(row, kind);
    setExpandedEnrollments((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  const dayCampDraftFor = (row: CampLmsChecklistRow) =>
    dayCampDrafts[row.camp_enrolment_id] ?? row.day_camp_assigned_course_id ?? '';

  const handleDayCampAssignment = (row: CampLmsChecklistRow) => {
    const assignedCourseId = dayCampDraftFor(row) || null;

    setMessage(null);
    startTransition(async () => {
      const result = await updatePaDayCampAssignment({
        campEnrolmentId: row.camp_enrolment_id,
        assignedCourseId,
      });

      if (!result.ok) {
        setMessage(result.error ?? 'Day Camp assignment failed.');
        return;
      }

      setDayCampDrafts((current) => ({
        ...current,
        [row.camp_enrolment_id]: assignedCourseId ?? '',
      }));
      setMessage(
        assignedCourseId
          ? 'Day Camp assignment saved.'
          : 'Day Camp assignment cleared.'
      );
      router.refresh();
    });
  };

  const renderCampCourse = (row: CampLmsChecklistRow) => {
    if (!row.is_day_camp) {
      return (
        <>
          <div>{courseLabel(row)}</div>
          <div className="mt-1 text-xs text-slate-500">{row.camp_type}{row.extended_care ? ' EX' : ''}</div>
        </>
      );
    }

    const draftValue = dayCampDraftFor(row);
    const currentValue = row.day_camp_assigned_course_id ?? '';
    const canSave = draftValue !== currentValue;
    const draftOption = checklist.day_camp_course_options.find((course) => course.id === draftValue);
    const visibleCourseName = draftOption?.label ?? row.day_camp_assigned_course_name ?? row.course_name ?? 'Day Camp';

    return (
      <div className="w-72 space-y-1.5">
        <div className="font-medium text-slate-900">
          {visibleCourseName}
        </div>
        <div className="text-xs text-slate-500">
          {row.camp_type}{row.extended_care ? ' EX' : ''} · Portal: {originalCourseLabel(row)}
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-1.5">
          <select
            value={draftValue}
            onChange={(event) =>
              setDayCampDrafts((current) => ({
                ...current,
                [row.camp_enrolment_id]: event.target.value,
              }))
            }
            disabled={isPending || !checklist.schema_ready}
            className="min-w-0 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 disabled:bg-slate-100"
          >
            <option value="">Assign camp</option>
            {checklist.day_camp_course_options.map((course) => (
              <option key={course.id} value={course.id}>
                {course.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => handleDayCampAssignment(row)}
            disabled={isPending || !checklist.schema_ready || !canSave}
            className="rounded-md bg-sky-600 px-2 py-1 text-xs font-medium text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save
          </button>
        </div>
        {draftValue ? (
          <div className="text-xs text-slate-600">Effective: {visibleCourseName}</div>
        ) : (
          <div className="text-xs text-amber-700">Camp assignment needed</div>
        )}
      </div>
    );
  };

  const handleCanvasAction = (row: CampLmsChecklistRow, action: CampLmsSuggestedAction) => {
    const target = action.canvas_course_name ?? action.canvas_course_id ?? action.canvas_enrollment_id ?? 'Canvas';
    const confirmation =
      action.type === 'add_expected_beginner'
        ? `Add the expected LMS course for ${row.student_name}: ${target}?`
        : `Run Canvas action for ${row.student_name}: ${action.label} (${target})?`;
    const confirmed = window.confirm(confirmation);
    if (!confirmed) return;

    setMessage(null);
    startTransition(async () => {
      const result = await runCampLmsCanvasTestAction({
        campEnrolmentId: row.camp_enrolment_id,
        type: action.type,
        canvasCourseId: action.canvas_course_id,
        canvasEnrollmentId: action.canvas_enrollment_id,
        startDate,
        endDate,
      });
      if (!result.ok) {
        setMessage(result.error ?? 'Canvas test action failed.');
        return;
      }
      setMessage(
        action.type === 'add_expected_beginner'
          ? 'Expected LMS course added and synced.'
          : 'Canvas action completed and synced.'
      );
      refreshChecklistView();
    });
  };

  const handleCanvasEnrollmentAction = (
    row: CampLmsChecklistRow,
    type: CampLmsCanvasActionType,
    enrollment: CampLmsCanvasEnrollment
  ) => {
    const label = type === 'activate_course' ? 'set active' : 'set inactive';
    const target = enrollment.course_name ?? enrollment.course_id;
    const confirmed = window.confirm(`Canvas write for ${row.student_name}: ${label} ${target}?`);
    if (!confirmed) return;

    setMessage(null);
    startTransition(async () => {
      const result = await runCampLmsCanvasTestAction({
        campEnrolmentId: row.camp_enrolment_id,
        type,
        canvasCourseId: enrollment.course_id,
        canvasEnrollmentId: enrollment.enrollment_id,
        startDate,
        endDate,
      });
      if (!result.ok) {
        setMessage(result.error ?? 'Canvas course update failed.');
        return;
      }
      setMessage(type === 'activate_course' ? 'Canvas course set active.' : 'Canvas course set inactive.');
      refreshChecklistView();
    });
  };

  const handleSearchCourses = (row: CampLmsChecklistRow) => {
    const term = courseSearchTerms[row.camp_enrolment_id]?.trim() ?? '';
    if (term.length < 2) {
      setMessage('Search with at least 2 characters.');
      return;
    }

    setMessage(null);
    startTransition(async () => {
      const result = await searchCampLmsCanvasCourses({ term });
      if (!result.ok) {
        setMessage(result.error ?? 'LMS course search failed.');
        return;
      }

      setCourseSearchResults((current) => ({
        ...current,
        [row.camp_enrolment_id]: result.courses,
      }));
      setMessage(result.courses.length === 0 ? 'No LMS courses found.' : `Found ${result.courses.length} LMS course(s).`);
    });
  };

  const handleAddSelectedCourse = (row: CampLmsChecklistRow) => {
    const canvasCourseId = selectedCourseIds[row.camp_enrolment_id]?.trim();
    if (!canvasCourseId) {
      setMessage('Search for and select an LMS course before adding it.');
      return;
    }

    const confirmed = window.confirm(`Canvas write for ${row.student_name}: add course ${canvasCourseId} as active if it is not already on their account?`);
    if (!confirmed) return;

    setMessage(null);
    startTransition(async () => {
      const result = await runCampLmsCanvasTestAction({
        campEnrolmentId: row.camp_enrolment_id,
        type: 'activate_course',
        canvasCourseId,
        startDate,
        endDate,
      });
      if (!result.ok) {
        setMessage(result.error ?? 'Canvas course add failed.');
        return;
      }
      setCourseSearchTerms((current) => ({ ...current, [row.camp_enrolment_id]: '' }));
      setCourseSearchResults((current) => ({ ...current, [row.camp_enrolment_id]: [] }));
      setSelectedCourseIds((current) => ({ ...current, [row.camp_enrolment_id]: '' }));
      setMessage('Canvas course added as active.');
      refreshChecklistView();
    });
  };

  const handleCreateUser = (row: CampLmsChecklistRow) => {
    const confirmed = window.confirm(
      `Create a Canvas user for ${row.student_name} with login ${row.suggested_lms_login}?`
    );
    if (!confirmed) return;

    setMessage(null);
    startTransition(async () => {
      const result = await runCampLmsCanvasTestAction({
        campEnrolmentId: row.camp_enrolment_id,
        type: 'create_user',
        startDate,
        endDate,
      });
      if (!result.ok) {
        setMessage(result.error ?? 'Canvas user creation failed.');
        return;
      }
      setMessage('warning' in result && result.warning ? result.warning : 'Canvas user created and synced.');
      refreshChecklistView();
    });
  };

  return (
    <section className="mt-8 border-t border-slate-300 pt-6 print:hidden">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">LMS Checklist</h2>
          <p className="mt-1 text-sm text-slate-600">{scopeLabel}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>Canvas: {checklist.canvas_base_url}</span>
            <span>|</span>
            <span>Last sync: {formatDateTime(checklist.canvas_last_synced_at)}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
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
            onClick={handleResolveAllLmsAccounts}
            disabled={!checklist.schema_ready || !checklist.canvas_configured || isPending || resolveAllCount === 0}
            className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Resolve LMS Accounts
            {resolveAllCount > 0 && <span className="rounded bg-white/20 px-1.5 py-0.5 text-xs">{resolveAllCount}</span>}
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <ClipboardDocumentIcon className="h-4 w-4" />
            Copy
          </button>
          <Link
            href="/dashboard/camp/lms-mappings"
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            LMS Custom Mapping
          </Link>
        </div>
      </div>

      {!checklist.schema_ready && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Apply migrations <span className="font-mono">025_lms_camp_checklist.sql</span>, <span className="font-mono">026_canvas_lms_workflow.sql</span>, <span className="font-mono">027_rename_lms_status_note.sql</span>, <span className="font-mono">030_lms_canvas_activate_course_action.sql</span>, <span className="font-mono">032_lms_mapping_additional_courses.sql</span>, <span className="font-mono">040_pa_day_camp_course_assignments.sql</span>, <span className="font-mono">041_lms_canvas_create_user_action.sql</span>, and <span className="font-mono">042_rename_lms_canvas_sync_state.sql</span>.
        </div>
      )}

      {(showCanvasTokenPrompt || canvasTokenLooksGood) && (
        <div className={
          canvasTokenLooksGood
            ? "mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"
            : "mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
        }>
          <div className="flex gap-2">
            {canvasTokenLooksGood ? (
              <CheckCircleIcon className="mt-0.5 h-4 w-4 flex-none" />
            ) : (
              <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 flex-none" />
            )}
            <div className="min-w-0 flex-1">
              <div className="font-medium">
                {canvasTokenLooksGood
                  ? 'Canvas API token is good.'
                  : checklist.canvas_configured
                  ? 'Canvas API token is not working.'
                  : 'Canvas API token is not configured.'}
              </div>
              <div className={canvasTokenLooksGood ? "mt-1 text-emerald-800" : "mt-1 text-amber-800"}>
                Current source: {tokenSourceLabel}
                {checklist.canvas_masked_token ? ` (${checklist.canvas_masked_token})` : ''}.
                {canvasTokenLooksGood
                  ? ' Canvas sync can read from the configured token.'
                  : ' Paste a valid Canvas token here, save it, then press "Sync LMS".'}
              </div>
              {checklist.canvas_token_source === 'environment' && (
                <div className={canvasTokenLooksGood ? "mt-1 text-xs text-emerald-800" : "mt-1 text-xs text-amber-800"}>
                  The server environment token currently takes precedence over dashboard-saved tokens. To use a dashboard-saved token, remove CANVAS_API_TOKEN from the running server environment and restart.
                </div>
              )}
              {showCanvasTokenPrompt && (
                <>
                  {checklist.canvas_token_error && (
                    <div className="mt-2 rounded border border-amber-200 bg-white/60 px-2 py-1 text-xs font-medium text-amber-900">
                      Last token test: {checklist.canvas_token_error}
                    </div>
                  )}
                  <ol className="mt-2 list-decimal space-y-0.5 pl-4 text-xs text-amber-800">
                    <li>Go to LMS.</li>
                    <li>Open Settings.</li>
                    <li>Click + New Access Token.</li>
                    <li>Click Create.</li>
                    <li>Copy the long token into this dashboard field.</li>
                  </ol>
                  <form action={handleCanvasTokenSave} className="mt-3 flex flex-wrap gap-2">
                    <input
                      type="password"
                      name="canvasApiToken"
                      value={canvasTokenDraft}
                      onChange={(event) => setCanvasTokenDraft(event.target.value)}
                      placeholder="Paste Canvas API token"
                      disabled={isSavingCanvasToken || isPending}
                      autoComplete="off"
                      className="min-w-[260px] flex-1 rounded-md border border-amber-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-slate-100"
                    />
                    <button
                      type="submit"
                      name="intent"
                      value="save"
                      disabled={isSavingCanvasToken || isPending || canvasTokenDraft.trim().length === 0}
                      className="rounded-md bg-amber-700 px-3 py-2 text-sm font-medium text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isSavingCanvasToken ? 'Saving...' : 'Save Canvas Token'}
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {message && (
        <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          {message}
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {lmsSummaryCards(checklist).map((card) => (
          <div key={card.label} className="rounded-md border border-slate-200 bg-white p-3">
            <div className="text-xs font-medium uppercase text-slate-500">{card.label}</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">{card.value}</div>
            <div className="mt-1 text-xs text-slate-500">{card.hint}</div>
          </div>
        ))}
      </div>

      {(unmappedCourses.length > 0 || rowsWithoutCourseId > 0) && (
        <div className="mt-5 rounded-md border border-orange-200 bg-orange-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-orange-900">Assigned Camps Missing LMS Mapping</h3>
            <Link
              href="/dashboard/camp/lms-mappings"
              className="rounded-md bg-orange-600 px-3 py-2 text-sm font-medium text-white hover:bg-orange-700"
            >
              Edit LMS Mapping
            </Link>
          </div>
          {rowsWithoutCourseId > 0 && (
            <p className="mt-2 text-sm text-orange-800">
              {rowsWithoutCourseId} camper row(s) have no assigned camp course id.
            </p>
          )}
          {unmappedCourses.length > 0 && (
            <div className="mt-3 grid gap-2 md:grid-cols-2 lg:grid-cols-3">
              {unmappedCourses.map((course) => (
                <div key={course.courseId} className="rounded-md border border-orange-200 bg-white p-3">
                  <div className="text-sm font-medium text-slate-900">{course.label}</div>
                  <div className="text-xs text-slate-500">{course.count} camper row(s)</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-5 overflow-x-auto rounded-md border border-slate-200 bg-white">
        <table className="min-w-[1250px] w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Student</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Canvas User</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Camp Course</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Expected</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Active LMS</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Inactive LMS</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Add Course</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {checklist.rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                  No campers found for this week.
                </td>
              </tr>
            ) : (
              checklist.rows.map((row) => (
                <tr
                  key={row.camp_enrolment_id}
                  className="align-top"
                  data-camp-enrolment-id={row.camp_enrolment_id}
                  data-student-id={row.student_id}
                >
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
                          {row.canvas_sync_status === 'synced'
                            ? 'Not found'
                            : row.canvas_sync_status === 'error'
                              ? 'Sync error'
                              : 'Not synced'}
                        </span>
                        {row.canvas_user_matches.length > 0 && (
                          <div className="text-xs text-slate-500">{row.canvas_user_matches.length} candidate(s)</div>
                        )}
                        {row.canvas_sync_error && (
                          <div className="max-w-48 text-xs text-rose-700">{syncErrorMessage(row.canvas_sync_error)}</div>
                        )}
                        <div className="font-mono text-xs text-slate-600">{row.suggested_lms_login}</div>
                        {row.canvas_user_matches.length === 0 ? (
                          <button
                            type="button"
                            onClick={() => handleCreateUser(row)}
                            disabled={!checklist.schema_ready || !checklist.canvas_configured || isPending}
                            data-lms-action="create_user"
                            className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Create LMS user
                          </button>
                        ) : (
                          <div className="max-w-48 text-xs text-slate-500">
                            Review candidate matches before creating a new user.
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-slate-700">
                    {renderCampCourse(row)}
                  </td>
                  <td className="px-3 py-3">
                    <ExpectedCourses
                      row={row}
                      addExpectedAction={addExpectedActionFor(row)}
                      disabled={!checklist.schema_ready || !checklist.canvas_configured || isPending}
                      onRun={handleCanvasAction}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <EnrollmentList
                      enrollments={row.active_canvas_enrollments}
                      actionLabel="Make inactive"
                      actionType="inactivate_enrollment"
                      disabled={!checklist.schema_ready || !checklist.canvas_configured || isPending}
                      onRun={(enrollment) => handleCanvasEnrollmentAction(row, 'inactivate_enrollment', enrollment)}
                      expanded={Boolean(expandedEnrollments[enrollmentListKey(row, 'active')])}
                      onToggleExpanded={() => toggleEnrollmentList(row, 'active')}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <EnrollmentList
                      enrollments={row.inactive_canvas_enrollments}
                      actionLabel="Make active"
                      actionType="activate_course"
                      disabled={!checklist.schema_ready || !checklist.canvas_configured || isPending}
                      onRun={(enrollment) => handleCanvasEnrollmentAction(row, 'activate_course', enrollment)}
                      expanded={Boolean(expandedEnrollments[enrollmentListKey(row, 'inactive')])}
                      onToggleExpanded={() => toggleEnrollmentList(row, 'inactive')}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <div className="w-64 space-y-2">
                      <div className="space-y-1.5">
                        <div className="flex gap-1.5">
                        <input
                          value={courseSearchTerms[row.camp_enrolment_id] ?? ''}
                          onChange={(event) => setCourseSearchTerms((current) => ({
                            ...current,
                            [row.camp_enrolment_id]: event.target.value,
                          }))}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              handleSearchCourses(row);
                            }
                          }}
                          placeholder="Search LMS course"
                          className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs"
                          disabled={!checklist.schema_ready || !checklist.canvas_configured || !row.canvas_user_found || isPending}
                        />
                        <button
                          type="button"
                          onClick={() => handleSearchCourses(row)}
                          disabled={!checklist.schema_ready || !checklist.canvas_configured || !row.canvas_user_found || isPending}
                          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Search
                        </button>
                        </div>
                        {(courseSearchResults[row.camp_enrolment_id] ?? []).length > 0 && (
                          <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border border-slate-200 bg-slate-50 p-1">
                            {(courseSearchResults[row.camp_enrolment_id] ?? []).map((course) => {
                              const selected = selectedCourseIds[row.camp_enrolment_id] === course.id;
                              return (
                                <button
                                  key={course.id}
                                  type="button"
                                  onClick={() => setSelectedCourseIds((current) => ({
                                    ...current,
                                    [row.camp_enrolment_id]: course.id,
                                  }))}
                                  className={`block w-full rounded px-2 py-1 text-left text-xs ${
                                    selected
                                      ? 'bg-sky-100 text-sky-900'
                                      : 'bg-white text-slate-700 hover:bg-slate-100'
                                  }`}
                                >
                                  <span className="block font-medium">{course.name ?? course.course_code ?? `Course ${course.id}`}</span>
                                  <span className="block text-slate-500">#{course.id}{course.course_code ? ` · ${course.course_code}` : ''}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => handleAddSelectedCourse(row)}
                          disabled={!checklist.schema_ready || !checklist.canvas_configured || !row.canvas_user_found || isPending || !selectedCourseIds[row.camp_enrolment_id]}
                          className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Add selected
                        </button>
                        {!row.canvas_user_found && (
                          <div className="text-xs text-slate-500">Create LMS user first.</div>
                        )}
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
