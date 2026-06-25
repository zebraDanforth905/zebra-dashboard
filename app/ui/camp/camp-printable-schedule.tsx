import PrintButton from '@/app/ui/print-button';
import CampPrintableStudentList, {
  type CampPrintableStudentListRow,
} from '@/app/ui/camp/camp-printable-student-list';
import { CakeIcon } from '@heroicons/react/24/outline';
import type {
  CampPrintableScheduleData,
  CampPrintableScheduleRow,
  CampPrintableStudentListField,
  CampPrintableStudentListOverride,
} from '@/app/lib/definitions';

type WeekdaySchedule = {
  day: Date;
};

type PrintableRoomConfig = {
  name: string;
  rows: number;
  cols: number;
  seatOffset: number;
  visibleSeats: Set<number>;
};

const BACK_ROOM_CONFIG: PrintableRoomConfig = {
  name: 'Back Room',
  rows: 6,
  cols: 5,
  seatOffset: 0,
  visibleSeats: new Set([4, 5, 9, 10, 19, 20, 24, 25, 1, 2, 6, 7, 11, 12, 16, 17, 21, 22, 26, 27]),
};

const FRONT_ROOM_CONFIG: PrintableRoomConfig = {
  name: 'Front Room',
  rows: 6,
  cols: 6,
  seatOffset: 100,
  visibleSeats: new Set([3, 4, 7, 12, 13, 15, 16, 18, 19, 21, 22, 24, 25, 27, 28, 30, 33, 34]),
};

const PRINTABLE_ROOM_ORDER: PrintableRoomConfig[] = [FRONT_ROOM_CONFIG, BACK_ROOM_CONFIG];

type PrintableStudent = CampPrintableStudentListRow & {
  parentName: string;
  parentPhone: string;
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

function formatDayLabel(date: Date) {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
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

function formatBirthday(value: Date | string | null) {
  if (!value) return '';

  const date = getLocalDateFromDb(value);
  if (!date) return '';

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDob(value: Date | string | null) {
  if (!value) return 'N/A';

  const date = getLocalDateFromDb(value);
  if (!date) return 'N/A';

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function sessionLabel(row: CampPrintableScheduleRow) {
  return `${row.camp_type}${row.extended_care ? ' EX' : ''}`;
}

function roomFromSeatNumber(seatNumber?: number | null) {
  if (!seatNumber) return '';
  return seatNumber >= 100 ? 'Front' : 'Back';
}

function seatLabelFromNumber(seatNumber?: number | null) {
  return roomFromSeatNumber(seatNumber);
}

function normalizeRoomLabel(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'f') return 'Front';
  if (normalized === 'b') return 'Back';
  return value;
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
  return uniqueCleanValues(rows.map((row) => row.note)).join('\n');
}

function seatDefaultForRows(rows: CampPrintableScheduleRow[]) {
  const seats = uniqueCleanValues(rows.map((row) => seatLabelFromNumber(row.assigned_seat_number)));
  if (seats.length <= 1) return seats[0] ?? '';
  return seats.join(' / ');
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
    return 'Full week';
  }

  return activeDays
    .map(({ day }) => dayAbbreviation(day))
    .join(', ');
}

function seatSummaryForRows(rows: CampPrintableScheduleRow[], days: WeekdaySchedule[]) {
  const activeDaySeats = days
    .map(({ day }) => {
      const activeRows = rows.filter((row) => isActiveOnDate(row, day));
      const seats = uniqueCleanValues(
        activeRows.map((row) => seatLabelFromNumber(assignedSeatForDate(row, day)))
      );

      return {
        day,
        seats,
      };
    })
    .filter(({ seats }) => seats.length > 0);

  if (activeDaySeats.length === 0) {
    return seatDefaultForRows(rows);
  }

  const activeDayCount = days.filter(({ day }) => rows.some((row) => isActiveOnDate(row, day))).length;
  const uniqueSeats = uniqueCleanValues(activeDaySeats.flatMap(({ seats }) => seats));

  if (activeDaySeats.length === activeDayCount && uniqueSeats.length === 1) {
    return uniqueSeats[0];
  }

  return activeDaySeats
    .map(({ day, seats }) => `${dayAbbreviation(day)}: ${seats.join(' / ')}`)
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
  days: WeekdaySchedule[],
  overrides: CampPrintableStudentListOverride[]
): PrintableStudent[] {
  const grouped = new Map<string, CampPrintableScheduleRow[]>();
  rows.forEach((row) => {
    grouped.set(row.student_id, [...(grouped.get(row.student_id) ?? []), row]);
  });

  const overridesByStudent = new Map<string, Map<CampPrintableStudentListField, string>>();
  overrides.forEach((override) => {
    const studentOverrides =
      overridesByStudent.get(override.student_id) ??
      new Map<CampPrintableStudentListField, string>();
    studentOverrides.set(override.field, override.value);
    overridesByStudent.set(override.student_id, studentOverrides);
  });

  return Array.from(grouped.entries())
    .map(([studentId, studentRows]) => {
      const firstRow = studentRows
        .slice()
        .sort((a, b) => a.student_name.localeCompare(b.student_name))[0];
      const parentName = cleanText(firstRow.parent_name);
      const parentPhone = cleanText(firstRow.parent_phone);
      const studentOverrides = overridesByStudent.get(studentId);
      const overrideValue = (
        field: CampPrintableStudentListField,
        fallback: string
      ) => studentOverrides?.get(field) ?? fallback;
      const roomValue = normalizeRoomLabel(overrideValue('room', seatSummaryForRows(studentRows, days)));

      return {
        key: studentId,
        studentId,
        studentName: overrideValue('student', firstRow.student_name),
        birthday: overrideValue('birthday', formatBirthday(firstRow.dob)),
        parentName,
        parentPhone,
        parentSummary: overrideValue('parent', [parentName, parentPhone].filter(Boolean).join('\n')),
        sessionSummary: overrideValue('type', sessionSummaryForRows(studentRows)),
        campSummary: overrideValue('camp', campSummaryForRows(studentRows)),
        daysSummary: overrideValue('days', daysSummaryForRows(studentRows, days)),
        roomDefault: roomValue,
        medicalAlert: overrideValue('medical', medicalAlertForRows(studentRows)),
        specialInstruction: overrideValue('notes', specialInstructionForRows(studentRows)),
      };
    })
    .sort((a, b) => a.studentName.localeCompare(b.studentName));
}

function paddedRows<T>(rows: T[], minimumRows: number): Array<T | null> {
  const blanks = Math.max(0, minimumRows - rows.length);
  return [...rows, ...Array.from({ length: blanks }, () => null)];
}

function courseLabelForCard(row: CampPrintableScheduleRow) {
  return cleanText(row.course_name) || cleanText(row.course_id);
}

function campTypeBadge(type: 'FD' | 'AM' | 'PM') {
  if (type === 'FD') return { label: 'Full Day', className: 'bg-blue-100 text-blue-700' };
  if (type === 'AM') return { label: 'Morning', className: 'bg-yellow-100 text-yellow-700' };
  return { label: 'Afternoon', className: 'bg-orange-100 text-orange-700' };
}

function PrintableCamperCard({ row }: { row: CampPrintableScheduleRow }) {
  const badge = campTypeBadge(row.camp_type);
  const rosterNote = cleanText(row.note);
  const course = courseLabelForCard(row);

  return (
    <div className="relative bg-white border rounded-md p-1 text-xs border-slate-200">
      <h3 className="font-semibold text-slate-900 text-xs mb-0.5 pr-1 truncate">{row.student_name}</h3>

      <div className="space-y-1">
        <div className="flex items-center gap-0.5 text-[10px] text-slate-600">
          <CakeIcon className="h-2.5 w-2.5" />
          <span>{formatDob(row.dob)}</span>
        </div>

        <div className="flex flex-wrap gap-0.5">
          <span className={`px-1 py-0.5 text-[10px] font-medium rounded ${badge.className}`}>
            {badge.label}
          </span>
          {row.extended_care && (
            <span className="px-1 py-0.5 text-[10px] font-medium rounded bg-purple-100 text-purple-700">
              Ext Care
            </span>
          )}
          {course && (
            <span className="px-1 py-0.5 text-[10px] font-medium rounded bg-slate-100 text-slate-700">
              {course}
            </span>
          )}
        </div>

        {rosterNote && (
          <div className="mt-1 border border-slate-200 rounded-md p-1 bg-slate-50/80">
            <span className="text-[10px] font-semibold text-slate-700">Roster Note: </span>
            <span className="text-[10px] text-slate-700 whitespace-pre-wrap break-words">{rosterNote}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function getRoomRosterForDay(roomConfig: PrintableRoomConfig, dayRows: CampPrintableScheduleRow[], day: Date) {
  return dayRows
    .map((row) => ({
      row,
      seatNumber: assignedSeatForDate(row, day),
    }))
    .filter(({ seatNumber }) => {
      if (!seatNumber) return false;
      const relativeSeatNumber = seatNumber - roomConfig.seatOffset;
      return roomConfig.visibleSeats.has(relativeSeatNumber);
    })
    .sort((a, b) => (a.seatNumber ?? 0) - (b.seatNumber ?? 0) || a.row.student_name.localeCompare(b.row.student_name));
}

function renderPrintRoomForDay(roomConfig: PrintableRoomConfig, dayRows: CampPrintableScheduleRow[], day: Date) {
  const printRowsWithSeats = new Set<number>();
  const printColsWithSeats = new Set<number>();

  roomConfig.visibleSeats.forEach((seatNum) => {
    printRowsWithSeats.add(Math.floor((seatNum - 1) / roomConfig.cols));
    printColsWithSeats.add((seatNum - 1) % roomConfig.cols);
  });

  const roomRoster = getRoomRosterForDay(roomConfig, dayRows, day);

  if (roomRoster.length === 0) {
    return null;
  }

  const seatMap = new Map<number, CampPrintableScheduleRow[]>();
  roomRoster.forEach(({ row, seatNumber }) => {
    if (!seatNumber) return;
    const existing = seatMap.get(seatNumber) ?? [];
    existing.push(row);
    seatMap.set(seatNumber, existing);
  });

  seatMap.forEach((seatRows, seatNumber) => {
    const byTypeOrder = { FD: 0, AM: 1, PM: 2 } as const;
    const deduped = Array.from(new Map(seatRows.map((row) => [row.camp_enrolment_id, row])).values())
      .sort((a, b) => byTypeOrder[a.camp_type] - byTypeOrder[b.camp_type] || a.student_name.localeCompare(b.student_name));
    seatMap.set(seatNumber, deduped);
  });

  return (
    <section key={`${getDateKey(day)}-${roomConfig.name}`} className="camp-print-room bg-white text-black border border-slate-200 rounded-lg p-2">
      <div className="mb-2 border-b border-slate-300 pb-1.5">
        <h2 className="text-lg font-bold tracking-tight text-slate-900">{roomConfig.name}</h2>
        <p className="text-sm font-semibold text-slate-700">{formatDayLabel(day)}</p>
      </div>

      <div>
        <div
          className="mb-1 grid gap-1"
          style={{
            gridTemplateColumns: Array.from({ length: roomConfig.cols }, (_, i) =>
              printColsWithSeats.has(i) ? 'minmax(0, 1fr)' : '0.35in'
            ).join(' '),
            gridTemplateRows: Array.from({ length: roomConfig.rows }, (_, i) =>
              printRowsWithSeats.has(i) ? 'minmax(1.2in, auto)' : '0.14in'
            ).join(' ')
          }}
        >
          {Array.from({ length: roomConfig.rows * roomConfig.cols }, (_, i) => {
            const relativeSeatNumber = i + 1;
            const absoluteSeatNumber = relativeSeatNumber + roomConfig.seatOffset;

            if (!roomConfig.visibleSeats.has(relativeSeatNumber)) {
              return <div key={`print-empty-${getDateKey(day)}-${absoluteSeatNumber}`} />;
            }

            const assignedRows = seatMap.get(absoluteSeatNumber) ?? [];
            const fdRow = assignedRows.find((row) => row.camp_type === 'FD') ?? null;
            const amRow = assignedRows.find((row) => row.camp_type === 'AM') ?? null;
            const pmRow = assignedRows.find((row) => row.camp_type === 'PM') ?? null;

            return (
              <div
                key={`print-seat-${getDateKey(day)}-${absoluteSeatNumber}`}
                className="relative border border-slate-200 rounded-md p-1 min-h-[98px] bg-slate-50/60"
              >
                {fdRow ? (
                  <PrintableCamperCard row={fdRow} />
                ) : (
                  <div className="space-y-0.5">
                    {amRow ? (
                      <PrintableCamperCard row={amRow} />
                    ) : (
                      <div className="h-8 flex items-center justify-center text-slate-400 text-[10px] border border-slate-200 rounded bg-yellow-50/50">
                        AM
                      </div>
                    )}

                    {pmRow ? (
                      <PrintableCamperCard row={pmRow} />
                    ) : (
                      <div className="h-8 flex items-center justify-center text-slate-400 text-[10px] border border-slate-200 rounded bg-orange-50/50">
                        PM
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function PrintableWeeklySeatingCharts({
  rows,
  days,
}: {
  rows: CampPrintableScheduleRow[];
  days: WeekdaySchedule[];
}) {
  return (
    <>
      {days.flatMap(({ day }) => {
        const dayRows = rows.filter((row) => isActiveOnDate(row, day));
        return PRINTABLE_ROOM_ORDER
          .filter((roomConfig) => getRoomRosterForDay(roomConfig, dayRows, day).length > 0)
          .map((roomConfig) => renderPrintRoomForDay(roomConfig, dayRows, day));
      })}
    </>
  );
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
  const students = buildPrintableStudents(
    activeRows,
    days,
    schedule.student_list_overrides
  );
  const weekLabel = formatDateRange(schedule.start_date, schedule.end_date);

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
              <CampPrintableStudentList
                students={students}
                weekStart={schedule.start_date}
                weekEnd={schedule.end_date}
                weekLabel={weekLabel}
              />
              <PrintableWeeklySeatingCharts rows={activeRows} days={days} />
              <SignInSpecialInstructions students={students} schedule={schedule} />
              <MedicalAlertSheet students={students} schedule={schedule} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
