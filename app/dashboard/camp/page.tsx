import { fetchUpcomingCampSessionsWithEnrolments } from '@/app/lib/data';
import { CalendarIcon } from '@heroicons/react/24/outline';
import ScrapeCampsButton from '@/app/ui/camp/scrape-camps-button';
import CampMonthlyReport from '@/app/ui/camp/camp-monthly-report';
import { connection } from 'next/server';

const parseLocalISODate = (value: string) => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsedDate = new Date(year, month - 1, day);

  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
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

const getWeekEnd = (weekStart: Date) => {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);
  return weekEnd;
};

const formatDateRange = (start: Date, end: Date) => {
  const startStr = new Date(start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endStr = new Date(end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${startStr} - ${endStr}`;
};

export default async function CampPage() {
  await connection();
  const sessions = await fetchUpcomingCampSessionsWithEnrolments();

  const weeklyMap = new Map<
    string,
    {
      id: string;
      weekStart: Date;
      weekEnd: Date;
      totalEnrolments: number;
      byType: { FD: number; half: number };
      byLength: Record<number, number>;
      byCourse: Record<string, number>;
      uniqueStudents: Set<string>;
    }
  >();

  sessions.forEach(session => {
    const start = getLocalDateFromDb(session.start_date);
    const end = getLocalDateFromDb(session.end_date);
    if (!start || !end) {
      return;
    }

    const weekStart = getWeekStart(start);
    const weekEnd = getWeekEnd(weekStart);
    const weekKey = getDateKey(weekStart);

    let entry = weeklyMap.get(weekKey);
    if (!entry) {
      entry = {
        id: weekKey,
        weekStart,
        weekEnd,
        totalEnrolments: 0,
        byType: { FD: 0, half: 0 },
        byLength: {},
        byCourse: {},
        uniqueStudents: new Set()
      };
      weeklyMap.set(weekKey, entry);
    }

    const length =
      Math.round(
        (end.getTime() - start.getTime()) / (86400 * 1000)
      ) + 1;

    (session.enrolments || []).forEach(e => {
      entry!.totalEnrolments += 1;
      if (e.camp_type === 'FD') entry!.byType.FD += 1;
      else entry!.byType.half += 1;

      entry!.byCourse[e.course_id] = (entry!.byCourse[e.course_id] || 0) + 1;
      entry!.byLength[length] = (entry!.byLength[length] || 0) + 1;
      entry!.uniqueStudents.add(e.student_id);
    });
  });

  const weeklyReports = Array.from(weeklyMap.values())
    .sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime())
    .map(r => ({
      id: r.id,
      label: `Week of ${formatDateRange(r.weekStart, r.weekEnd)}`,
      href: `/dashboard/camp/${r.id}/${getDateKey(r.weekEnd)}`,
      totalEnrolments: r.totalEnrolments,
      byType: r.byType,
      byLength: r.byLength,
      byCourse: r.byCourse,
      uniqueStudentWeeks: r.uniqueStudents.size
    }));

  return (
    <div className="m-2 md:m-4">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Camp Schedule</h1>
          <p className="text-sm text-slate-600 mt-1">
            Weekly enrollment summaries. Click a week to view that week's report and day cards.
          </p>
        </div>
        <ScrapeCampsButton />
      </div>

      {weeklyReports.length === 0 ? (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-8 text-center">
          <CalendarIcon className="h-12 w-12 text-slate-400 mx-auto mb-3" />
          <p className="text-slate-600 font-medium">No upcoming camp sessions</p>
          <p className="text-slate-500 text-sm mt-1">
            Camp sessions will appear here once they are scheduled
          </p>
        </div>
      ) : (
        <CampMonthlyReport reports={weeklyReports} heading="Weekly Enrollment Summary" />
      )}
    </div>
  );
}

