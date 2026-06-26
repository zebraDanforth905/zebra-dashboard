'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import {
  createCampPrintLogEntry,
  updateCampPrintLogEntry,
  deleteCampPrintLogEntry,
  seedCampPrintLogEntries,
} from '@/app/lib/actions';
import { CampPrintLogEntry } from '@/app/lib/definitions';

type Row = {
  id: number;
  student: string;
  print_description: string;
  status: string;
  notes: string;
};

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: '—' },
  { value: 'ready', label: 'ready' },
  { value: 'printing', label: 'printing' },
  { value: 'done', label: 'done' },
];

// Color the status pill to match the spreadsheet: green = ready, yellow =
// printing, neutral = done / unset.
const STATUS_STYLE: Record<string, string> = {
  ready: 'bg-emerald-600 text-white',
  printing: 'bg-amber-300 text-amber-900',
  done: 'bg-slate-200 text-slate-700',
  '': 'bg-slate-100 text-slate-400',
};

function EditableCell({
  value,
  placeholder,
  multiline,
  onSave,
}: {
  value: string;
  placeholder?: string;
  multiline?: boolean;
  onSave: (next: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const commit = () => {
    setIsEditing(false);
    if (draft.trim() === value.trim()) return;
    onSave(draft.trim());
  };

  if (isEditing) {
    const shared = {
      autoFocus: true,
      value: draft,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setDraft(e.target.value),
      onBlur: commit,
      className:
        'w-full h-full resize-none bg-white px-2 py-1.5 text-sm text-slate-800 outline-none ring-2 ring-inset ring-sky-400',
    };

    if (multiline) {
      return (
        <textarea
          {...shared}
          rows={2}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              commit();
            } else if (e.key === 'Escape') {
              setDraft(value);
              setIsEditing(false);
            }
          }}
        />
      );
    }

    return (
      <input
        {...shared}
        type="text"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            setDraft(value);
            setIsEditing(false);
          }
        }}
      />
    );
  }

  return (
    <div
      onClick={() => {
        setDraft(value);
        setIsEditing(true);
      }}
      className="min-h-[36px] whitespace-pre-wrap break-words px-2 py-1.5 text-sm text-slate-800 cursor-text hover:bg-sky-50 transition-colors"
      title="Click to edit"
    >
      {value || <span className="text-slate-300 italic">{placeholder ?? '—'}</span>}
    </div>
  );
}

export default function CampPrintLog({
  weekStart,
  weekLabel,
  entries,
  enrolledStudents = [],
}: {
  weekStart: string;
  weekLabel: string;
  entries: CampPrintLogEntry[];
  enrolledStudents?: string[];
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    entries.map((e) => ({
      id: e.id,
      student: e.student ?? '',
      print_description: e.print_description ?? '',
      status: e.status ?? '',
      notes: e.notes ?? '',
    }))
  );
  const [isPending, startTransition] = useTransition();

  // By default, seed an empty log with one row per unique enrolled student
  // (student name only, other fields blank). The server only inserts when the
  // week has no rows, so this runs once and a deliberately emptied log stays
  // empty. The ref guards against React re-running the effect.
  const seedAttempted = useRef(false);
  useEffect(() => {
    if (seedAttempted.current) return;
    if (entries.length > 0 || enrolledStudents.length === 0) return;
    seedAttempted.current = true;

    startTransition(async () => {
      const result = await seedCampPrintLogEntries({
        weekStart,
        students: enrolledStudents,
      });
      if (result.ok && result.rows && result.rows.length > 0) {
        setRows((prev) =>
          prev.length > 0
            ? prev
            : result.rows!.map((e) => ({
                id: e.id,
                student: e.student ?? '',
                print_description: e.print_description ?? '',
                status: e.status ?? '',
                notes: e.notes ?? '',
              }))
        );
      }
    });
  }, [entries.length, enrolledStudents, weekStart]);

  const persist = (row: Row) => {
    startTransition(async () => {
      const result = await updateCampPrintLogEntry({
        id: row.id,
        student: row.student,
        printDescription: row.print_description,
        status: row.status,
        notes: row.notes,
      });
      if (!result.ok) alert(result.error || 'Failed to save print log row');
    });
  };

  const updateRow = (id: number, patch: Partial<Row>) => {
    let updated: Row | undefined;
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        updated = { ...r, ...patch };
        return updated;
      })
    );
    if (updated) persist(updated);
  };

  const addRow = () => {
    startTransition(async () => {
      const result = await createCampPrintLogEntry({ weekStart });
      if (!result.ok || result.id == null) {
        alert(result.ok ? 'Failed to add print log row' : result.error);
        return;
      }
      setRows((prev) => [
        ...prev,
        { id: result.id!, student: '', print_description: '', status: '', notes: '' },
      ]);
    });
  };

  const removeRow = (id: number) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
    startTransition(async () => {
      const result = await deleteCampPrintLogEntry({ id });
      if (!result.ok) alert(result.error || 'Failed to delete print log row');
    });
  };

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Print Log</h2>
          <p className="text-sm text-slate-600">
            {weekLabel}. Track 3D print projects for the week. Click any cell to edit; changes save automatically.
          </p>
        </div>
        <button
          type="button"
          onClick={addRow}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-50"
        >
          <PlusIcon className="h-4 w-4" />
          Add row
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse table-fixed">
          <colgroup>
            <col className="w-[34%]" />
            <col className="w-[34%]" />
            <col className="w-[120px]" />
            <col className="w-[22%]" />
            <col className="w-[44px]" />
          </colgroup>
          <thead>
            <tr>
              <th className="border border-slate-300 bg-emerald-700 text-white text-sm font-semibold px-2 py-2 text-left">
                Student
              </th>
              <th className="border border-slate-300 bg-emerald-700 text-white text-sm font-semibold px-2 py-2 text-left">
                Print
              </th>
              <th className="border border-slate-300 bg-emerald-700 text-white text-sm font-semibold px-2 py-2 text-left">
                Ready?
              </th>
              <th className="border border-slate-300 bg-emerald-700 text-white text-sm font-semibold px-2 py-2 text-left">
                Notes
              </th>
              <th className="border border-slate-300 bg-emerald-700 px-2 py-2" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="border border-slate-300 px-2 py-6 text-center text-sm text-slate-500"
                >
                  No print projects yet. Click “Add row” to start the log.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="even:bg-slate-50/60">
                  <td className="border border-slate-300 p-0 align-top">
                    <EditableCell
                      value={row.student}
                      placeholder="Student name"
                      onSave={(next) => updateRow(row.id, { student: next })}
                    />
                  </td>
                  <td className="border border-slate-300 p-0 align-top">
                    <EditableCell
                      value={row.print_description}
                      placeholder="Description of the print project"
                      multiline
                      onSave={(next) => updateRow(row.id, { print_description: next })}
                    />
                  </td>
                  <td className="border border-slate-300 px-2 py-1.5 align-top">
                    <div className="relative inline-block">
                      <select
                        value={row.status}
                        onChange={(e) => updateRow(row.id, { status: e.target.value })}
                        className={`appearance-none rounded-full pl-3 pr-7 py-1 text-xs font-medium cursor-pointer outline-none ${
                          STATUS_STYLE[row.status] ?? STATUS_STYLE['']
                        }`}
                      >
                        {STATUS_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value} className="bg-white text-slate-800">
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <svg
                        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 opacity-70"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path
                          fillRule="evenodd"
                          d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                  </td>
                  <td className="border border-slate-300 p-0 align-top">
                    <EditableCell
                      value={row.notes}
                      placeholder="Notes"
                      multiline
                      onSave={(next) => updateRow(row.id, { notes: next })}
                    />
                  </td>
                  <td className="border border-slate-300 px-1 py-1.5 align-top text-center">
                    <button
                      type="button"
                      onClick={() => removeRow(row.id)}
                      className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                      title="Delete row"
                      aria-label="Delete row"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
