import { fetchUpcomingCampSessionsWithEnrolments, fetchSeatAssignments } from '@/app/lib/data';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import CampDayDetail from '@/app/ui/camp/camp-day-detail';
import { connection } from 'next/server';

export default async function CampDayPage({ 
  params 
}: { 
  params: Promise<{ date: string }> 
}) {
  await connection();
  const { date } = await params;
  
  // Parse ISO date string (YYYY-MM-DD format)
  const dayDate = new Date(date);
  
  const sessions = await fetchUpcomingCampSessionsWithEnrolments();
  
  // also fetch seat assignments for this particular date
  const seatRows = await fetchSeatAssignments(dayDate);
  const seatMap = new Map<number, string>();
  seatRows.forEach(r => seatMap.set(r.seat, r.enrolment_id));

  // Find all sessions that span this date and collect their enrolments
  const dayEnrolments = new Map<string, Array<any>>();
  
  sessions.forEach((session) => {
    const start = new Date(session.start_date);
    const end = new Date(session.end_date);
    
    // Shift dates forward by 1 day to correct timezone offset
    start.setDate(start.getDate() + 1);
    end.setDate(end.getDate() + 1);
    
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

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  };

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
      />

    </div>
  );
}
