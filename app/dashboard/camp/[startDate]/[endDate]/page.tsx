import { fetchCampAccountPrepChecklist, fetchCampLmsChecklist, fetchCampActivitySchedule, fetchCampStaffSchedule, fetchCampPrintLog, fetchUpcomingCampSessionsWithEnrolments } from '@/app/lib/data';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeftIcon, PrinterIcon, UserGroupIcon } from '@heroicons/react/24/outline';
import CampMonthlyReport from '@/app/ui/camp/camp-monthly-report';
import CampLmsChecklist from '@/app/ui/camp/camp-lms-checklist';
import CampAccountPrepChecklist from '@/app/ui/camp/camp-account-prep-checklist';
import CampActivitySchedule from '@/app/ui/camp/camp-activity-schedule';
import CampStaffSchedule from '@/app/ui/camp/camp-staff-schedule';
import CampPrintLog from '@/app/ui/camp/camp-print-log';
import CampWeekSlips from '@/app/ui/camp/camp-week-slips';
import CampWeekTabs from '@/app/ui/camp/camp-week-tabs';
import { connection } from 'next/server';
import { CampEnrolmentWithStudent } from '@/app/lib/definitions';

type DayEnrolments = {
  date: Date;
  enrolments: Array<{
    id: string;
    student_id: string;
    student_name: string;
    dob: Date | null;
    course_id: string | null;
    course_name: string | null;
    camp_type: 'FD' | 'PM' | 'AM';
    assigned_seat_number: number | null;
    note: string | null;
    special_needs: string | null;
    allergies: string | null;
    extended_care: boolean;
    parent_name: string | null;
    parent_phone: string | null;
    parent_request_notes: string | null;
  }>;
};

const parseLocalISODate = (value: string) => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  return Number.isNaN(date.getTime()) ? null : date;
};

const getLocalDateFromDb = (value: Date | string) => {
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
};

const getDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getWeekStart = (date: Date) => {
  const dayDate = new Date(date);
  const dayOfWeek = dayDate.getDay();
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  dayDate.setDate(dayDate.getDate() - daysFromMonday);
  dayDate.setHours(0, 0, 0, 0);
  return dayDate;
};

const formatDateRange = (start: Date, end: Date) => {
  const startStr = new Date(start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endStr = new Date(end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${startStr} - ${endStr}`;
};

const formatDate = (date: Date) => {
  return new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

const countByType = (enrolments: DayEnrolments['enrolments'], type: 'FD' | 'AM' | 'PM') => {
  return enrolments.filter(e => e.camp_type === type).length;
};

const toClientProps = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export default async function CampSessionPage({ 
  params 
}: { 
  params: Promise<{ startDate: string; endDate: string }> 
}) {
  await connection();
  const { startDate, endDate } = await params;

  const parsedWeekStart = parseLocalISODate(startDate);
  const parsedWeekEnd = parseLocalISODate(endDate);

  if (!parsedWeekStart || !parsedWeekEnd) {
    notFound();
  }

  const weekStart = new Date(parsedWeekStart);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(parsedWeekEnd);
  weekEnd.setHours(23, 59, 59, 999);

  const [sessions, lmsChecklist, accountPrepChecklist, activityScheduleCells, staffScheduleCells, printLogEntries] = await Promise.all([
    fetchUpcomingCampSessionsWithEnrolments(),
    fetchCampLmsChecklist(startDate, endDate),
    fetchCampAccountPrepChecklist(startDate, endDate),
    fetchCampActivitySchedule(startDate),
    fetchCampStaffSchedule(startDate),
    fetchCampPrintLog(startDate),
  ]);

  const report = {
    id: startDate,
    label: `Week of ${formatDateRange(weekStart, weekEnd)}`,
    totalEnrolments: 0,
    byType: { FD: 0, half: 0 },
    byLength: {} as Record<number, number>,
    byCourse: {} as Record<string, number>,
    uniqueStudents: new Set<string>()
  };

  const dateMap = new Map<string, DayEnrolments>();
  // Unique students enrolled in the week, keyed by student id, used to seed the
  // print log by default. Stored by id so the same student in multiple sessions
  // only appears once.
  const uniqueStudentMap = new Map<string, string>();
  // Unique students keyed by student id, holding one enrolment each, used by the
  // Slips tab so a student enrolled across multiple days only yields one slip.
  const uniqueStudentEnrolments = new Map<string, CampEnrolmentWithStudent>();
  let matchedSessionCount = 0;

  sessions.forEach(session => {
    const start = getLocalDateFromDb(session.start_date);
    const end = getLocalDateFromDb(session.end_date);
    if (!start || !end) {
      return;
    }

    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    const sessionWeekStart = getWeekStart(start);
    if (getDateKey(sessionWeekStart) !== startDate) {
      return;
    }

    matchedSessionCount += 1;

    const length =
      Math.round(
        (end.getTime() - start.getTime()) / (86400 * 1000)
      ) + 1;

    (session.enrolments || []).forEach(e => {
      report.totalEnrolments += 1;
      if (e.camp_type === 'FD') report.byType.FD += 1;
      else report.byType.half += 1;

      const courseKey = e.course_id ?? 'No course';
      report.byCourse[courseKey] = (report.byCourse[courseKey] || 0) + 1;
      report.byLength[length] = (report.byLength[length] || 0) + 1;
      report.uniqueStudents.add(e.student_id);
      if (!uniqueStudentMap.has(e.student_id)) {
        uniqueStudentMap.set(e.student_id, e.student_name);
      }
      if (!uniqueStudentEnrolments.has(e.student_id)) {
        uniqueStudentEnrolments.set(e.student_id, e);
      }
    });

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      if (d < weekStart || d > weekEnd) {
        continue;
      }

      const dateStr = getDateKey(d);
      if (!dateMap.has(dateStr)) {
        dateMap.set(dateStr, {
          date: new Date(d),
          enrolments: []
        });
      }

      const dayEntry = dateMap.get(dateStr)!;
      dayEntry.enrolments.push(...(session.enrolments || []));
    }
  });

  if (matchedSessionCount === 0) {
    notFound();
  }

  const weekDays = Array.from(dateMap.values()).sort((a, b) =>
    a.date.getTime() - b.date.getTime()
  );

  const enrolledStudents = Array.from(uniqueStudentMap.values()).sort((a, b) =>
    a.localeCompare(b)
  );

  const slipEnrolments = Array.from(uniqueStudentEnrolments.values()).sort((a, b) =>
    a.student_name.localeCompare(b.student_name)
  );

  const weekReport = [{
    id: report.id,
    label: report.label,
    totalEnrolments: report.totalEnrolments,
    byType: report.byType,
    byLength: report.byLength,
    byCourse: report.byCourse,
    uniqueStudentWeeks: report.uniqueStudents.size
  }];

  const clientWeekReport = toClientProps(weekReport);
  const clientSlipEnrolments = toClientProps(slipEnrolments);
  const clientLmsChecklist = toClientProps(lmsChecklist);
  const clientAccountPrepChecklist = toClientProps(accountPrepChecklist);
  const clientActivityScheduleCells = toClientProps(activityScheduleCells);
  const clientStaffScheduleCells = toClientProps(staffScheduleCells);
  const clientPrintLogEntries = toClientProps(printLogEntries);
  const clientEnrolledStudents = toClientProps(enrolledStudents);

  return (
    <div className="m-2 md:m-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/dashboard/camp"
          className="inline-flex items-center gap-2 text-sm text-sky-600 hover:text-sky-700"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back to Camp Sessions
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {report.label}
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Enrollment report and camp day cards for this week.
          </p>
        </div>
        <Link
          href={`/dashboard/camp/${startDate}/${endDate}/printable`}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 print:hidden"
        >
          <PrinterIcon className="h-4 w-4" />
          Print Camp Packet
        </Link>
      </div>

      <CampMonthlyReport reports={clientWeekReport} heading="Weekly Enrollment Summary" />

      <CampWeekTabs
        slips={
          <CampWeekSlips
            weekLabel={report.label}
            enrolments={clientSlipEnrolments}
          />
        }
        schedule={
          <CampActivitySchedule
            weekStart={startDate}
            weekLabel={report.label}
            cells={clientActivityScheduleCells}
          />
        }
        staffSchedule={
          <CampStaffSchedule
            weekStart={startDate}
            weekLabel={report.label}
            cells={clientStaffScheduleCells}
          />
        }
        printLog={
          <CampPrintLog
            weekStart={startDate}
            weekLabel={report.label}
            entries={clientPrintLogEntries}
            enrolledStudents={clientEnrolledStudents}
          />
        }
        accountPrep={
          <CampAccountPrepChecklist
            scopeLabel={report.label}
            checklist={clientAccountPrepChecklist}
          />
        }
        lms={
          <CampLmsChecklist
            startDate={startDate}
            endDate={endDate}
            checklist={clientLmsChecklist}
          />
        }
        campDays={
      <div className="mt-4">
        {weekDays.length === 0 ? (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-6 text-slate-600 text-sm">
            No camp days found for this week.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {weekDays.map(day => {
              const fdCount = countByType(day.enrolments, 'FD');
              const amCount = countByType(day.enrolments, 'AM');
              const pmCount = countByType(day.enrolments, 'PM');
              const extCareCount = day.enrolments.filter(e => e.extended_care).length;
              const fdAndAmCount = fdCount + amCount;
              const fdAndPmCount = fdCount + pmCount;
              const dateStr = getDateKey(day.date);

              return (
                <Link
                  key={dateStr}
                  href={`/dashboard/camp/day/${dateStr}`}
                  className="block bg-white border border-slate-200 rounded-lg p-5 hover:shadow-md hover:border-sky-300 transition-all"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">
                        {formatDate(day.date)}
                      </h3>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-slate-600 mb-3">
                    <UserGroupIcon className="h-5 w-5" />
                    <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      <span>{fdAndAmCount} FD + AM</span>
                      <span className="text-slate-400">|</span>
                      <span>{fdAndPmCount} FD + PM</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {fdCount > 0 && (
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                        {fdCount} FD
                      </span>
                    )}
                    {amCount > 0 && (
                      <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs font-medium rounded">
                        {amCount} AM
                      </span>
                    )}
                    {pmCount > 0 && (
                      <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs font-medium rounded">
                        {pmCount} PM
                      </span>
                    )}
                    {extCareCount > 0 && (
                      <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-medium rounded">
                        {extCareCount} Ext Care
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
        }
      />
    </div>
  );
}
