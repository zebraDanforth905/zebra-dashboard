import { fetchCampSessionById } from '@/app/lib/data';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import CampSessionDetail from '@/app/ui/camp/camp-session-detail';

export default async function CampSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await fetchCampSessionById(id);

  if (!session) {
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

  const getCampTypeLabel = (type: 'FD' | 'PM' | 'AM') => {
    switch (type) {
      case 'FD': return 'Full Day';
      case 'AM': return 'Morning';
      case 'PM': return 'Afternoon';
    }
  };

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
          <span className="px-3 py-1 bg-sky-100 text-sky-700 text-sm font-medium rounded">
            {getCampTypeLabel(session.camp_type)}
          </span>
          {session.extended_care && (
            <span className="px-3 py-1 bg-purple-100 text-purple-700 text-sm font-medium rounded">
              Extended Care
            </span>
          )}
        </div>
        <p className="text-sm text-slate-600">
          {session.enrolment_count} {session.enrolment_count === 1 ? 'camper' : 'campers'} enrolled
        </p>
      </div>

      <CampSessionDetail session={session} />
    </div>
  );
}
