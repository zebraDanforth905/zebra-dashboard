import {
  fetchUpcomingCampSessionsWithEnrolments,
  fetchSeatAssignments,
} from '@/app/lib/data';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import CampDayDetail from '@/app/ui/camp/camp-day-detail';
import { connection } from 'next/server';
import { CampEnrolmentWithStudent } from '@/app/lib/definitions';

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
  weekEnd.setHours(0, 0, 0, 0);
  return weekEnd;
};

export default async function CampDayPage({ 
  params 
}: { 
  params: Promise<{ date: string }> 
}) {
  await connection();
  const { date } = await params;

  // Parse URL day as local calendar date to avoid UTC day-shift.
  const parsedDayDate = parseLocalISODate(date);
  if (!parsedDayDate) {
    notFound();
  }
  const dayDate = parsedDayDate;
  const weekStart = getWeekStart(dayDate);
  const weekEnd = getWeekEnd(weekStart);
  const weekHref = `/dashboard/camp/${getDateKey(weekStart)}/${getDateKey(weekEnd)}`;
  
  const [sessions, seatRows] = await Promise.all([
    fetchUpcomingCampSessionsWithEnrolments(),
    fetchSeatAssignments(dayDate),
  ]);

  // Find all sessions that span this date and collect their enrolments
  const dayEnrolments = new Map<string, CampEnrolmentWithStudent[]>();
  
  sessions.forEach((session) => {
    const start = getLocalDateFromDb(session.start_date);
    const end = getLocalDateFromDb(session.end_date);
    if (!start || !end) {
      return;
    }
    
    // Check if this session spans the requested date
    const dayStart = new Date(dayDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayDate);
    dayEnd.setHours(23, 59, 59, 999);
    
    if (start <= dayEnd && end >= dayStart) {
      // This session includes this date
      // Store enrolments keyed by camp type
      session.enrolments?.forEach(enrolment => {
        const typeKey = `camp_type:${enrolment.camp_type}`;
        if (!dayEnrolments.has(typeKey)) {
          dayEnrolments.set(typeKey, []);
        }
        dayEnrolments.get(typeKey)!.push(enrolment);
      });
    }
  });
  
  if (dayEnrolments.size === 0) {
    notFound();
  }

  // flatten enrolments for passing to session detail
  const allEnrolments = Array.from(dayEnrolments.values()).flat();
  const enrolmentById = new Map(allEnrolments.map((enrolment) => [enrolment.id, enrolment]));

  const seatMap = new Map<number, string[]>();
  for (const row of seatRows) {
    if (!enrolmentById.has(row.enrolment_id)) continue;

    const existingForSeat = seatMap.get(row.seat) ?? [];
    if (!existingForSeat.includes(row.enrolment_id)) {
      existingForSeat.push(row.enrolment_id);
      seatMap.set(row.seat, existingForSeat);
    }
  }

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="m-2 md:m-4 print:m-0">
      <Link
        href={weekHref}
        className="inline-flex items-center gap-2 text-sm text-sky-600 hover:text-sky-700 mb-4 print:hidden"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Back to Week
      </Link>

      <div className="mb-6 print:hidden">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-2xl font-bold text-slate-900">
            {formatDate(dayDate)}
          </h1>
        </div>
      </div>

      <CampDayDetail
        dayDate={dayDate}
        dayEnrolments={dayEnrolments}
        seatAssignments={seatMap}
        seatAssignmentsDateKey={date}
      />

    </div>
  );
}
