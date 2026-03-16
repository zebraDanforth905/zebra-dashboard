import { fetchCampSessionsByDateRange } from '@/app/lib/data';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import CampSessionDetail from '@/app/ui/camp/camp-session-detail';
import { connection } from 'next/server';

export default async function CampSessionPage({ 
  params 
}: { 
  params: Promise<{ startDate: string; endDate: string }> 
}) {
  await connection();
  const { startDate, endDate } = await params;
  
  // Parse ISO date strings (YYYY-MM-DD format)
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  // Shift dates forward by 1 day to correct timezone offset
  start.setDate(start.getDate() + 1);
  end.setDate(end.getDate() + 1);
  
  const session = await fetchCampSessionsByDateRange(start, end);

  if (!session || session.enrolments.length === 0) {
    notFound();
  }

  const formatDateRange = (start: Date, end: Date) => {
    const startStr = new Date(start).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
    const endStr = new Date(end).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    
    if (new Date(start).getMonth() === new Date(end).getMonth()) {
      return `${startStr} - ${new Date(end).getDate()}, ${new Date(end).getFullYear()}`;
    }
    return `${startStr} - ${endStr}`;
  };

  const hasExtendedCare = session.enrolments.some(e => e.extended_care);
  const sessionTypes = [...new Set(session.enrolments.map(e => e.camp_type))];
  const sessionTypeLabels = sessionTypes.map(type => {
    switch (type) {
      case 'FD': return 'Full Day';
      case 'AM': return 'Morning';
      case 'PM': return 'Afternoon';
    }
  }).join(', ');

  // Count students by type
  const fdCount = session.enrolments.filter(e => e.camp_type === 'FD').length;
  const amCount = session.enrolments.filter(e => e.camp_type === 'AM').length;
  const pmCount = session.enrolments.filter(e => e.camp_type === 'PM').length;
  const extendedCareCount = session.enrolments.filter(e => e.extended_care).length;

  return (
    <div className="m-2 md:m-4">
      <Link
        href="/dashboard/camp"
        className="inline-flex items-center gap-2 text-sm text-sky-600 hover:text-sky-700 mb-4"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Back to Camp Sessions
      </Link>

      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-2xl font-bold text-slate-900">
            {formatDateRange(session.start_date, session.end_date)}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-slate-600">
            {session.enrolment_count} {session.enrolment_count === 1 ? 'camper' : 'campers'} enrolled:
          </span>
          {fdCount > 0 && (
            <span className="px-2 py-1 bg-blue-100 text-blue-700 font-medium rounded">
              {fdCount} Full Day
            </span>
          )}
          {amCount > 0 && (
            <span className="px-2 py-1 bg-yellow-100 text-yellow-700 font-medium rounded">
              {amCount} Morning
            </span>
          )}
          {pmCount > 0 && (
            <span className="px-2 py-1 bg-orange-100 text-orange-700 font-medium rounded">
              {pmCount} Afternoon
            </span>
          )}
          {extendedCareCount > 0 && (
            <span className="px-2 py-1 bg-purple-100 text-purple-700 font-medium rounded">
              {extendedCareCount} Extended Care
            </span>
          )}
        </div>
      </div>

      <CampSessionDetail session={session} />
    </div>
  );
}
