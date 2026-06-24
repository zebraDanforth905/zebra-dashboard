import PrintButton from '@/app/ui/print-button';
import type {
  CampPrintableScheduleData,
  CampPrintableScheduleRow,
} from '@/app/lib/definitions';

type BlockId = 'AM' | 'PM' | 'EX';

type PrintableGroup = {
  key: string;
  lesson: string;
  rows: CampPrintableScheduleRow[];
};

const BLOCKS: Array<{ id: BlockId; label: string; time: string }> = [
  { id: 'AM', label: 'AM', time: '9:00-12:00' },
  { id: 'PM', label: 'PM', time: '1:00-4:00' },
  { id: 'EX', label: 'EX', time: '4:00-5:30' },
];

function parseLocalISODate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getLocalDateFromDb(value: Date | string) {
  if (typeof value === 'string') {
    const parsed = parseLocalISODate(value);
    if (parsed) return parsed;

    const fallback = new Date(value);
    if (Number.isNaN(fallback.getTime())) return null;
    return new Date(
      fallback.getUTCFullYear(),
      fallback.getUTCMonth(),
      fallback.getUTCDate()
    );
  }

  return new Date(
    value.getUTCFullYear(),
    value.getUTCMonth(),
    value.getUTCDate()
  );
}

function getDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function enumerateDays(startDate: string, endDate: string) {
  const start = parseLocalISODate(startDate);
  const end = parseLocalISODate(endDate);
  if (!start || !end || start > end) return [];

  const days: Date[] = [];
  for (let day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) {
    days.push(new Date(day));
  }
  return days;
}

function formatDate(date: Date) {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateRange(startDate: string, endDate: string) {
  const start = parseLocalISODate(startDate);
  const end = parseLocalISODate(endDate);
  if (!start || !end) return `${startDate} to ${endDate}`;

  const startText = start.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
  const endText = end.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return `${startText} - ${endText}`;
}

function isActiveOnDate(row: CampPrintableScheduleRow, day: Date) {
  const start = getLocalDateFromDb(row.start_date);
  const end = getLocalDateFromDb(row.end_date);
  if (!start || !end) return false;

  const target = new Date(day);
  target.setHours(0, 0, 0, 0);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  return start <= target && end >= target;
}

function courseLabel(row: CampPrintableScheduleRow) {
  if (row.course_name && row.course_name !== row.course_id) return row.course_name;
  return row.course_id ?? 'No lesson';
}

function cleanText(value?: string | null) {
  return value?.trim() || '';
}

function sessionLabel(row: CampPrintableScheduleRow) {
  return `${row.camp_type}${row.extended_care ? ' EX' : ''}`;
}

function parentContact(row: CampPrintableScheduleRow) {
  return [cleanText(row.parent_name), cleanText(row.parent_phone)].filter(Boolean).join(' / ');
}

function careNotes(row: CampPrintableScheduleRow) {
  return [
    cleanText(row.allergies) ? `Allergies: ${cleanText(row.allergies)}` : '',
    cleanText(row.special_needs) ? `Special: ${cleanText(row.special_needs)}` : '',
  ].filter(Boolean).join(' | ');
}

function officeNotes(row: CampPrintableScheduleRow) {
  return [
    cleanText(row.parent_request_notes),
    cleanText(row.note) ? `Roster note: ${cleanText(row.note)}` : '',
  ].filter(Boolean).join(' | ');
}

function assignedRoomLabel(row: CampPrintableScheduleRow) {
  if (!row.assigned_seat_number) return 'Unassigned';
  return row.assigned_seat_number >= 100 ? 'Front' : 'Back';
}

function rowsForBlock(rows: CampPrintableScheduleRow[], blockId: BlockId) {
  if (blockId === 'AM') {
    return rows.filter((row) => row.camp_type === 'FD' || row.camp_type === 'AM');
  }
  if (blockId === 'PM') {
    return rows.filter((row) => row.camp_type === 'FD' || row.camp_type === 'PM');
  }
  return rows.filter((row) => row.extended_care);
}

function uniqueStudentCount(rows: CampPrintableScheduleRow[]) {
  return new Set(rows.map((row) => row.student_id)).size;
}

function groupRows(rows: CampPrintableScheduleRow[], blockId: BlockId): PrintableGroup[] {
  if (blockId === 'EX') {
    return rows.length
      ? [{ key: 'extended-care', lesson: 'Extended care', rows }]
      : [];
  }

  const groups = new Map<string, PrintableGroup>();
  rows.forEach((row) => {
    const lesson = courseLabel(row);
    const key = `${row.course_id ?? 'none'}:${lesson}`;
    const current = groups.get(key);

    if (current) {
      current.rows.push(row);
    } else {
      groups.set(key, { key, lesson, rows: [row] });
    }
  });

  return Array.from(groups.values()).sort((a, b) => a.lesson.localeCompare(b.lesson));
}

function studentLabel(row: CampPrintableScheduleRow, blockId: BlockId) {
  if (blockId === 'AM' && row.camp_type === 'AM') return `${row.student_name} (AM)`;
  if (blockId === 'PM' && row.camp_type === 'PM') return `${row.student_name} (PM)`;
  if (blockId === 'EX' && row.camp_type !== 'FD') return `${row.student_name} (${row.camp_type})`;
  return row.student_name;
}

function StaffRoomCell({ row }: { row: CampPrintableScheduleRow }) {
  const room = assignedRoomLabel(row);

  return (
    <div
      contentEditable
      suppressContentEditableWarning
      className="min-h-7 whitespace-pre-wrap rounded-sm border border-dashed border-slate-300 bg-white px-1 py-0.5 text-slate-900 outline-none"
      aria-label={`Room for ${row.student_name}`}
    >
      {room === 'Unassigned' ? '' : room}
    </div>
  );
}

function StudentListRow({ row }: { row: CampPrintableScheduleRow }) {
  return (
    <tr className="camp-print-student-row align-top">
      <td className="border border-slate-400 p-1.5 text-[9px] font-bold leading-tight">
        {row.student_name}
      </td>
      <td className="border border-slate-400 p-1.5 text-[8.5px] leading-tight">
        {parentContact(row)}
      </td>
      <td className="border border-slate-400 p-1.5 text-[8.5px] leading-tight">
        <div className="font-bold uppercase">{sessionLabel(row)}</div>
        <div>{courseLabel(row)}</div>
      </td>
      <td className="border border-slate-400 p-1 text-[8.5px] leading-tight">
        <StaffRoomCell row={row} />
      </td>
      <td className="border border-slate-400 p-1.5 text-[8.5px] leading-tight">_____</td>
      <td className="border border-slate-400 p-1.5 text-[8px] leading-tight">
        {careNotes(row)}
      </td>
      <td className="border border-slate-400 p-1.5 text-[8px] leading-tight">
        {officeNotes(row)}
      </td>
    </tr>
  );
}

function DailyStudentList({ rows }: { rows: CampPrintableScheduleRow[] }) {
  const sortedRows = rows
    .slice()
    .sort((a, b) => a.student_name.localeCompare(b.student_name));

  return (
    <section className="mt-4 break-inside-avoid">
      <div className="mb-1 flex items-center justify-between border-b border-slate-500 pb-1">
        <h3 className="text-sm font-bold">Student List</h3>
        <span className="text-xs font-semibold text-slate-600">{sortedRows.length} campers</span>
      </div>
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="bg-slate-100">
            <th className="w-[15%] border border-slate-400 p-1.5 text-[8px] uppercase">Student</th>
            <th className="w-[18%] border border-slate-400 p-1.5 text-[8px] uppercase">Parent / Contact</th>
            <th className="w-[18%] border border-slate-400 p-1.5 text-[8px] uppercase">Camp</th>
            <th className="w-[10%] border border-slate-400 p-1.5 text-[8px] uppercase">Room F/B</th>
            <th className="w-[7%] border border-slate-400 p-1.5 text-[8px] uppercase">Sep Gr</th>
            <th className="w-[16%] border border-slate-400 p-1.5 text-[8px] uppercase">Allergies / Special</th>
            <th className="w-[16%] border border-slate-400 p-1.5 text-[8px] uppercase">Office Notes</th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => (
            <StudentListRow key={row.camp_enrolment_id} row={row} />
          ))}
        </tbody>
      </table>
    </section>
  );
}

function EditablePrintCell({ label }: { label: string }) {
  return (
    <div
      contentEditable
      suppressContentEditableWarning
      className="min-h-14 whitespace-pre-wrap rounded-sm border border-dashed border-slate-300 bg-white px-2 py-1 text-slate-900 outline-none print:border-transparent print:px-0"
      aria-label={label}
    />
  );
}

function StaticScheduleRow({
  session,
  details,
  roomLabel,
}: {
  session: string;
  details: string;
  roomLabel?: string;
}) {
  return (
    <tr className="align-top">
      <td className="border border-slate-400 bg-slate-100 p-2 text-sm font-bold whitespace-pre-line">
        {session}
      </td>
      <td className="border border-slate-400 p-2 text-sm" colSpan={4}>
        <EditablePrintCell label={details} />
      </td>
      <td className="border border-slate-400 p-2 text-sm">{roomLabel ?? ''}</td>
      <td className="border border-slate-400 p-2 text-sm">
        <EditablePrintCell label={`${details} coach`} />
      </td>
      <td className="border border-slate-400 p-2 text-sm">
        <EditablePrintCell label={`${details} activity`} />
      </td>
    </tr>
  );
}

function BlockRows({
  block,
  rows,
}: {
  block: { id: BlockId; label: string; time: string };
  rows: CampPrintableScheduleRow[];
}) {
  const groups = groupRows(rows, block.id);
  const total = uniqueStudentCount(rows);

  if (groups.length === 0) {
    return null;
  }

  return (
    <>
      {groups.map((group, index) => (
        <tr key={group.key} className="align-top">
          {index === 0 && (
            <>
              <td
                className="border border-slate-400 bg-slate-100 p-2 text-sm font-bold whitespace-pre-line"
                rowSpan={groups.length}
              >
                {block.label}
                {'\n'}
                {block.time}
              </td>
              <td
                className="border border-slate-400 p-2 text-center text-lg font-bold"
                rowSpan={groups.length}
              >
                {total}
              </td>
            </>
          )}
          <td className="border border-slate-400 p-2 text-center text-base font-bold">
            {uniqueStudentCount(group.rows)}
          </td>
          <td className="border border-slate-400 p-2 text-sm font-semibold">
            {block.id === 'EX' ? '' : group.lesson}
          </td>
          <td className="border border-slate-400 p-2 text-sm leading-snug">
            {group.rows
              .slice()
              .sort((a, b) => a.student_name.localeCompare(b.student_name))
              .map((row) => (
                <div key={row.camp_enrolment_id}>{studentLabel(row, block.id)}</div>
              ))}
          </td>
          <td className="border border-slate-400 p-2 text-sm">
            <EditablePrintCell label={`${group.lesson} room`} />
          </td>
          <td className="border border-slate-400 p-2 text-sm">
            <EditablePrintCell label={`${group.lesson} coach`} />
          </td>
          <td className="border border-slate-400 p-2 text-sm">
            <EditablePrintCell label={`${group.lesson} activity`} />
          </td>
        </tr>
      ))}
    </>
  );
}

export default function CampPrintableSchedule({
  schedule,
}: {
  schedule: CampPrintableScheduleData;
}) {
  const days = enumerateDays(schedule.start_date, schedule.end_date)
    .map((day) => ({
      day,
      rows: schedule.rows.filter((row) => isActiveOnDate(row, day)),
    }))
    .filter(({ rows }) => rows.length > 0);

  return (
    <div className="bg-slate-700 px-3 py-4 print:bg-white print:p-0">
      <div className="mx-auto max-w-[11in] bg-white shadow-2xl print:max-w-none print:shadow-none">
        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white p-4 print:hidden">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Printable Camp Schedule</h1>
            <p className="text-sm text-slate-600">
              Week of {formatDateRange(schedule.start_date, schedule.end_date)}
            </p>
          </div>
          <PrintButton label="Print PDF" title="Print or save camper schedule PDF" />
        </div>

        <div className="space-y-6 p-5 print:space-y-0 print:p-0">
          {days.length === 0 ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-8 text-center text-slate-600 print:border-none">
              No campers found for this week.
            </div>
          ) : (
            days.map(({ day, rows }) => (
              <section
                key={getDateKey(day)}
                className="camp-schedule-print-day bg-white text-black"
              >
                <div className="mb-3 flex items-start justify-between gap-4 border-b-2 border-slate-900 pb-2">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
                      Zebra Robotics
                    </div>
                    <h2 className="text-3xl font-bold leading-tight">Camp Schedule</h2>
                    <p className="text-base font-semibold text-slate-700">{formatDate(day)}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-bold">{uniqueStudentCount(rows)}</div>
                    <div className="text-xs font-bold uppercase text-slate-500">campers</div>
                  </div>
                </div>

                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="bg-slate-900 text-white">
                      <th className="w-[12%] border border-slate-900 p-2 text-xs uppercase">Session</th>
                      <th className="w-[8%] border border-slate-900 p-2 text-center text-xs uppercase">Total</th>
                      <th className="w-[7%] border border-slate-900 p-2 text-center text-xs uppercase">#</th>
                      <th className="w-[17%] border border-slate-900 p-2 text-xs uppercase">Lesson</th>
                      <th className="w-[28%] border border-slate-900 p-2 text-xs uppercase">Students</th>
                      <th className="w-[8%] border border-slate-900 p-2 text-xs uppercase">Room</th>
                      <th className="w-[10%] border border-slate-900 p-2 text-xs uppercase">Coach</th>
                      <th className="w-[10%] border border-slate-900 p-2 text-xs uppercase">Activity</th>
                    </tr>
                  </thead>
                  <tbody>
                    <StaticScheduleRow
                      session={'8:30-9:00\nDROPOFF'}
                      details="Dropoff notes"
                      roomLabel="Front"
                    />
                    {BLOCKS.slice(0, 1).map((block) => (
                      <BlockRows
                        key={block.id}
                        block={block}
                        rows={rowsForBlock(rows, block.id)}
                      />
                    ))}
                    <StaticScheduleRow
                      session={'LUNCH\n12:00-1:00'}
                      details="Lunch supervisors and breaks"
                    />
                    {BLOCKS.slice(1).map((block) => (
                      <BlockRows
                        key={block.id}
                        block={block}
                        rows={rowsForBlock(rows, block.id)}
                      />
                    ))}
                  </tbody>
                </table>

                <DailyStudentList rows={rows} />
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
