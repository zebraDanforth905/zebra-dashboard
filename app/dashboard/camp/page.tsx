import { fetchUpcomingCampSessions } from '@/app/lib/data';
import Link from 'next/link';
import { CalendarIcon, UserGroupIcon } from '@heroicons/react/24/outline';

export default async function CampPage() {
  const sessions = await fetchUpcomingCampSessions();

  const formatDateRange = (start: Date, end: Date) => {
    const startStr = new Date(start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const endStr = new Date(end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    
    if (startStr.split(',')[0] === endStr.split(',')[0]) {
      // Same month
      return `${startStr} - ${new Date(end).getDate()}, ${new Date(end).getFullYear()}`;
    }
    return `${startStr} - ${endStr}`;
  };

  const getCampTypeLabel = (type: 'FD' | 'PM' | 'AM') => {
    switch (type) {
      case 'FD': return 'Full Day';
      case 'AM': return 'Morning';
      case 'PM': return 'Afternoon';
    }
  };

  return (
    <div className="m-2 md:m-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Camp Sessions</h1>
        <p className="text-sm text-slate-600 mt-1">
          Upcoming camp sessions and enrolled students
        </p>
      </div>

      {sessions.length === 0 ? (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-8 text-center">
          <CalendarIcon className="h-12 w-12 text-slate-400 mx-auto mb-3" />
          <p className="text-slate-600 font-medium">No upcoming camp sessions</p>
          <p className="text-slate-500 text-sm mt-1">
            Camp sessions will appear here once they are scheduled
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sessions.map((session) => (
            <Link
              key={session.id}
              href={`/dashboard/camp/${session.id}`}
              className="block bg-white border border-slate-200 rounded-lg p-5 hover:shadow-md hover:border-sky-300 transition-all"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="text-xs font-semibold text-sky-600 uppercase tracking-wide mb-1">
                    {getCampTypeLabel(session.camp_type)}
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">
                    {formatDateRange(session.start_date, session.end_date)}
                  </h3>
                </div>
                {session.extended_care && (
                  <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs font-medium rounded">
                    Extended Care
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 text-slate-600">
                <UserGroupIcon className="h-5 w-5" />
                <span className="text-sm font-medium">
                  {session.enrolment_count} {session.enrolment_count === 1 ? 'camper' : 'campers'}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
