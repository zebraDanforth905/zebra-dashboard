import { fetchUpcomingCampSessionsWithEnrolments } from '@/app/lib/data';
import Link from 'next/link';
import { CalendarIcon, UserGroupIcon } from '@heroicons/react/24/outline';
import ScrapeCampsButton from '@/app/ui/camp/scrape-camps-button';
import CampMonthlyReport from '@/app/ui/camp/camp-monthly-report';
import { connection } from 'next/server';

type DayEnrolments = {
  date: Date;
  enrolments: Array<{
    id: string;
    student_id: string;
    student_name: string;
    dob: Date | null;
    course_id: string;
    camp_type: 'FD' | 'PM' | 'AM';
    assigned_seat_number: number | null;
    special_needs: string | null;
    extended_care: boolean;
  }>;
};

type WeekGroup = {
  weekStart: Date;
  weekEnd: Date;
  days: DayEnrolments[];
};

export default async function CampPage() {
  await connection();
  const sessions = await fetchUpcomingCampSessionsWithEnrolments();

  // Build a map of dates to enrolments
  const dateMap = new Map<string, DayEnrolments>();
  
  sessions.forEach((session) => {
    const start = new Date(session.start_date);
    const end = new Date(session.end_date);
    
    // Shift dates forward by 1 day to correct timezone offset
    start.setDate(start.getDate() + 1);
    end.setDate(end.getDate() + 1);
    
    // Iterate through each day in the session's date range
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      
      if (!dateMap.has(dateStr)) {
        dateMap.set(dateStr, {
          date: new Date(d),
          enrolments: []
        });
      }
      
      // Add all enrolments from this session to this day
      const dayEntry = dateMap.get(dateStr)!;
      dayEntry.enrolments.push(...(session.enrolments || []));
    }
  });

  // Convert to sorted array of days
  const allDays = Array.from(dateMap.values()).sort((a, b) => 
    a.date.getTime() - b.date.getTime()
  );

  // Group days into weeks (Monday-Sunday)
  const weeks: WeekGroup[] = [];
  allDays.forEach((day) => {
    const dayDate = new Date(day.date);
    // Get Monday of this week (0 = Sunday, 1 = Monday, ...)
    const dayOfWeek = dayDate.getDay();
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weekStart = new Date(dayDate);
    weekStart.setDate(weekStart.getDate() - daysFromMonday);
    weekStart.setHours(0, 0, 0, 0);
    
    // Sunday of this week
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);
    
    const weekKey = weekStart.toISOString().split('T')[0];
    let week = weeks.find(w => w.weekStart.toISOString().split('T')[0] === weekKey);
    
    if (!week) {
      week = { weekStart, weekEnd, days: [] };
      weeks.push(week);
    }
    
    week.days.push(day);
  });

  const formatDateRange = (start: Date, end: Date) => {
    const startStr = new Date(start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const endStr = new Date(end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `${startStr} - ${endStr}`;
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const getUniqueCampTypes = (enrolments: DayEnrolments['enrolments']) => {
    return [...new Set(enrolments.map(e => e.camp_type))];
  };

  const countByType = (enrolments: DayEnrolments['enrolments'], type: 'FD' | 'AM' | 'PM') => {
    return enrolments.filter(e => e.camp_type === type).length;
  };

  // build monthly report
  const monthlyMap = new Map<
    string,
    {
      month: string;
      totalEnrolments: number;
      byType: { FD: number; half: number };
      byLength: Record<number, number>;
      byCourse: Record<string, number>;
      uniqueStudentWeeks: Set<string>;
    }
  >();

  sessions.forEach(session => {
    const start = new Date(session.start_date);
    // Apply the same +1 day shift as in the dateMap to ensure consistency
    start.setDate(start.getDate() + 1);
    const monthKey = start.toISOString().slice(0, 7); // YYYY-MM
    let entry = monthlyMap.get(monthKey);
    if (!entry) {
      entry = {
        month: monthKey,
        totalEnrolments: 0,
        byType: { FD: 0, half: 0 },
        byLength: {},
        byCourse: {},
        uniqueStudentWeeks: new Set()
      };
      monthlyMap.set(monthKey, entry);
    }

    // Get the Monday of the week this session starts
    const sessionDate = new Date(start);
    const dayOfWeek = sessionDate.getDay();
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weekStart = new Date(sessionDate);
    weekStart.setDate(weekStart.getDate() - daysFromMonday);
    const weekKey = weekStart.toISOString().slice(0, 10);

    const end = new Date(session.end_date);
    end.setDate(end.getDate() + 1);
    const length =
      Math.round(
        (end.getTime() - start.getTime()) / (86400 * 1000)
      ) + 1;

    session.enrolments.forEach(e => {
      entry!.totalEnrolments += 1;
      if (e.camp_type === 'FD') entry!.byType.FD += 1;
      else entry!.byType.half += 1;

      entry!.byCourse[e.course_id] = (entry!.byCourse[e.course_id] || 0) + 1;
      entry!.byLength[length] = (entry!.byLength[length] || 0) + 1;

      // Count student only once per calendar week
      entry!.uniqueStudentWeeks.add(`${e.student_id}-${weekKey}`);
    });
  });

  const monthlyReport = Array.from(monthlyMap.values()).map(r => ({
    month: r.month,
    totalEnrolments: r.totalEnrolments,
    byType: r.byType,
    byLength: r.byLength,
    byCourse: r.byCourse,
    uniqueStudentWeeks: r.uniqueStudentWeeks.size
  }));

  // Group weeks by month
  const weeksByMonth = new Map<string, WeekGroup[]>();
  weeks.forEach(week => {
    const monthKey = week.weekStart.toISOString().slice(0, 7);
    if (!weeksByMonth.has(monthKey)) {
      weeksByMonth.set(monthKey, []);
    }
    weeksByMonth.get(monthKey)!.push(week);
  });

  return (
    <div className="m-2 md:m-4">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Camp Schedule</h1>
          <p className="text-sm text-slate-600 mt-1">
            Monthly enrollment summary and schedule below
          </p>
        </div>
        <ScrapeCampsButton />
      </div>

      {allDays.length === 0 ? (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-8 text-center">
          <CalendarIcon className="h-12 w-12 text-slate-400 mx-auto mb-3" />
          <p className="text-slate-600 font-medium">No upcoming camp sessions</p>
          <p className="text-slate-500 text-sm mt-1">
            Camp sessions will appear here once they are scheduled
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {monthlyReport.map(monthData => (
            <div key={monthData.month}>
              {/* Monthly report for this month */}
              <CampMonthlyReport monthlyReport={[monthData]} />
              
              {/* Weeks for this month */}
              {weeksByMonth.get(monthData.month)?.map((week, weekIndex) => (
                <div key={`${monthData.month}-${weekIndex}`} className="mt-4">
                  <h2 className="text-lg font-bold text-slate-900 mb-3 pb-2 border-b border-slate-300">
                    Week of {formatDateRange(week.weekStart, week.weekEnd)}
                  </h2>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                    {week.days.map((day, dayIndex) => {
                      const uniqueTypes = getUniqueCampTypes(day.enrolments);
                      const dateStr = day.date.toISOString().split('T')[0];
                      
                      return (
                        <Link
                          key={`${monthData.month}-${weekIndex}-${dayIndex}`}
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
                            <span className="text-sm font-medium">
                              {day.enrolments.length} {day.enrolments.length === 1 ? 'camper' : 'campers'}
                            </span>
                          </div>

                          <div className="flex flex-wrap gap-1.5">
                            {uniqueTypes.includes('FD') && (
                              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                                {countByType(day.enrolments, 'FD')} FD
                              </span>
                            )}
                            {uniqueTypes.includes('AM') && (
                              <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs font-medium rounded">
                                {countByType(day.enrolments, 'AM')} AM
                              </span>
                            )}
                            {uniqueTypes.includes('PM') && (
                              <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs font-medium rounded">
                                {countByType(day.enrolments, 'PM')} PM
                              </span>
                            )}
                            {day.enrolments.some(e => e.extended_care) && (
                              <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-medium rounded">
                                Ext Care
                              </span>
                            )}
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

