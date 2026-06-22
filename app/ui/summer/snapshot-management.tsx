'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Course, SummerSnapshotFamilyRow, SummerSnapshotStudentRow } from '@/app/lib/definitions';
import {
  addStudentToParentSnapshot,
  removeStudentFromParentSnapshot,
} from '@/app/lib/summer-actions';

type SnapshotFilter = 'snapshot' | 'all' | 'visible' | 'not_snapshot';
type AddSnapshotSelection = {
  tokenId: string;
  student: SummerSnapshotStudentRow;
  courseName: string;
  endDate: string;
};

function formatDate(d: Date | null): string {
  if (!d) return 'No snapshot date';
  return new Date(d).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return t;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return m === 0 ? `${hour} ${ampm}` : `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
}

function formatSessions(sessions: SummerSnapshotStudentRow['current_sessions']): string {
  if (sessions.length === 0) return 'No class saved';
  return sessions
    .map(session => {
      const slot = session.weekday && session.start_time
        ? `${session.weekday} ${formatTime(session.start_time)}`
        : '';
      const courseSlot = [slot, session.course_name].filter(Boolean).join(' - ');
      const label = courseSlot || 'Class details missing';
      return session.end_date ? `${label} (ended ${session.end_date})` : label;
    })
    .join(', ');
}

function familyMatchesSearch(row: SummerSnapshotFamilyRow, search: string): boolean {
  if (!search) return true;
  return [
    row.customer_name,
    row.alternate_name,
    ...row.students.map(student => student.student_name),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(search);
}

function studentMatchesFilter(student: SummerSnapshotStudentRow, filter: SnapshotFilter): boolean {
  if (filter === 'snapshot') return student.in_snapshot;
  if (filter === 'visible') return student.is_active || student.in_snapshot;
  if (filter === 'not_snapshot') return !student.in_snapshot;
  return true;
}

export default function SnapshotManagement({
  rows,
  courseOptions,
}: {
  rows: SummerSnapshotFamilyRow[];
  courseOptions: Course[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<SnapshotFilter>('snapshot');
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [addSelection, setAddSelection] = useState<AddSnapshotSelection | null>(null);
  const [isPending, startTransition] = useTransition();
  const normalizedSearch = search.trim().toLowerCase();
  const filtered = useMemo(
    () => rows
      .map(row => ({
        ...row,
        students: row.students.filter(student => studentMatchesFilter(student, filter)),
      }))
      .filter(row => row.students.length > 0 && familyMatchesSearch(row, normalizedSearch)),
    [filter, normalizedSearch, rows],
  );
  const snapshotStudents = rows.reduce(
    (count, row) => count + row.students.filter(student => student.in_snapshot).length,
    0,
  );
  const visibleStudents = rows.reduce(
    (count, row) => count + row.students.filter(student => student.is_active || student.in_snapshot).length,
    0,
  );

  function openAddModal(tokenId: string, student: SummerSnapshotStudentRow) {
    const fallbackSession = student.current_sessions[0] ?? student.snapshot_sessions[0];
    setMessage(null);
    setAddSelection({
      tokenId,
      student,
      courseName: fallbackSession?.course_name ?? '',
      endDate: fallbackSession?.end_date ?? '',
    });
  }

  function addSnapshotFromModal() {
    if (!addSelection) return;
    const { tokenId, student, courseName, endDate } = addSelection;
    const key = `${tokenId}:${student.student_id}:add`;
    setPendingKey(key);
    setMessage(null);
    startTransition(async () => {
      try {
        await addStudentToParentSnapshot(tokenId, student.student_id, {
          course_name: courseName || undefined,
          end_date: endDate || undefined,
        });
        setMessage(`${student.student_name} added to the snapshot.`);
        setAddSelection(null);
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Snapshot update failed.');
      } finally {
        setPendingKey(null);
      }
    });
  }

  function updateSnapshot(tokenId: string, student: SummerSnapshotStudentRow, action: 'remove') {
    const key = `${tokenId}:${student.student_id}:${action}`;
    setPendingKey(key);
    setMessage(null);
    startTransition(async () => {
      try {
        await removeStudentFromParentSnapshot(tokenId, student.student_id);
        setMessage(`${student.student_name} removed from the snapshot.`);
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Snapshot update failed.');
      } finally {
        setPendingKey(null);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder="Search family or student..."
          className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-300 sm:w-72"
        />
        <select
          value={filter}
          onChange={event => setFilter(event.target.value as SnapshotFilter)}
          className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
        >
          <option value="snapshot">Snapshot students</option>
          <option value="all">All family students</option>
          <option value="visible">Visible on parent link</option>
          <option value="not_snapshot">Not in snapshot</option>
        </select>
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="text-xs text-slate-500 underline"
          >
            Clear
          </button>
        )}
        <div className="ml-auto flex flex-wrap gap-4 text-sm text-slate-600">
          <span><span className="font-semibold text-slate-800">{rows.length}</span> families</span>
          <span><span className="font-semibold text-sky-700">{visibleStudents}</span> visible students</span>
          <span><span className="font-semibold text-emerald-700">{snapshotStudents}</span> in snapshot</span>
        </div>
      </div>

      {message && (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
          {message}
        </div>
      )}

      <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
        Snapshot entries are the historic outreach list. They are not refreshed from current enrolments; use add/remove for manual changes.
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          No families match this search.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                <th className="px-4 py-3">Family</th>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Why visible</th>
                <th className="px-4 py-3">Snapshot class</th>
                <th className="px-4 py-3">Current class</th>
                <th className="px-4 py-3">Snapshot date</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.flatMap(row => row.students.map((student, index) => {
                const action = student.in_snapshot ? 'remove' : 'add';
                const key = `${row.token_id}:${student.student_id}:${action}`;
                const visibleReason = student.is_active
                  ? student.in_snapshot ? 'Active + snapshot' : 'Active'
                  : student.in_snapshot ? 'Snapshot' : 'Hidden';
                return (
                  <tr key={`${row.token_id}:${student.student_id}`} className="hover:bg-slate-50">
                    <td className="px-4 py-3 align-top">
                      {index === 0 && (
                        <div>
                          <p className="font-medium text-slate-900">{row.customer_name}</p>
                          {row.alternate_name && (
                            <p className="text-xs text-slate-500">{row.alternate_name}</p>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top font-medium text-slate-800">
                      {student.student_name}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        visibleReason === 'Hidden'
                          ? 'bg-slate-100 text-slate-600'
                          : student.is_active
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-sky-50 text-sky-700'
                      }`}>
                        {visibleReason}
                      </span>
                    </td>
                    <td className="max-w-md px-4 py-3 align-top text-slate-600">
                      {student.in_snapshot ? formatSessions(student.snapshot_sessions) : '-'}
                    </td>
                    <td className="max-w-md px-4 py-3 align-top text-slate-600">
                      {formatSessions(student.current_sessions)}
                    </td>
                    <td className="px-4 py-3 align-top text-slate-500">
                      {student.in_snapshot ? formatDate(row.last_seen_active_at) : '-'}
                    </td>
                    <td className="px-4 py-3 align-top">
                      {action === 'add' ? (
                        <button
                          type="button"
                          disabled={isPending && pendingKey === key}
                          onClick={() => openAddModal(row.token_id, student)}
                          className="whitespace-nowrap rounded-lg bg-sky-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Add to snapshot
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={isPending && pendingKey === key}
                          onClick={() => updateSnapshot(row.token_id, student, action)}
                          className="whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isPending && pendingKey === key ? 'Updating...' : 'Remove snapshot'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              }))}
            </tbody>
          </table>
        </div>
      )}

      {addSelection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-slate-900">
                Add {addSelection.student.student_name} to snapshot
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Choose the class context to show staff and parents.
              </p>
            </div>

            <div className="space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Course</span>
                <select
                  value={addSelection.courseName}
                  onChange={event => setAddSelection(prev => prev ? { ...prev, courseName: event.target.value } : prev)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                >
                  <option value="">No course selected</option>
                  {courseOptions.map(course => (
                    <option key={course.id} value={course.name}>{course.name}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">Ended</span>
                <input
                  type="date"
                  value={addSelection.endDate}
                  onChange={event => setAddSelection(prev => prev ? { ...prev, endDate: event.target.value } : prev)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                />
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAddSelection(null)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={addSnapshotFromModal}
                className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending ? 'Adding...' : 'Add to snapshot'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
