import Link from 'next/link';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { connection } from 'next/server';
import { fetchCampLmsCourseMappingDashboard } from '@/app/lib/data';
import LmsCourseMappingManager from '@/app/ui/camp/lms-course-mapping-manager';

export default async function LmsCourseMappingPage() {
  await connection();
  const data = await fetchCampLmsCourseMappingDashboard();

  return (
    <div className="m-2 md:m-4">
      <Link
        href="/dashboard/camp"
        className="mb-4 inline-flex items-center gap-2 text-sm text-sky-600 hover:text-sky-700"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Back to Camp Schedule
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">LMS Course Mapping</h1>
        <p className="mt-1 text-sm text-slate-600">
          Manage the Canvas course IDs used by the camp LMS checklist.
        </p>
      </div>

      <LmsCourseMappingManager data={data} />
    </div>
  );
}
