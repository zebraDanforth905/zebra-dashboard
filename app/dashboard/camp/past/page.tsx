import { fetchPastCampSessionsWithEnrolments } from '@/app/lib/data';
import Link from 'next/link';
import { ArrowLeftIcon, CalendarIcon } from '@heroicons/react/24/outline';
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

const normalizeISODate = (value?: string) => {
  if (!value) return undefined;
  const parsed = parseLocalISODate(value);
  return parsed ? `${value}` : undefined;
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

export default async function PastCampWeeksPage(props: {
  searchParams?: Promise<{
    from?: string;
    to?: string;
  }>;
}) {
  await connection();

  const searchParams = await props.searchParams;
  let fromFilter = normalizeISODate(searchParams?.from);
  let toFilter = normalizeISODate(searchParams?.to);

  if (fromFilter && toFilter && fromFilter > toFilter) {
    const tmp = fromFilter;
    fromFilter = toFilter;
    toFilter = tmp;
  }

  const sessions = await fetchPastCampSessionsWithEnrolments(fromFilter, toFilter);

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

      const courseKey = e.course_id ?? 'No course';
      entry!.byCourse[courseKey] = (entry!.byCourse[courseKey] || 0) + 1;
      entry!.byLength[length] = (entry!.byLength[length] || 0) + 1;
      entry!.uniqueStudents.add(e.student_id);
    });
  });

  const weeklyReports = Array.from(weeklyMap.values())
    .sort((a, b) => b.weekStart.getTime() - a.weekStart.getTime())
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
      <Link
        href="/dashboard/camp"
        className="inline-flex items-center gap-2 text-sm text-sky-600 hover:text-sky-700 mb-4"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Back to Camp Schedule
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Past Camp Weeks</h1>
        <p className="text-sm text-slate-600 mt-1">
          Filter historical camp weeks by week start date.
        </p>
      </div>

      <form method="get" className="mb-6 bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="from" className="text-xs font-medium text-slate-600">
            From Week Start
          </label>
          <input
            id="from"
            name="from"
            type="date"
            defaultValue={fromFilter || ''}
            className="h-10 px-3 border border-slate-300 rounded-md text-sm text-slate-700"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="to" className="text-xs font-medium text-slate-600">
            To Week Start
          </label>
          <input
            id="to"
            name="to"
            type="date"
            defaultValue={toFilter || ''}
            className="h-10 px-3 border border-slate-300 rounded-md text-sm text-slate-700"
          />
        </div>

        <button
          type="submit"
          className="h-10 px-4 text-sm font-medium text-white bg-sky-600 border border-sky-600 rounded-md hover:bg-sky-700 transition-colors"
        >
          Apply
        </button>

        <Link
          href="/dashboard/camp/past"
          className="h-10 px-4 inline-flex items-center text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors"
        >
          Clear
        </Link>
      </form>

      {weeklyReports.length === 0 ? (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-8 text-center">
          <CalendarIcon className="h-12 w-12 text-slate-400 mx-auto mb-3" />
          <p className="text-slate-600 font-medium">No past camp weeks found</p>
          <p className="text-slate-500 text-sm mt-1">
            Try widening the date range filters.
          </p>
        </div>
      ) : (
        <CampMonthlyReport reports={weeklyReports} heading="Past Weekly Enrollment Summary" />
      )}
    </div>
  );
}
