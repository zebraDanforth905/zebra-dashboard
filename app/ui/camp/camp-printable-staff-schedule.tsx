import { CampStaffScheduleCell } from '@/app/lib/definitions';

const WEEKDAYS: Array<{ weekday: number; label: string }> = [
  { weekday: 1, label: 'Monday' },
  { weekday: 2, label: 'Tuesday' },
  { weekday: 3, label: 'Wednesday' },
  { weekday: 4, label: 'Thursday' },
  { weekday: 5, label: 'Friday' },
];

// Fixed staff schedule rows — kept in sync with the editable staff schedule.
type StaffRow = {
  rowKey: string;
  section: string;
  room: string;
  tint: string;
  sectionRows: number;
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

export default function CampPrintableStaffSchedule({
  weekLabel,
  cells,
}: {
  weekLabel: string;
  cells: CampStaffScheduleCell[];
}) {
  const values: Record<string, string> = {};
  for (const cell of cells) {
    values[cellKey(cell.row_key, cell.weekday)] = cell.content ?? '';
  }

  const getValue = (rowKey: string, weekday: number) =>
    values[cellKey(rowKey, weekday)] ?? '';

  return (
    <section className="camp-print-packet-page camp-print-portrait-page bg-white text-black">
      <h2 className="mb-4 print:mb-2 text-center text-4xl print:text-2xl font-bold leading-tight">
        Weekly Staff Schedule
      </h2>
      <p className="mb-3 print:mb-2 text-center text-sm print:text-xs font-semibold text-slate-700">
        {weekLabel}
      </p>

      <table className="w-full border-collapse table-fixed">
        <colgroup>
          <col className="w-[140px]" />
          <col className="w-[64px]" />
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
                <td
                  key={`${row.rowKey}-${d.weekday}`}
                  className={`border border-slate-300 px-2 py-1.5 align-top text-sm text-slate-800 ${row.tint}`}
                >
                  <div className="min-h-[56px] whitespace-pre-wrap break-words">
                    {getValue(row.rowKey, d.weekday)}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
