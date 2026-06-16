'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircleIcon,
  ComputerDesktopIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import {
  assignCampPrepResource,
  unassignCampPrepResource,
} from '@/app/lib/actions';
import type {
  CampAccountPrepChecklistData,
  CampAccountPrepInventoryItem,
  CampAccountPrepRow,
  CampPrepResourceKind,
  CampPrepStatus,
} from '@/app/lib/definitions';

type Props = {
  checklist: CampAccountPrepChecklistData;
  scopeLabel: string;
};

type StatusFilter = 'all' | CampPrepStatus;

const STATUS_LABELS: Record<CampPrepStatus, string> = {
  ready: 'Ready',
  partial: 'Partial',
  missing: 'Missing',
  not_needed: 'No setup',
};

const STATUS_BADGES: Record<CampPrepStatus, string> = {
  ready: 'bg-emerald-100 text-emerald-800',
  partial: 'bg-amber-100 text-amber-800',
  missing: 'bg-rose-100 text-rose-800',
  not_needed: 'bg-slate-100 text-slate-700',
};

const RESOURCE_LABELS: Record<CampPrepResourceKind, string> = {
  scratch: 'Scratch',
  roblox: 'Roblox',
  laptop: 'Laptop',
};

function courseLabel(row: CampAccountPrepRow) {
  return row.course_name && row.course_name !== row.course_id
    ? row.course_name
    : row.course_id ?? 'No course';
}

function courseKey(row: CampAccountPrepRow) {
  return `${row.course_id ?? 'none'}|${courseLabel(row)}`;
}

function needsResource(row: CampAccountPrepRow, kind: CampPrepResourceKind) {
  if (kind === 'scratch') return row.needs_scratch;
  if (kind === 'roblox') return row.needs_roblox;
  return row.needs_laptop;
}

function assignedResource(row: CampAccountPrepRow, kind: CampPrepResourceKind) {
  if (kind === 'scratch') return row.scratch_username;
  if (kind === 'roblox') return row.roblox_username;
  return row.laptop_number;
}

function assignedPassword(row: CampAccountPrepRow, kind: CampPrepResourceKind) {
  if (kind === 'scratch') return row.scratch_password;
  if (kind === 'roblox') return row.roblox_password;
  return null;
}

function inventoryForKind(
  checklist: CampAccountPrepChecklistData,
  kind: CampPrepResourceKind
) {
  if (kind === 'scratch') return checklist.inventory.scratch_accounts;
  if (kind === 'roblox') return checklist.inventory.roblox_accounts;
  return checklist.inventory.laptops;
}

export default function CampAccountPrepChecklist({ checklist, scopeLabel }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [unassignedOnly, setUnassignedOnly] = useState(true);
  const [courseFilter, setCourseFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [message, setMessage] = useState<string | null>(null);
  const [selections, setSelections] = useState<Record<string, string>>({});

  const courseOptions = useMemo(() => {
    const courses = new Map<string, string>();
    checklist.rows.forEach((row) => {
      courses.set(courseKey(row), courseLabel(row));
    });
    return Array.from(courses.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [checklist.rows]);

  const filteredRows = useMemo(() => {
    return checklist.rows.filter((row) => {
      if (unassignedOnly && row.missing_resources.length === 0) return false;
      if (courseFilter !== 'all' && courseKey(row) !== courseFilter) return false;
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      return true;
    });
  }, [checklist.rows, courseFilter, statusFilter, unassignedOnly]);

  const shortages = [
    {
      label: 'Scratch accounts',
      count: Math.max(
        0,
        checklist.summary.missing_scratch - checklist.inventory.scratch_accounts.length
      ),
    },
    {
      label: 'Roblox accounts',
      count: Math.max(
        0,
        checklist.summary.missing_roblox - checklist.inventory.roblox_accounts.length
      ),
    },
    {
      label: 'laptops',
      count: Math.max(
        0,
        checklist.summary.missing_laptop - checklist.inventory.laptops.length
      ),
    },
  ].filter((shortage) => shortage.count > 0);

  const selectionKey = (row: CampAccountPrepRow, kind: CampPrepResourceKind) =>
    `${row.camp_enrolment_id}:${kind}`;

  const handleAssign = (row: CampAccountPrepRow, kind: CampPrepResourceKind) => {
    const key = selectionKey(row, kind);
    const resourceId = selections[key];
    if (!resourceId) {
      setMessage(`Choose a ${RESOURCE_LABELS[kind]} resource first.`);
      return;
    }

    setMessage(null);
    startTransition(async () => {
      const result = await assignCampPrepResource({
        resourceKind: kind,
        resourceId,
        studentId: row.student_id,
      });

      if (!result.ok) {
        setMessage(result.error ?? 'Assignment failed.');
        return;
      }

      setSelections((current) => ({ ...current, [key]: '' }));
      setMessage(`${RESOURCE_LABELS[kind]} assigned to ${row.student_name}.`);
      router.refresh();
    });
  };

  const handleClear = (
    row: CampAccountPrepRow,
    kind: CampPrepResourceKind,
    resourceId: string
  ) => {
    setMessage(null);
    startTransition(async () => {
      const result = await unassignCampPrepResource({
        resourceKind: kind,
        resourceId,
        studentId: row.student_id,
      });

      if (!result.ok) {
        setMessage(result.error ?? 'Clear failed.');
        return;
      }

      setMessage(`${RESOURCE_LABELS[kind]} cleared from ${row.student_name}.`);
      router.refresh();
    });
  };

  const renderResourceNeed = (row: CampAccountPrepRow, kind: CampPrepResourceKind) => {
    if (!needsResource(row, kind)) return null;

    const assigned = assignedResource(row, kind);
    const label = kind === 'laptop' && row.needs_unity ? 'Unity laptop' : RESOURCE_LABELS[kind];

    return (
      <span
        key={kind}
        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
          assigned
            ? 'bg-emerald-100 text-emerald-800'
            : 'bg-rose-100 text-rose-800'
        }`}
      >
        {label}
      </span>
    );
  };

  const renderAssignedResource = (row: CampAccountPrepRow, kind: CampPrepResourceKind) => {
    if (!needsResource(row, kind)) return null;

    const assigned = assignedResource(row, kind);
    const password = assignedPassword(row, kind);
    const label = kind === 'laptop' && row.needs_unity ? 'Unity laptop' : RESOURCE_LABELS[kind];

    return (
      <div key={kind} className="text-xs">
        <span className="font-medium text-slate-700">{label}: </span>
        {assigned ? (
          <>
            <span className="font-mono text-slate-900">{assigned}</span>
            {password && (
              <span className="ml-2 text-slate-500">pw {password}</span>
            )}
          </>
        ) : (
          <span className="text-rose-700">missing</span>
        )}
      </div>
    );
  };

  const renderAssignmentControl = (
    row: CampAccountPrepRow,
    kind: CampPrepResourceKind,
    inventory: CampAccountPrepInventoryItem[]
  ) => {
    if (!needsResource(row, kind)) return null;

    const assigned = assignedResource(row, kind);
    const label = kind === 'laptop' && row.needs_unity ? 'Unity laptop' : RESOURCE_LABELS[kind];

    if (assigned) {
      return (
        <div key={kind} className="flex items-center justify-between gap-2">
          <span className="text-xs text-slate-600">{label} ready</span>
          <button
            type="button"
            onClick={() => handleClear(row, kind, assigned)}
            disabled={isPending}
            className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Clear
          </button>
        </div>
      );
    }

    const key = selectionKey(row, kind);
    const selected = selections[key] ?? '';

    return (
      <div key={kind} className="grid grid-cols-[minmax(0,1fr)_auto] gap-1.5">
        <select
          value={selected}
          onChange={(event) => setSelections({
            ...selections,
            [key]: event.target.value,
          })}
          disabled={isPending || inventory.length === 0}
          className="min-w-36 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 disabled:bg-slate-100"
        >
          <option value="">
            {inventory.length > 0 ? `Choose ${label}` : `No ${label} left`}
          </option>
          {inventory.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
              {item.password ? ` / ${item.password}` : ''}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => handleAssign(row, kind)}
          disabled={isPending || !selected}
          className="rounded-md bg-sky-600 px-2 py-1 text-xs font-medium text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Assign
        </button>
      </div>
    );
  };

  return (
    <section className="mt-8 border-t border-slate-300 pt-6 print:hidden">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ComputerDesktopIcon className="h-5 w-5 text-sky-700" />
            <h2 className="text-lg font-bold text-slate-900">Account & Device Prep</h2>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {scopeLabel}. Dashboard-only prep for Scratch, Roblox, Unity, and laptops.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
            <div className="font-semibold text-slate-900">
              {checklist.inventory.scratch_accounts.length}
            </div>
            <div className="text-slate-500">Scratch free</div>
          </div>
          <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
            <div className="font-semibold text-slate-900">
              {checklist.inventory.roblox_accounts.length}
            </div>
            <div className="text-slate-500">Roblox free</div>
          </div>
          <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
            <div className="font-semibold text-slate-900">
              {checklist.inventory.laptops.length}
            </div>
            <div className="text-slate-500">Laptops free</div>
          </div>
        </div>
      </div>

      {message && (
        <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          {message}
        </div>
      )}

      {shortages.length > 0 && (
        <div className="mt-4 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            Missing inventory:{' '}
            {shortages.map((shortage) => `${shortage.count} ${shortage.label}`).join(', ')}.
          </div>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          ['Needs setup', checklist.summary.setup_needed],
          ['Ready', checklist.summary.ready],
          ['Partial', checklist.summary.partial],
          ['Missing', checklist.summary.missing],
          ['Unity campers', checklist.summary.needs_unity],
        ].map(([label, value]) => (
          <div key={label} className="rounded-md border border-slate-200 bg-white p-3">
            <div className="text-xs font-medium uppercase text-slate-500">{label}</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            checked={unassignedOnly}
            onChange={(event) => setUnassignedOnly(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Unassigned only
        </label>

        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          Course
          <select
            value={courseFilter}
            onChange={(event) => setCourseFilter(event.target.value)}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
          >
            <option value="all">All</option>
            {courseOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          Status
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
          >
            <option value="all">All</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <div className="ml-auto text-sm text-slate-500">
          Showing {filteredRows.length} of {checklist.rows.length}
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-md border border-slate-200 bg-white">
        <table className="min-w-[1050px] w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Camper</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Course</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Needs</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Status</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Assigned</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Quick Assign</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                  No campers match these filters.
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => {
                const resourceKinds: CampPrepResourceKind[] = ['scratch', 'roblox', 'laptop'];

                return (
                  <tr key={row.camp_enrolment_id} className="align-top">
                    <td className="px-3 py-3">
                      <div className="font-medium text-slate-900">{row.student_name}</div>
                      <div className="text-xs text-slate-500">ID {row.student_id}</div>
                    </td>
                    <td className="px-3 py-3 text-slate-700">
                      <div>{courseLabel(row)}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {row.camp_type}{row.extended_care ? ' EX' : ''}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex max-w-52 flex-wrap gap-1.5">
                        {resourceKinds.map((kind) => renderResourceNeed(row, kind))}
                        {row.needs_unity && (
                          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800">
                            Unity prep
                          </span>
                        )}
                        {row.status === 'not_needed' && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                            No setup
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGES[row.status]}`}>
                        {row.status === 'ready' && <CheckCircleIcon className="h-3.5 w-3.5" />}
                        {STATUS_LABELS[row.status]}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="space-y-1">
                        {resourceKinds.map((kind) => renderAssignedResource(row, kind))}
                        {row.status === 'not_needed' && (
                          <span className="text-xs text-slate-500">No account/device prep needed</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="w-80 space-y-2">
                        {resourceKinds.map((kind) =>
                          renderAssignmentControl(row, kind, inventoryForKind(checklist, kind))
                        )}
                        {row.status === 'not_needed' && (
                          <span className="text-xs text-slate-500">No action</span>
                        )}
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
