'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveCampLmsCourseMapping } from '@/app/lib/actions';
import type {
  CampLmsCourseMappingDashboardData,
  CampLmsPortalCourseMappingRow,
} from '@/app/lib/definitions';

type Draft = {
  lmsCourseName: string;
  lmsCourseLink: string;
  canvasBeginnerCourseId: string;
  canvasBeginnerCourseName: string;
  canvasIntermediateCourseId: string;
  canvasIntermediateCourseName: string;
  canvasAdvancedCourseId: string;
  canvasAdvancedCourseName: string;
  notes: string;
};

function draftFromRow(row: CampLmsPortalCourseMappingRow): Draft {
  return {
    lmsCourseName: row.lms_course_name ?? row.course_name ?? row.course_id,
    lmsCourseLink: row.lms_course_link ?? '',
    canvasBeginnerCourseId: row.canvas_beginner_course_id ?? '',
    canvasBeginnerCourseName: row.canvas_beginner_course_name ?? '',
    canvasIntermediateCourseId: row.canvas_intermediate_course_id ?? '',
    canvasIntermediateCourseName: row.canvas_intermediate_course_name ?? '',
    canvasAdvancedCourseId: row.canvas_advanced_course_id ?? '',
    canvasAdvancedCourseName: row.canvas_advanced_course_name ?? '',
    notes: row.mapping_notes ?? '',
  };
}

function formatDate(value: Date | string | null) {
  if (!value) return 'None';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'None';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function isMissingMapping(draft: Draft) {
  return !draft.canvasBeginnerCourseId.trim()
    && !draft.canvasIntermediateCourseId.trim()
    && !draft.canvasAdvancedCourseId.trim();
}

export default function LmsCourseMappingManager({ data }: { data: CampLmsCourseMappingDashboardData }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(
    () => Object.fromEntries(data.portal_courses.map((row) => [row.course_id, draftFromRow(row)]))
  );

  const missingCount = useMemo(
    () => data.portal_courses.filter((row) => isMissingMapping(drafts[row.course_id] ?? draftFromRow(row))).length,
    [data.portal_courses, drafts]
  );

  const updateDraft = (courseId: string, patch: Partial<Draft>) => {
    setDrafts((current) => ({
      ...current,
      [courseId]: {
        ...(current[courseId] ?? draftFromRow(data.portal_courses.find((row) => row.course_id === courseId)!)),
        ...patch,
      },
    }));
  };

  const saveDraft = (row: CampLmsPortalCourseMappingRow) => {
    const draft = drafts[row.course_id] ?? draftFromRow(row);

    setMessage(null);
    startTransition(async () => {
      const result = await saveCampLmsCourseMapping({
        courseId: row.course_id,
        lmsCourseName: draft.lmsCourseName,
        lmsCourseLink: draft.lmsCourseLink,
        notes: draft.notes,
        canvasBeginnerCourseId: draft.canvasBeginnerCourseId,
        canvasBeginnerCourseName: draft.canvasBeginnerCourseName,
        canvasIntermediateCourseId: draft.canvasIntermediateCourseId,
        canvasIntermediateCourseName: draft.canvasIntermediateCourseName,
        canvasAdvancedCourseId: draft.canvasAdvancedCourseId,
        canvasAdvancedCourseName: draft.canvasAdvancedCourseName,
      });

      if (!result.ok) {
        setMessage(result.error ?? 'Failed to save LMS course mapping.');
        return;
      }

      setMessage(`Saved LMS mapping for ${row.course_name ?? row.course_id}.`);
      router.refresh();
    });
  };

  if (!data.schema_ready) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Apply migrations 024, 025, 026, and 027 before editing LMS course mappings.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {message && (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          {message}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-md border border-slate-200 bg-white p-3">
          <div className="text-xs font-medium uppercase text-slate-500">Portal Courses</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">{data.portal_courses.length}</div>
        </div>
        <div className="rounded-md border border-orange-200 bg-orange-50 p-3">
          <div className="text-xs font-medium uppercase text-orange-700">Missing IDs</div>
          <div className="mt-1 text-2xl font-semibold text-orange-950">{missingCount}</div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
        <table className="min-w-[1500px] w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Portal Course</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">LMS Course Name</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Beginner ID</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Beginner Name</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Intermediate ID</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Intermediate Name</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Advanced ID</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Advanced Name</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Notes</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Save</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.portal_courses.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-slate-500">
                  No portal camp courses found.
                </td>
              </tr>
            ) : (
              data.portal_courses.map((row) => {
                const draft = drafts[row.course_id] ?? draftFromRow(row);
                const missing = isMissingMapping(draft);

                return (
                  <tr key={row.course_id} className={missing ? 'bg-orange-50/60 align-top' : 'align-top'}>
                    <td className="px-3 py-3">
                      <div className="font-medium text-slate-900">{row.course_name ?? row.lms_course_name ?? 'Unnamed course'}</div>
                      <div className="font-mono text-xs text-slate-500">{row.course_id}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {row.enrolment_count} row(s), {formatDate(row.first_start_date)} - {formatDate(row.last_end_date)}
                      </div>
                      {missing && (
                        <div className="mt-1 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800">
                          Missing Canvas IDs
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <input
                        value={draft.lmsCourseName}
                        onChange={(event) => updateDraft(row.course_id, { lmsCourseName: event.target.value })}
                        className="w-44 rounded-md border border-slate-300 px-2 py-1 text-sm"
                        disabled={isPending}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <input
                        value={draft.canvasBeginnerCourseId}
                        onChange={(event) => updateDraft(row.course_id, { canvasBeginnerCourseId: event.target.value })}
                        className="w-28 rounded-md border border-slate-300 px-2 py-1 text-sm"
                        disabled={isPending}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <input
                        value={draft.canvasBeginnerCourseName}
                        onChange={(event) => updateDraft(row.course_id, { canvasBeginnerCourseName: event.target.value })}
                        className="w-44 rounded-md border border-slate-300 px-2 py-1 text-sm"
                        disabled={isPending}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <input
                        value={draft.canvasIntermediateCourseId}
                        onChange={(event) => updateDraft(row.course_id, { canvasIntermediateCourseId: event.target.value })}
                        className="w-28 rounded-md border border-slate-300 px-2 py-1 text-sm"
                        disabled={isPending}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <input
                        value={draft.canvasIntermediateCourseName}
                        onChange={(event) => updateDraft(row.course_id, { canvasIntermediateCourseName: event.target.value })}
                        className="w-44 rounded-md border border-slate-300 px-2 py-1 text-sm"
                        disabled={isPending}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <input
                        value={draft.canvasAdvancedCourseId}
                        onChange={(event) => updateDraft(row.course_id, { canvasAdvancedCourseId: event.target.value })}
                        className="w-28 rounded-md border border-slate-300 px-2 py-1 text-sm"
                        disabled={isPending}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <input
                        value={draft.canvasAdvancedCourseName}
                        onChange={(event) => updateDraft(row.course_id, { canvasAdvancedCourseName: event.target.value })}
                        className="w-44 rounded-md border border-slate-300 px-2 py-1 text-sm"
                        disabled={isPending}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <input
                        value={draft.notes}
                        onChange={(event) => updateDraft(row.course_id, { notes: event.target.value })}
                        className="w-52 rounded-md border border-slate-300 px-2 py-1 text-sm"
                        disabled={isPending}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        onClick={() => saveDraft(row)}
                        disabled={isPending}
                        className="rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Save
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
