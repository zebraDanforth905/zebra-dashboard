'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowPathIcon,
  ClipboardDocumentIcon,
} from '@heroicons/react/24/outline';
import {
  refreshCampLmsWeek,
  saveCampLmsCourseMapping,
  updateCampLmsStatus,
} from '@/app/lib/actions';
import type {
  CampLmsChecklistData,
  CampLmsChecklistRow,
  CampLmsStatus,
} from '@/app/lib/definitions';

type Props = {
  startDate: string;
  endDate: string;
  checklist: CampLmsChecklistData;
};

type MappingDraft = {
  lmsCourseName: string;
  lmsCourseLink: string;
  notes: string;
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

function makeChecklistText(rows: CampLmsChecklistRow[]) {
  const header = [
    'Student',
    'Student ID',
    'LMS Login',
    'Camp Course',
    'LMS Course',
    'Camp Type',
    'EX',
    'Status',
    'Note',
  ].join('\t');

  const body = rows.map((row) => [
    row.student_name,
    row.student_id,
    row.suggested_lms_login,
    courseLabel(row),
    row.lms_course_name ?? 'UNMAPPED',
    row.camp_type,
    row.extended_care ? 'EX' : '',
    row.status ? STATUS_LABELS[row.status] : 'Unchecked',
    row.status_note ?? '',
  ].join('\t'));

  return [header, ...body].join('\n');
}

export default function CampLmsChecklist({ startDate, endDate, checklist }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>(
    () => makeInitialNotes(checklist.rows)
  );
  const [mappingDrafts, setMappingDrafts] = useState<Record<string, MappingDraft>>({});

  const unmappedCourses = useMemo(() => {
    const courses = new Map<string, { courseId: string; label: string; count: number }>();

    checklist.rows.forEach((row) => {
      const mapped = Boolean(row.lms_course_name || row.lms_course_link);
      if (mapped || !row.course_id) return;

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

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(makeChecklistText(checklist.rows));
      setMessage('Checklist copied.');
    } catch {
      setMessage('Could not copy checklist.');
    }
  };

  const handleSaveMapping = (courseId: string) => {
    const draft = mappingDrafts[courseId];
    if (!draft?.lmsCourseName.trim()) {
      setMessage('Add an LMS course name before saving.');
      return;
    }

    setMessage(null);
    startTransition(async () => {
      const result = await saveCampLmsCourseMapping({
        courseId,
        lmsCourseName: draft.lmsCourseName,
        lmsCourseLink: draft.lmsCourseLink,
        notes: draft.notes,
      });
      if (!result.ok) {
        setMessage(result.error ?? 'Mapping save failed.');
        return;
      }
      setMessage('LMS course mapping saved.');
      router.refresh();
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

  return (
    <section className="mt-8 border-t border-slate-300 pt-6 print:hidden">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">LMS Setup Checklist</h2>
          <p className="mt-1 text-sm text-slate-600">
            Portal roster source of truth. Staff verify LMS setup in their own browser and mark status here.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <ArrowPathIcon className="h-4 w-4" />
            Refresh Portal Week
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <ClipboardDocumentIcon className="h-4 w-4" />
            Copy Checklist
          </button>
        </div>
      </div>

      {!checklist.schema_ready && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Apply migration <span className="font-mono">024_lms_camp_checklist.sql</span> to enable mappings and saved statuses.
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
          ['Verified', checklist.summary.verified],
          ['Missing setup', checklist.summary.missing_setup],
          ['Follow-up', checklist.summary.needs_followup],
          ['Unmapped', checklist.summary.unmapped],
          ['Unchecked', checklist.summary.unchecked],
          ['N/A', checklist.summary.not_applicable],
        ].map(([label, value]) => (
          <div key={label} className="rounded-md border border-slate-200 bg-white p-3">
            <div className="text-xs font-medium uppercase text-slate-500">{label}</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div>
          </div>
        ))}
      </div>

      {(unmappedCourses.length > 0 || rowsWithoutCourseId > 0) && (
        <div className="mt-5 rounded-md border border-orange-200 bg-orange-50 p-4">
          <h3 className="text-sm font-semibold text-orange-900">Unmapped Camp Courses</h3>
          {rowsWithoutCourseId > 0 && (
            <p className="mt-2 text-sm text-orange-800">
              {rowsWithoutCourseId} camper row(s) have no portal course id and need manual follow-up.
            </p>
          )}
          {unmappedCourses.length > 0 && (
            <div className="mt-3 space-y-3">
              {unmappedCourses.map((course) => {
                const draft = mappingDrafts[course.courseId] ?? {
                  lmsCourseName: '',
                  lmsCourseLink: '',
                  notes: '',
                };

                return (
                  <div key={course.courseId} className="grid gap-2 rounded-md border border-orange-200 bg-white p-3 md:grid-cols-[1.4fr_1fr_1fr_1fr_auto]">
                    <div>
                      <div className="text-sm font-medium text-slate-900">{course.label}</div>
                      <div className="text-xs text-slate-500">{course.count} camper row(s)</div>
                    </div>
                    <input
                      value={draft.lmsCourseName}
                      onChange={(event) => setMappingDrafts((current) => ({
                        ...current,
                        [course.courseId]: { ...draft, lmsCourseName: event.target.value },
                      }))}
                      placeholder="LMS course name"
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                      disabled={!checklist.schema_ready || isPending}
                    />
                    <input
                      value={draft.lmsCourseLink}
                      onChange={(event) => setMappingDrafts((current) => ({
                        ...current,
                        [course.courseId]: { ...draft, lmsCourseLink: event.target.value },
                      }))}
                      placeholder="LMS course link"
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                      disabled={!checklist.schema_ready || isPending}
                    />
                    <input
                      value={draft.notes}
                      onChange={(event) => setMappingDrafts((current) => ({
                        ...current,
                        [course.courseId]: { ...draft, notes: event.target.value },
                      }))}
                      placeholder="Notes"
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                      disabled={!checklist.schema_ready || isPending}
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveMapping(course.courseId)}
                      disabled={!checklist.schema_ready || isPending}
                      className="rounded-md bg-orange-600 px-3 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Save
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="mt-5 overflow-x-auto rounded-md border border-slate-200 bg-white">
        <table className="min-w-[1200px] w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Student</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">LMS Login</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Camp Course</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Expected LMS Course</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Session</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Status</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Note</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {checklist.rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                  No campers found for this week.
                </td>
              </tr>
            ) : (
              checklist.rows.map((row) => {
                const mapped = Boolean(row.lms_course_name || row.lms_course_link);

                return (
                  <tr key={row.camp_enrolment_id} className="align-top">
                    <td className="px-3 py-3">
                      <div className="font-medium text-slate-900">{row.student_name}</div>
                      <div className="text-xs text-slate-500">ID {row.student_id}</div>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-slate-700">
                      {row.suggested_lms_login}
                    </td>
                    <td className="px-3 py-3 text-slate-700">
                      {courseLabel(row)}
                    </td>
                    <td className="px-3 py-3">
                      {mapped ? (
                        <div className="space-y-1">
                          <div className="font-medium text-slate-800">{row.lms_course_name ?? 'Mapped link'}</div>
                          {row.lms_course_link && (
                            <a
                              href={row.lms_course_link}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-sky-700 hover:text-sky-800 hover:underline"
                            >
                              Open LMS course
                            </a>
                          )}
                          {row.mapping_notes && (
                            <div className="text-xs text-slate-500">{row.mapping_notes}</div>
                          )}
                        </div>
                      ) : (
                        <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800">
                          Unmapped
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                        {row.camp_type}{row.extended_care ? ' EX' : ''}
                      </span>
                    </td>
                    <td className="px-3 py-3">
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
                    </td>
                    <td className="px-3 py-3">
                      <textarea
                        value={noteDrafts[row.camp_enrolment_id] ?? ''}
                        onChange={(event) => setNoteDrafts((current) => ({
                          ...current,
                          [row.camp_enrolment_id]: event.target.value,
                        }))}
                        rows={2}
                        className="w-56 rounded-md border border-slate-300 px-2 py-1 text-sm"
                        placeholder="Office note"
                        disabled={!checklist.schema_ready || isPending}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex w-72 flex-wrap gap-1.5">
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
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
