import PrintButton from '@/app/ui/print-button';
import type {
  CampPrintableScheduleData,
  CampPrintableScheduleRow,
} from '@/app/lib/definitions';

type BlockId = 'AM' | 'PM';

type WeekdaySchedule = {
  day: Date;
  key: string;
  label: string;
  shortLabel: string;
  rows: CampPrintableScheduleRow[];
};

type PrintableStudent = {
  key: string;
  studentName: string;
  parentName: string;
  parentPhone: string;
  campSummary: string;
  daysSummary: string;
  roomDefault: string;
  medicalAlert: string;
  specialInstruction: string;
};

type PrintableGroup = {
  key: string;
  lesson: string;
  rows: CampPrintableScheduleRow[];
};

const ACTIVITY_LEGEND = [
  { label: 'Requires Prep', className: 'bg-[#f4cccc]' },
  { label: 'Prepared', className: 'bg-[#fff2cc]' },
  { label: 'Outside', className: 'bg-[#d9ead3]' },
  { label: 'With Computers', className: 'bg-[#cfe2f3]' },
  { label: 'Build Challenge', className: 'bg-[#d9d2e9]' },
];

const ACTIVITY_CELL_CLASSES = [
  'bg-[#d9ead3]',
  'bg-[#fff2cc]',
  'bg-[#f4cccc]',
  'bg-[#d9d2e9]',
  'bg-[#cfe2f3]',
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

function isWeekday(date: Date) {
  const day = date.getDay();
  return day >= 1 && day <= 5;
}

function formatShortDay(date: Date) {
  return date.toLocaleDateString('en-US', { weekday: 'long' });
}

function formatShortDayWithDate(date: Date) {
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
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
  return row.course_id ?? 'No camp listed';
}

function cleanText(value?: string | null) {
  return value?.trim() || '';
}

function sessionLabel(row: CampPrintableScheduleRow) {
  return `${row.camp_type}${row.extended_care ? ' EX' : ''}`;
}

function assignedRoomLabel(row: CampPrintableScheduleRow) {
  if (!row.assigned_seat_number) return '';
  return row.assigned_seat_number >= 100 ? 'Front' : 'Back';
}

function rowsForBlock(rows: CampPrintableScheduleRow[], blockId: BlockId) {
  if (blockId === 'AM') {
    return rows.filter((row) => row.camp_type === 'FD' || row.camp_type === 'AM');
  }
  return rows.filter((row) => row.camp_type === 'FD' || row.camp_type === 'PM');
}

function uniqueStudentCount(rows: CampPrintableScheduleRow[]) {
  return new Set(rows.map((row) => row.student_id)).size;
}

function groupRows(rows: CampPrintableScheduleRow[]): PrintableGroup[] {
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

function uniqueCleanValues(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map(cleanText).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b)
  );
}

function cleanMedicalValue(value: string | null | undefined) {
  const text = cleanText(value);
  const normalized = text.toLowerCase().replace(/[\s./-]/g, '');
  const emptyValues = new Set([
    'na',
    'none',
    'no',
    'nil',
    'notapplicable',
    'noallergies',
    'noknownallergies',
    'noknownmedicalalerts',
  ]);

  return emptyValues.has(normalized) ? '' : text;
}

function medicalAlertForRows(rows: CampPrintableScheduleRow[]) {
  return Array.from(
    new Set([
      ...rows.map((row) => cleanMedicalValue(row.allergies)),
      ...rows.map((row) => cleanMedicalValue(row.special_needs)),
    ].filter(Boolean))
  ).sort((a, b) => a.localeCompare(b)).join('\n');
}

function specialInstructionForRows(rows: CampPrintableScheduleRow[]) {
  return uniqueCleanValues([
    ...rows.map((row) => row.parent_request_notes),
    ...rows.map((row) => row.note),
  ]).join('\n');
}

function roomDefaultForRows(rows: CampPrintableScheduleRow[]) {
  const rooms = uniqueCleanValues(rows.map(assignedRoomLabel));
  if (rooms.length <= 1) return rooms[0] ?? '';
  return rooms.join(' / ');
}

function campSummaryForRows(rows: CampPrintableScheduleRow[]) {
  return uniqueCleanValues(
    rows.map((row) => `${sessionLabel(row)} - ${courseLabel(row)}`)
  ).join('\n');
}

function daysSummaryForRows(rows: CampPrintableScheduleRow[], days: WeekdaySchedule[]) {
  return days
    .filter(({ day }) => rows.some((row) => isActiveOnDate(row, day)))
    .map(({ shortLabel }) => shortLabel.slice(0, 3))
    .join(', ');
}

function buildWeekdays(schedule: CampPrintableScheduleData): WeekdaySchedule[] {
  const allDays = enumerateDays(schedule.start_date, schedule.end_date);
  const weekdays = allDays.filter(isWeekday);
  const daysToPrint = weekdays.length > 0 ? weekdays : allDays;

  return daysToPrint.map((day) => ({
    day,
    key: getDateKey(day),
    label: formatShortDay(day),
    shortLabel: formatShortDayWithDate(day),
    rows: schedule.rows.filter((row) => isActiveOnDate(row, day)),
  }));
}

function buildPrintableStudents(
  rows: CampPrintableScheduleRow[],
  days: WeekdaySchedule[]
): PrintableStudent[] {
  const grouped = new Map<string, CampPrintableScheduleRow[]>();
  rows.forEach((row) => {
    grouped.set(row.student_id, [...(grouped.get(row.student_id) ?? []), row]);
  });

  return Array.from(grouped.entries())
    .map(([studentId, studentRows]) => {
      const firstRow = studentRows
        .slice()
        .sort((a, b) => a.student_name.localeCompare(b.student_name))[0];

      return {
        key: studentId,
        studentName: firstRow.student_name,
        parentName: cleanText(firstRow.parent_name),
        parentPhone: cleanText(firstRow.parent_phone),
        campSummary: campSummaryForRows(studentRows),
        daysSummary: daysSummaryForRows(studentRows, days),
        roomDefault: roomDefaultForRows(studentRows),
        medicalAlert: medicalAlertForRows(studentRows),
        specialInstruction: specialInstructionForRows(studentRows),
      };
    })
    .sort((a, b) => a.studentName.localeCompare(b.studentName));
}

function activitySummary(
  rows: CampPrintableScheduleRow[],
  blockId: BlockId,
  room: 'Front' | 'Back'
) {
  const roomRows = rowsForBlock(rows, blockId).filter((row) => assignedRoomLabel(row) === room);
  if (roomRows.length === 0) return '';

  return groupRows(roomRows)
    .map((group) => `${group.lesson} (${uniqueStudentCount(group.rows)})`)
    .join('\n');
}

function PacketHeader({
  title,
  subtitle,
  count,
  accent = 'blue',
}: {
  title: string;
  subtitle: string;
  count?: string;
  accent?: 'blue' | 'red';
}) {
  const titleColor = accent === 'red' ? 'text-red-500' : 'text-slate-950';

  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <div className="text-xs font-bold uppercase text-slate-500">Zebra Robotics</div>
        <h2 className={`text-3xl font-bold leading-tight ${titleColor}`}>{title}</h2>
        <p className="text-base font-semibold text-slate-700">{subtitle}</p>
      </div>
      {count ? (
        <div className="text-right">
          <div className="text-3xl font-bold">{count}</div>
          <div className="text-xs font-bold uppercase text-slate-500">campers</div>
        </div>
      ) : null}
    </div>
  );
}

function EditableActivityCell({
  label,
  defaultValue,
}: {
  label: string;
  defaultValue: string;
}) {
  return (
    <div
      contentEditable
      suppressContentEditableWarning
      className="min-h-24 whitespace-pre-wrap px-2 py-2 text-sm leading-snug text-slate-950 outline-none"
      aria-label={label}
    >
      {defaultValue}
    </div>
  );
}

function EditableRoomCell({
  label,
  defaultValue,
}: {
  label: string;
  defaultValue: string;
}) {
  return (
    <div
      contentEditable
      suppressContentEditableWarning
      className="min-h-7 whitespace-pre-wrap rounded-sm border border-dashed border-slate-300 bg-white px-1 py-0.5 text-slate-900 outline-none"
      aria-label={label}
    >
      {defaultValue}
    </div>
  );
}

function WeeklyActivityRows({
  days,
  block,
}: {
  days: WeekdaySchedule[];
  block: { id: BlockId; time: string };
}) {
  return (
    <>
      {(['Front', 'Back'] as const).map((room, roomIndex) => (
        <tr key={`${block.id}-${room}`} className="align-middle">
          {roomIndex === 0 ? (
            <td
              rowSpan={2}
              className="w-[13%] border-4 border-white bg-[#234f8f] p-2 text-right text-xl font-bold leading-tight text-white"
            >
              {block.time}
            </td>
          ) : null}
          <td className="w-[12%] border-4 border-white bg-[#d8e8eb] p-2 text-xl text-slate-950">
            {room}
          </td>
          {days.map((day, dayIndex) => (
            <td
              key={`${block.id}-${room}-${day.key}`}
              className={`border-4 border-white ${ACTIVITY_CELL_CLASSES[(dayIndex + roomIndex) % ACTIVITY_CELL_CLASSES.length]}`}
            >
              <EditableActivityCell
                label={`${day.label} ${block.id} ${room} activity`}
                defaultValue={activitySummary(day.rows, block.id, room)}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function WeeklyActivitySchedule({
  days,
  schedule,
}: {
  days: WeekdaySchedule[];
  schedule: CampPrintableScheduleData;
}) {
  return (
    <section className="camp-print-packet-page bg-white text-black">
      <PacketHeader
        title="Weekly Activity Schedule"
        subtitle={`Week of ${formatDateRange(schedule.start_date, schedule.end_date)}`}
      />

      <div className="mb-2 grid grid-cols-5 text-center text-base">
        {ACTIVITY_LEGEND.map((item) => (
          <div key={item.label} className={`${item.className} px-2 py-1`}>
            {item.label}
          </div>
        ))}
      </div>

      <table className="w-full table-fixed border-collapse text-left">
        <thead>
          <tr>
            <th className="border-4 border-white bg-[#234f8f] p-1 text-xl font-bold text-white">
              Time
            </th>
            <th className="border-4 border-white bg-[#234f8f] p-1 text-xl font-bold text-white">
              Room
            </th>
            {days.map((day) => (
              <th
                key={day.key}
                className="border-4 border-white bg-[#234f8f] p-1 text-xl font-bold text-white"
              >
                {day.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="align-middle">
            <td className="border-4 border-white bg-[#234f8f] p-2 text-right text-xl font-bold text-white">
              8:30 AM
            </td>
            <td className="border-4 border-white bg-[#d8e8eb] p-2 text-center text-xl">All</td>
            <td
              className="border-4 border-white bg-[#d8e8eb] p-5 text-center text-xl"
              colSpan={days.length}
            >
              DROPOFF
            </td>
          </tr>
          <WeeklyActivityRows
            days={days}
            block={{ id: 'AM', time: '9:00 AM\nActivity at\n11:00' }}
          />
          <tr>
            <td className="border-4 border-white bg-[#234f8f] p-2 text-right text-xl font-bold text-white">
              12:00 PM
            </td>
            <td
              className="border-4 border-white bg-[#d8e8eb] p-5 text-center text-xl"
              colSpan={days.length + 1}
            >
              LUNCH
            </td>
          </tr>
          <WeeklyActivityRows
            days={days}
            block={{ id: 'PM', time: '1:00 PM\nActivity at\n3:00' }}
          />
          <tr>
            <td className="border-4 border-white bg-[#234f8f] p-2 text-right text-xl font-bold text-white">
              4:00 PM
            </td>
            <td className="border-4 border-white bg-[#d8e8eb] p-2 text-center text-xl">All</td>
            <td
              className="border-4 border-white bg-[#d8e8eb] p-5 text-center text-xl"
              colSpan={days.length}
            >
              EXTENDED CARE
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

function StudentList({
  students,
  schedule,
}: {
  students: PrintableStudent[];
  schedule: CampPrintableScheduleData;
}) {
  return (
    <section className="camp-print-packet-page bg-white text-black">
      <PacketHeader
        title="Student List"
        subtitle={`Week of ${formatDateRange(schedule.start_date, schedule.end_date)}`}
        count={String(students.length)}
      />

      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="bg-[#234f8f] text-white">
            <th className="w-[15%] border border-slate-700 p-1.5 text-[9px] uppercase">Student</th>
            <th className="w-[17%] border border-slate-700 p-1.5 text-[9px] uppercase">Parent</th>
            <th className="w-[20%] border border-slate-700 p-1.5 text-[9px] uppercase">Camp</th>
            <th className="w-[9%] border border-slate-700 p-1.5 text-[9px] uppercase">Days</th>
            <th className="w-[10%] border border-slate-700 p-1.5 text-[9px] uppercase">Room F/B</th>
            <th className="w-[14%] border border-slate-700 p-1.5 text-[9px] uppercase">Allergy / Medical</th>
            <th className="w-[15%] border border-slate-700 p-1.5 text-[9px] uppercase">Notes</th>
          </tr>
        </thead>
        <tbody>
          {students.map((student) => (
            <tr key={student.key} className="camp-print-student-row align-top">
              <td className="border border-slate-400 p-1.5 text-[9px] font-bold leading-tight">
                {student.studentName}
              </td>
              <td className="border border-slate-400 p-1.5 text-[8.5px] leading-tight">
                <div>{student.parentName}</div>
                <div>{student.parentPhone}</div>
              </td>
              <td className="whitespace-pre-wrap border border-slate-400 p-1.5 text-[8.5px] leading-tight">
                {student.campSummary}
              </td>
              <td className="border border-slate-400 p-1.5 text-[8.5px] leading-tight">
                {student.daysSummary}
              </td>
              <td className="border border-slate-400 p-1 text-[8.5px] leading-tight">
                <EditableRoomCell
                  label={`Room for ${student.studentName}`}
                  defaultValue={student.roomDefault}
                />
              </td>
              <td className="whitespace-pre-wrap border border-slate-400 p-1.5 text-[8px] leading-tight">
                {student.medicalAlert}
              </td>
              <td className="whitespace-pre-wrap border border-slate-400 p-1.5 text-[8px] leading-tight">
                {student.specialInstruction}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function paddedRows<T>(rows: T[], minimumRows: number): Array<T | null> {
  const blanks = Math.max(0, minimumRows - rows.length);
  return [...rows, ...Array.from({ length: blanks }, () => null)];
}

function SignInSpecialInstructions({
  students,
  schedule,
}: {
  students: PrintableStudent[];
  schedule: CampPrintableScheduleData;
}) {
  const rows = paddedRows(
    students.filter((student) => student.specialInstruction),
    7
  );

  return (
    <section className="camp-print-packet-page bg-white text-black">
      <h2 className="mb-4 text-center text-4xl font-bold leading-tight">
        Weekly Sign-in/out Special Instructions
      </h2>
      <p className="mb-3 text-center text-sm font-semibold text-slate-700">
        Week of {formatDateRange(schedule.start_date, schedule.end_date)}
      </p>
      <table className="w-full border-collapse text-left">
        <thead>
          <tr>
            <th className="w-[25%] border-2 border-black p-6 text-center text-3xl font-bold text-blue-400">
              Student
            </th>
            <th className="w-[25%] border-2 border-black p-6 text-center text-3xl font-bold text-blue-400">
              Parent Info
            </th>
            <th className="w-[50%] border-2 border-black p-6 text-center text-3xl font-bold text-blue-400">
              Special Instruction
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((student, index) => (
            <tr key={student?.key ?? `blank-sign-in-${index}`}>
              <td className="h-32 border-2 border-black p-2 text-xl align-top">
                {student?.studentName}
              </td>
              <td className="h-32 whitespace-pre-wrap border-2 border-black p-2 text-xl align-top">
                {student ? [student.parentName, student.parentPhone].filter(Boolean).join('\n') : ''}
              </td>
              <td className="h-32 whitespace-pre-wrap border-2 border-black p-2 text-xl align-top">
                {student?.specialInstruction}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function MedicalAlertSheet({
  students,
  schedule,
}: {
  students: PrintableStudent[];
  schedule: CampPrintableScheduleData;
}) {
  const rows = paddedRows(
    students.filter((student) => student.medicalAlert),
    6
  );

  return (
    <section className="camp-print-packet-page bg-white text-black">
      <h2 className="mb-4 text-center text-4xl font-bold uppercase leading-tight text-red-400">
        Allergy and Medical Alert
      </h2>
      <p className="mb-3 text-center text-sm font-semibold text-slate-700">
        Week of {formatDateRange(schedule.start_date, schedule.end_date)}
      </p>
      <table className="w-full border-collapse text-left">
        <thead>
          <tr>
            <th className="w-[22%] border-2 border-black p-6 text-center text-3xl font-bold text-blue-400">
              Student
            </th>
            <th className="w-[26%] border-2 border-black p-6 text-center text-3xl font-bold text-blue-400">
              Parent Name
            </th>
            <th className="w-[21%] border-2 border-black p-6 text-center text-3xl font-bold text-blue-400">
              Phone Number
            </th>
            <th className="w-[31%] border-2 border-black p-6 text-center text-3xl font-bold text-blue-400">
              Allergy/Medical Alert
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((student, index) => (
            <tr key={student?.key ?? `blank-medical-${index}`}>
              <td className="h-28 border-2 border-black p-2 text-xl align-top">
                {student?.studentName}
              </td>
              <td className="h-28 border-2 border-black p-2 text-xl align-top">
                {student?.parentName}
              </td>
              <td className="h-28 border-2 border-black p-2 text-xl align-top">
                {student?.parentPhone}
              </td>
              <td className="h-28 whitespace-pre-wrap border-2 border-black p-2 text-xl align-top">
                {student?.medicalAlert}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default function CampPrintableSchedule({
  schedule,
}: {
  schedule: CampPrintableScheduleData;
}) {
  const days = buildWeekdays(schedule);
  const activeRows = schedule.rows.filter((row) =>
    days.some(({ day }) => isActiveOnDate(row, day))
  );
  const students = buildPrintableStudents(activeRows, days);

  return (
    <div className="bg-slate-700 px-3 py-4 print:bg-white print:p-0">
      <div className="mx-auto max-w-[11in] bg-white shadow-2xl print:max-w-none print:shadow-none">
        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white p-4 print:hidden">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Printable Camp Packet</h1>
            <p className="text-sm text-slate-600">
              Week of {formatDateRange(schedule.start_date, schedule.end_date)}
            </p>
          </div>
          <PrintButton label="Print PDF" title="Print or save camp packet PDF" />
        </div>

        <div className="space-y-6 p-5 print:space-y-0 print:p-0">
          {students.length === 0 || days.length === 0 ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-8 text-center text-slate-600 print:border-none">
              No campers found for this week.
            </div>
          ) : (
            <>
              <WeeklyActivitySchedule days={days} schedule={schedule} />
              <StudentList students={students} schedule={schedule} />
              <SignInSpecialInstructions students={students} schedule={schedule} />
              <MedicalAlertSheet students={students} schedule={schedule} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
