'use client';

import { useState } from 'react';
import { updateCampStaffScheduleCell } from '@/app/lib/actions';
import { CampStaffScheduleCell } from '@/app/lib/definitions';

const WEEKDAYS: Array<{ weekday: number; label: string }> = [
  { weekday: 1, label: 'Monday' },
  { weekday: 2, label: 'Tuesday' },
  { weekday: 3, label: 'Wednesday' },
  { weekday: 4, label: 'Thursday' },
  { weekday: 5, label: 'Friday' },
];

// Fixed staff schedule rows, mirroring the printed "Coaches" sheet. Each row is
// a section (with a free-form room label) that holds one editable cell per
// weekday. `sectionRows` lets a section label span its multiple room rows.
type StaffRow = {
  rowKey: string;
  section: string;
  room: string;
  tint: string;
  sectionRows: number; // rowSpan for the section label; 0 = covered by a prior row
};

const STAFF_ROWS: StaffRow[] = [
  { rowKey: 'morning_dropoff', section: 'Morning Drop Off', room: 'All', tint: 'bg-emerald-50', sectionRows: 1 },
  { rowKey: 'coach_lunch_front', section: 'Coach Lunch', room: 'Front', tint: 'bg-sky-50', sectionRows: 2 },
  { rowKey: 'coach_lunch_back', section: 'Coach Lunch', room: 'Back', tint: 'bg-sky-50', sectionRows: 0 },
  { rowKey: 'camp_programs_front', section: 'Camp Programs', room: 'Front', tint: 'bg-sky-50', sectionRows: 2 },
  { rowKey: 'camp_programs_back', section: 'Camp Programs', room: 'Back', tint: 'bg-sky-50', sectionRows: 0 },
  { rowKey: 'extended_care_back', section: 'Extended Care', room: 'Back', tint: 'bg-rose-50', sectionRows: 1 },
  { rowKey: 'evening_classes', section: 'Evening Classes', room: '', tint: 'bg-violet-50', sectionRows: 1 },
];

const cellKey = (rowKey: string, weekday: number) => `${rowKey}|${weekday}`;

function StaffCell({
  weekStart,
  rowKey,
  weekday,
  value,
  tint,
  onSaved,
}: {
  weekStart: string;
  rowKey: string;
  weekday: number;
  value: string;
  tint: string;
  onSaved: (next: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [isSaving, setIsSaving] = useState(false);

  const startEditing = () => {
    setDraft(value);
    setIsEditing(true);
  };

  const commit = async () => {
    const next = draft.trim();
    setIsEditing(false);

    if (next === value) return;

    setIsSaving(true);
    const result = await updateCampStaffScheduleCell({
      weekStart,
      rowKey,
      weekday,
      content: next,
    });
    setIsSaving(false);

    if (!result.ok) {
      alert(result.error || 'Failed to save staff schedule');
      return;
    }

    onSaved(next);
  };

  if (isEditing) {
    return (
      <td className={`border border-slate-300 p-0 align-top ${tint}`}>
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void commit();
            } else if (e.key === 'Escape') {
              setDraft(value);
              setIsEditing(false);
            }
          }}
          rows={4}
          className="w-full h-full min-h-[80px] resize-none bg-white px-2 py-1.5 text-sm text-slate-800 outline-none ring-2 ring-inset ring-sky-400"
        />
      </td>
    );
  }

  return (
    <td
      onClick={startEditing}
      className={`border border-slate-300 px-2 py-1.5 align-top text-sm text-slate-800 cursor-text hover:bg-sky-50 transition-colors ${tint}`}
      title="Click to edit"
    >
      <div className="min-h-[64px] whitespace-pre-wrap break-words">
        {value || <span className="text-slate-300 italic">—</span>}
        {isSaving && <span className="ml-1 text-[10px] text-slate-400">saving…</span>}
      </div>
    </td>
  );
}

export default function CampStaffSchedule({
  weekStart,
  weekLabel,
  cells,
}: {
  weekStart: string;
  weekLabel: string;
  cells: CampStaffScheduleCell[];
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const cell of cells) {
      initial[cellKey(cell.row_key, cell.weekday)] = cell.content ?? '';
    }
    return initial;
  });

  const getValue = (rowKey: string, weekday: number) =>
    values[cellKey(rowKey, weekday)] ?? '';

  const handleSaved = (rowKey: string, weekday: number, next: string) => {
    setValues((prev) => ({ ...prev, [cellKey(rowKey, weekday)]: next }));
  };

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <div className="mb-3">
        <h2 className="text-lg font-semibold text-slate-900">Staff Schedule</h2>
        <p className="text-sm text-slate-600">
          {weekLabel}. Click any cell to add names, times, and notes; changes save automatically.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse table-fixed">
          <colgroup>
            <col className="w-[150px]" />
            <col className="w-[70px]" />
            {WEEKDAYS.map((d) => (
              <col key={d.weekday} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th
                colSpan={2 + WEEKDAYS.length}
                className="border border-slate-300 bg-indigo-900 text-white text-sm font-bold tracking-wide px-2 py-2 text-center"
              >
                COACHES
              </th>
            </tr>
            <tr>
              <th className="border border-slate-300 bg-slate-800 text-white text-xs font-semibold px-2 py-2 text-right">
                Section
              </th>
              <th className="border border-slate-300 bg-slate-800 text-white text-xs font-semibold px-2 py-2">
                Room
              </th>
              {WEEKDAYS.map((d) => (
                <th
                  key={d.weekday}
                  className="border border-slate-300 bg-slate-800 text-white text-xs font-semibold px-2 py-2 text-left"
                >
                  {d.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {STAFF_ROWS.map((row) => (
              <tr key={row.rowKey}>
                {row.sectionRows > 0 && (
                  <th
                    rowSpan={row.sectionRows}
                    className="border border-slate-300 bg-slate-700 text-white text-xs font-semibold px-2 py-2 text-right align-middle"
                  >
                    {row.section}
                  </th>
                )}
                <td className="border border-slate-300 bg-slate-100 text-slate-700 text-xs font-medium px-2 py-2 align-middle">
                  {row.room}
                </td>
                {WEEKDAYS.map((d) => (
                  <StaffCell
                    key={`${row.rowKey}-${d.weekday}`}
                    weekStart={weekStart}
                    rowKey={row.rowKey}
                    weekday={d.weekday}
                    value={getValue(row.rowKey, d.weekday)}
                    tint={row.tint}
                    onSaved={(next) => handleSaved(row.rowKey, d.weekday, next)}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
