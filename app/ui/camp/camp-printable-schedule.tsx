import PrintButton from '@/app/ui/print-button';
import type {
  CampPrintableScheduleData,
  CampPrintableScheduleRow,
} from '@/app/lib/definitions';

type WeekdaySchedule = {
  day: Date;
};

type PrintableStudent = {
  key: string;
  studentName: string;
  parentName: string;
  parentPhone: string;
  sessionSummary: string;
  campSummary: string;
  daysSummary: string;
  roomDefault: string;
  medicalAlert: string;
  specialInstruction: string;
};

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

function getDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isWeekday(date: Date) {
  const day = date.getDay();
  return day >= 1 && day <= 5;
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

function roomFromSeatNumber(seatNumber?: number | null) {
  if (!seatNumber) return '';
  return seatNumber >= 100 ? 'Front' : 'Back';
}

function assignedSeatForDate(row: CampPrintableScheduleRow, day: Date) {
  const dateKey = getDateKey(day);
  const datedSeat = (row.seat_assignments ?? []).find((assignment) => assignment.date === dateKey)?.seat;
  return datedSeat ?? row.assigned_seat_number;
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
  const rooms = uniqueCleanValues(rows.map((row) => roomFromSeatNumber(row.assigned_seat_number)));
  if (rooms.length <= 1) return rooms[0] ?? '';
  return rooms.join(' / ');
}

function sessionSummaryForRows(rows: CampPrintableScheduleRow[]) {
  return uniqueCleanValues(rows.map(sessionLabel)).join('\n');
}

function campSummaryForRows(rows: CampPrintableScheduleRow[]) {
  return uniqueCleanValues(rows.map(courseLabel)).join('\n');
}

function dayAbbreviation(date: Date) {
  const abbreviations = ['Su', 'M', 'Tu', 'W', 'Th', 'F', 'Sa'];
  return abbreviations[date.getDay()];
}

function daysSummaryForRows(rows: CampPrintableScheduleRow[], days: WeekdaySchedule[]) {
  const activeDays = days.filter(({ day }) => rows.some((row) => isActiveOnDate(row, day)));

  if (activeDays.length === days.length) {
    return 'All week';
  }

  return activeDays
    .map(({ day }) => dayAbbreviation(day))
    .join(', ');
}

function roomSummaryForRows(rows: CampPrintableScheduleRow[], days: WeekdaySchedule[]) {
  const activeDayRooms = days
    .map(({ day }) => {
      const activeRows = rows.filter((row) => isActiveOnDate(row, day));
      const rooms = uniqueCleanValues(
        activeRows.map((row) => roomFromSeatNumber(assignedSeatForDate(row, day)))
      );

      return {
        day,
        rooms,
      };
    })
    .filter(({ rooms }) => rooms.length > 0);

  if (activeDayRooms.length === 0) {
    return roomDefaultForRows(rows);
  }

  const activeDayCount = days.filter(({ day }) => rows.some((row) => isActiveOnDate(row, day))).length;
  const uniqueRooms = uniqueCleanValues(activeDayRooms.flatMap(({ rooms }) => rooms));

  if (activeDayRooms.length === activeDayCount && uniqueRooms.length === 1) {
    return uniqueRooms[0];
  }

  return activeDayRooms
    .map(({ day, rooms }) => `${dayAbbreviation(day)}: ${rooms.join(' / ')}`)
    .join('\n');
}

function buildWeekdays(schedule: CampPrintableScheduleData): WeekdaySchedule[] {
  const allDays = enumerateDays(schedule.start_date, schedule.end_date);
  const weekdays = allDays.filter(isWeekday);
  const daysToPrint = weekdays.length > 0 ? weekdays : allDays;

  return daysToPrint.map((day) => ({
    day,
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
        sessionSummary: sessionSummaryForRows(studentRows),
        campSummary: campSummaryForRows(studentRows),
        daysSummary: daysSummaryForRows(studentRows, days),
        roomDefault: roomSummaryForRows(studentRows, days),
        medicalAlert: medicalAlertForRows(studentRows),
        specialInstruction: specialInstructionForRows(studentRows),
      };
    })
    .sort((a, b) => a.studentName.localeCompare(b.studentName));
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

function EditablePrintField({
  label,
  value,
  className = '',
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div
      aria-label={label}
      className={`min-h-5 whitespace-pre-wrap outline-none focus:bg-yellow-50 ${className}`}
      contentEditable
      suppressContentEditableWarning
    >
      {value}
    </div>
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
            <th className="w-[16%] border border-slate-700 p-1.5 text-[9px] uppercase">Parent</th>
            <th className="w-[8%] border border-slate-700 p-1.5 text-[9px] uppercase">Type</th>
            <th className="w-[17%] border border-slate-700 p-1.5 text-[9px] uppercase">Camp</th>
            <th className="w-[10%] border border-slate-700 p-1.5 text-[9px] uppercase">Days</th>
            <th className="w-[9%] border border-slate-700 p-1.5 text-[9px] uppercase">Room F/B</th>
            <th className="w-[13%] border border-slate-700 p-1.5 text-[9px] uppercase">Allergy / Medical</th>
            <th className="w-[12%] border border-slate-700 p-1.5 text-[9px] uppercase">Notes</th>
          </tr>
        </thead>
        <tbody>
          {students.map((student) => (
            <tr key={student.key} className="camp-print-student-row align-top">
              <td className="border border-slate-400 p-1.5 text-[9px] font-bold leading-tight">
                <EditablePrintField
                  label={`${student.studentName} student name`}
                  value={student.studentName}
                />
              </td>
              <td className="border border-slate-400 p-1.5 text-[8.5px] leading-tight">
                <EditablePrintField
                  label={`${student.studentName} parent`}
                  value={[student.parentName, student.parentPhone].filter(Boolean).join('\n')}
                />
              </td>
              <td className="whitespace-pre-wrap border border-slate-400 p-1.5 text-[8.5px] font-bold leading-tight">
                <EditablePrintField
                  label={`${student.studentName} camp type`}
                  value={student.sessionSummary}
                />
              </td>
              <td className="whitespace-pre-wrap border border-slate-400 p-1.5 text-[8.5px] leading-tight">
                <EditablePrintField
                  label={`${student.studentName} camp`}
                  value={student.campSummary}
                />
              </td>
              <td className="border border-slate-400 p-1.5 text-[8.5px] leading-tight">
                <EditablePrintField
                  label={`${student.studentName} days`}
                  value={student.daysSummary}
                />
              </td>
              <td className="whitespace-pre-wrap border border-slate-400 p-1.5 text-[8.5px] font-bold leading-tight">
                <EditablePrintField
                  label={`${student.studentName} room`}
                  value={student.roomDefault}
                />
              </td>
              <td className="whitespace-pre-wrap border border-slate-400 p-1.5 text-[8px] leading-tight">
                <EditablePrintField
                  label={`${student.studentName} allergy or medical`}
                  value={student.medicalAlert}
                />
              </td>
              <td className="whitespace-pre-wrap border border-slate-400 p-1.5 text-[8px] leading-tight">
                <EditablePrintField
                  label={`${student.studentName} notes`}
                  value={student.specialInstruction}
                />
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
