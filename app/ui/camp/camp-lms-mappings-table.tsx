'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveCampLmsCourseMapping, searchCampLmsCanvasCourses } from '@/app/lib/actions';
import type { CampLmsCanvasCourseSearchResult, CampLmsCourseMappingRow } from '@/app/lib/definitions';

type Draft = {
  beginner: string;
  intermediate: string;
  advanced: string;
  additional: string;
  notes: string;
};

type Props = {
  rows: CampLmsCourseMappingRow[];
  schemaReady: boolean;
};

function campName(row: CampLmsCourseMappingRow) {
  return row.course_name || row.lms_course_name || row.course_id;
}

function initialDraft(row: CampLmsCourseMappingRow): Draft {
  return {
    beginner: row.canvas_beginner_course_id ?? '',
    intermediate: row.canvas_intermediate_course_id ?? '',
    advanced: row.canvas_advanced_course_id ?? '',
    additional: row.canvas_additional_course_ids.join(', '),
    notes: row.mapping_notes ?? '',
  };
}

export default function CampLmsMappingsTable({ rows, schemaReady }: Props) {
  const router = useRouter();
  const [isSavePending, startSaveTransition] = useTransition();
  const [isSearchPending, startSearchTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchMessage, setSearchMessage] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<CampLmsCanvasCourseSearchResult[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(rows.map((row) => [row.course_id, initialDraft(row)]))
  );

  const mappedCount = useMemo(
    () => rows.filter((row) =>
      Boolean(
        row.canvas_beginner_course_id
        || row.canvas_intermediate_course_id
        || row.canvas_advanced_course_id
        || row.canvas_additional_course_ids.length > 0
      )
    ).length,
    [rows]
  );

  const updateDraft = (courseId: string, patch: Partial<Draft>) => {
    setDrafts((current) => ({
      ...current,
      [courseId]: {
        ...(current[courseId] ?? { beginner: '', intermediate: '', advanced: '', additional: '', notes: '' }),
        ...patch,
      },
    }));
  };

  const handleSearch = (term: string) => {
    const trimmed = term.trim();
    setSearchTerm(trimmed);
    if (trimmed.length < 2) {
      setSearchMessage('Search with at least 2 characters.');
      setSearchResults([]);
      return;
    }

    setSearchMessage(null);
    startSearchTransition(async () => {
      const result = await searchCampLmsCanvasCourses({ term: trimmed });
      if (!result.ok) {
        setSearchMessage(result.error ?? 'Canvas search failed.');
        setSearchResults([]);
        return;
      }

      setSearchResults(result.courses);
      setSearchMessage(result.courses.length > 0 ? null : 'No Canvas courses found.');
    });
  };

  const handleCopyCourseId = async (courseId: string) => {
    try {
      await navigator.clipboard.writeText(courseId);
      setSearchMessage(`Copied Canvas course ID ${courseId}.`);
    } catch {
      setSearchMessage(`Canvas course ID: ${courseId}`);
    }
  };

  const handleSave = (row: CampLmsCourseMappingRow) => {
    const draft = drafts[row.course_id] ?? initialDraft(row);
    if (!campName(row).trim() && !draft.beginner.trim() && !draft.intermediate.trim() && !draft.advanced.trim() && !draft.additional.trim()) {
      setMessage('Add at least one Canvas course ID before saving.');
      return;
    }

    setMessage(null);
    startSaveTransition(async () => {
      const result = await saveCampLmsCourseMapping({
        courseId: row.course_id,
        lmsCourseName: campName(row),
        notes: draft.notes,
        canvasBeginnerCourseId: draft.beginner,
        canvasIntermediateCourseId: draft.intermediate,
        canvasAdvancedCourseId: draft.advanced,
        canvasAdditionalCourseIds: draft.additional,
      });

      if (!result.ok) {
        setMessage(result.error ?? 'Mapping save failed.');
        return;
      }

      setMessage(`${campName(row)} mapping saved.`);
      router.refresh();
    });
  };

  return (
    <section className="mt-5">
      <div className="mb-4 rounded-md border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="flex-1">
            <label htmlFor="canvas-course-search" className="text-sm font-medium text-slate-700">
              Canvas course lookup
            </label>
            <div className="mt-1 flex gap-2">
              <input
                id="canvas-course-search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleSearch(searchTerm);
                }}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="Search by Canvas course name, code, or ID"
              />
              <button
                type="button"
                onClick={() => handleSearch(searchTerm)}
                disabled={isSearchPending}
                className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Search
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Use the numeric Canvas course ID from URLs like /courses/12345. If one Canvas course covers the whole camp, put it in General / Beginner and leave the rest blank.
            </p>
          </div>
        </div>

        {searchMessage && (
          <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-2 text-sm text-slate-700">
            {searchMessage}
          </div>
        )}

        {searchResults.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-slate-600">Canvas ID</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-600">Course</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-600">Code</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-600">State</th>
                  <th className="px-3 py-2 text-right font-medium text-slate-600">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {searchResults.map((course) => (
                  <tr key={course.id}>
                    <td className="px-3 py-2 font-mono text-slate-900">{course.id}</td>
                    <td className="px-3 py-2 text-slate-900">{course.name ?? 'Untitled course'}</td>
                    <td className="px-3 py-2 text-slate-600">{course.course_code ?? '-'}</td>
                    <td className="px-3 py-2 text-slate-600">{course.workflow_state ?? '-'}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => handleCopyCourseId(course.id)}
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Copy ID
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <div className="rounded-md border border-slate-200 bg-white p-3">
          <div className="text-xs font-medium uppercase text-slate-500">Camp Courses</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">{rows.length}</div>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-3">
          <div className="text-xs font-medium uppercase text-slate-500">Mapped</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">{mappedCount}</div>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-3">
          <div className="text-xs font-medium uppercase text-slate-500">Unmapped</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">{rows.length - mappedCount}</div>
        </div>
      </div>

      {!schemaReady && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Apply camp LMS mapping migrations before editing mappings.
        </div>
      )}

      {message && (
        <div className="mb-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          {message}
        </div>
      )}

      <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
        <table className="w-full min-w-[1180px] divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Camp</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">General / Beginner ID</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Intermediate ID</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Advanced ID</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Additional IDs</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Notes</th>
              <th className="px-3 py-2 text-right font-medium text-slate-600">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                  No camp courses found.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const draft = drafts[row.course_id] ?? initialDraft(row);

                return (
                  <tr key={row.course_id} className="align-top">
                    <td className="px-3 py-3">
                      <div className="font-medium text-slate-900">{campName(row)}</div>
                      <div className="text-xs text-slate-500">
                        {row.course_id} · {row.camper_count} camper row(s)
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <input
                        value={draft.beginner}
                        onChange={(event) => updateDraft(row.course_id, { beginner: event.target.value })}
                        disabled={!schemaReady || isSavePending}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <input
                        value={draft.intermediate}
                        onChange={(event) => updateDraft(row.course_id, { intermediate: event.target.value })}
                        disabled={!schemaReady || isSavePending}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <input
                        value={draft.advanced}
                        onChange={(event) => updateDraft(row.course_id, { advanced: event.target.value })}
                        disabled={!schemaReady || isSavePending}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <textarea
                        value={draft.additional}
                        onChange={(event) => updateDraft(row.course_id, { additional: event.target.value })}
                        disabled={!schemaReady || isSavePending}
                        rows={2}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        placeholder="Comma-separated IDs"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <input
                        value={draft.notes}
                        onChange={(event) => updateDraft(row.course_id, { notes: event.target.value })}
                        disabled={!schemaReady || isSavePending}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      />
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleSearch(campName(row))}
                        disabled={isSearchPending}
                        className="mb-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Find IDs
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSave(row)}
                        disabled={!schemaReady || isSavePending}
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

      <p className="mt-3 text-sm text-slate-500">
        Day Camp is not listed here; staff handle those Canvas courses per camper from the weekly LMS checklist.
      </p>
    </section>
  );
}
