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
// pastel columns in the editable schedule.
const WEEKDAY_TINT: Record<number, string> = {
  1: 'bg-emerald-50',
  2: 'bg-amber-50',
  3: 'bg-rose-50',
  4: 'bg-red-50',
  5: 'bg-violet-50',
};

const cellKey = (blockKey: string, room: string, weekday: number) =>
  `${blockKey}|${room}|${weekday}`;

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

export default function CampPrintableActivitySchedule({
  weekLabel,
  cells,
}: {
  weekLabel: string;
  cells: CampActivityScheduleCell[];
}) {
  const values: Record<string, string> = {};
  for (const cell of cells) {
    values[cellKey(cell.block_key, cell.room, cell.weekday)] = cell.activity ?? '';
  }

  const getValue = (blockKey: string, room: string, weekday: number) =>
    values[cellKey(blockKey, room, weekday)] ?? '';

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
          <td
            key={`${block.key}-${room}-${d.weekday}`}
            className={`border border-slate-300 px-2 py-1.5 align-top text-sm text-slate-800 ${WEEKDAY_TINT[d.weekday] ?? ''}`}
          >
            <div className="min-h-[48px] whitespace-pre-wrap break-words">
              {getValue(block.key, room, d.weekday)}
            </div>
          </td>
        ))}
      </tr>
    ));

  return (
    <section className="camp-print-packet-page camp-print-portrait-page bg-white text-black">
      <h2 className="mb-4 print:mb-2 text-center text-4xl print:text-2xl font-bold leading-tight">
        Weekly Activity Schedule
      </h2>
      <p className="mb-3 print:mb-2 text-center text-sm print:text-xs font-semibold text-slate-700">
        {weekLabel}
      </p>

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
    </section>
  );
}
