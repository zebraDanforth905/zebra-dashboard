'use client';

import { useState } from 'react';
import { updateCampActivityScheduleCell } from '@/app/lib/actions';
import { CampActivityScheduleCell } from '@/app/lib/definitions';

type BlockKey = 'morning' | 'afternoon';
type Room = 'Front' | 'Back';

const WEEKDAYS: Array<{ weekday: number; label: string }> = [
  { weekday: 1, label: 'Monday' },
  { weekday: 2, label: 'Tuesday' },
  { weekday: 3, label: 'Wednesday' },
  { weekday: 4, label: 'Thursday' },
  { weekday: 5, label: 'Friday' },
];

const ROOMS: Room[] = ['Front', 'Back'];

const ACTIVITY_BLOCKS: Array<{ key: BlockKey; time: string }> = [
  { key: 'morning', time: '9:00 AM\nActivity at\n11:00' },
  { key: 'afternoon', time: '1:00 PM\nActivity at\n3:00' },
];

// Decorative per-column tint so each weekday reads as a group, matching the
// pastel columns in the printed schedule.
const WEEKDAY_TINT: Record<number, string> = {
  1: 'bg-emerald-50',
  2: 'bg-amber-50',
  3: 'bg-rose-50',
  4: 'bg-red-50',
  5: 'bg-violet-50',
};

const cellKey = (blockKey: string, room: string, weekday: number) =>
  `${blockKey}|${room}|${weekday}`;

function ActivityCell({
  weekStart,
  blockKey,
  room,
  weekday,
  value,
  tint,
  onSaved,
}: {
  weekStart: string;
  blockKey: BlockKey;
  room: Room;
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
    const result = await updateCampActivityScheduleCell({
      weekStart,
      blockKey,
      room,
      weekday,
      activity: next,
    });
    setIsSaving(false);

    if (!result.ok) {
      alert(result.error || 'Failed to save activity');
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
          rows={3}
          className="w-full h-full min-h-[64px] resize-none bg-white px-2 py-1.5 text-sm text-slate-800 outline-none ring-2 ring-inset ring-sky-400"
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
      <div className="min-h-[48px] whitespace-pre-wrap break-words">
        {value || <span className="text-slate-300 italic">—</span>}
        {isSaving && <span className="ml-1 text-[10px] text-slate-400">saving…</span>}
      </div>
    </td>
  );
}

function FullWidthRow({ time, label }: { time: string; label: string }) {
  return (
    <tr>
      <th className="border border-slate-300 bg-slate-700 text-white text-xs font-semibold px-2 py-2 text-right whitespace-pre-line align-middle">
        {time}
      </th>
      <td className="border border-slate-300 bg-slate-100 text-slate-700 text-xs font-medium px-2 py-2 align-middle">
        All
      </td>
      <td
        colSpan={WEEKDAYS.length}
        className="border border-slate-300 bg-slate-200/70 text-center text-sm font-semibold tracking-wide text-slate-700 px-2 py-2"
      >
        {label}
      </td>
    </tr>
  );
}

export default function CampActivitySchedule({
  weekStart,
  weekLabel,
  cells,
}: {
  weekStart: string;
  weekLabel: string;
  cells: CampActivityScheduleCell[];
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const cell of cells) {
      initial[cellKey(cell.block_key, cell.room, cell.weekday)] = cell.activity ?? '';
    }
    return initial;
  });

  const getValue = (blockKey: string, room: string, weekday: number) =>
    values[cellKey(blockKey, room, weekday)] ?? '';

  const handleSaved = (blockKey: string, room: string, weekday: number, next: string) => {
    setValues((prev) => ({ ...prev, [cellKey(blockKey, room, weekday)]: next }));
  };

  const renderBlock = (block: { key: BlockKey; time: string }) =>
    ROOMS.map((room, roomIdx) => (
      <tr key={`${block.key}-${room}`}>
        {roomIdx === 0 && (
          <th
            rowSpan={ROOMS.length}
            className="border border-slate-300 bg-slate-700 text-white text-xs font-semibold px-2 py-2 text-right whitespace-pre-line align-middle"
          >
            {block.time}
          </th>
        )}
        <td className="border border-slate-300 bg-slate-100 text-slate-700 text-xs font-medium px-2 py-2 align-middle">
          {room}
        </td>
        {WEEKDAYS.map((d) => (
          <ActivityCell
            key={`${block.key}-${room}-${d.weekday}`}
            weekStart={weekStart}
            blockKey={block.key}
            room={room}
            weekday={d.weekday}
            value={getValue(block.key, room, d.weekday)}
            tint={WEEKDAY_TINT[d.weekday] ?? ''}
            onSaved={(next) => handleSaved(block.key, room, d.weekday, next)}
          />
        ))}
      </tr>
    ));

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <div className="mb-3">
        <h2 className="text-lg font-semibold text-slate-900">Activity Schedule</h2>
        <p className="text-sm text-slate-600">
          {weekLabel}. Click any activity cell to edit; changes save automatically.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse table-fixed">
          <colgroup>
            <col className="w-[90px]" />
            <col className="w-[70px]" />
            {WEEKDAYS.map((d) => (
              <col key={d.weekday} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="border border-slate-300 bg-slate-800 text-white text-xs font-semibold px-2 py-2">
                Time
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
            <FullWidthRow time={'8:30 am'} label="DROPOFF" />

            {renderBlock(ACTIVITY_BLOCKS[0])}

            <FullWidthRow time={'12:00'} label="LUNCH" />

            {renderBlock(ACTIVITY_BLOCKS[1])}

            <FullWidthRow time={'4:00'} label="EXTENDED CARE" />
          </tbody>
        </table>
      </div>
    </div>
  );
}
