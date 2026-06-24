import Link from 'next/link';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { connection } from 'next/server';
import { fetchCampLmsCourseMappings } from '@/app/lib/data';
import CampLmsMappingsTable from '@/app/ui/camp/camp-lms-mappings-table';

export default async function CampLmsMappingsPage() {
  await connection();
  const mappings = await fetchCampLmsCourseMappings();

  return (
    <div className="m-2 md:m-4">
      <Link
        href="/dashboard/camp"
        className="mb-4 inline-flex items-center gap-2 text-sm text-sky-600 hover:text-sky-700"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Back to Camp Sessions
      </Link>

      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900">LMS Camp Mappings</h1>
        <p className="mt-1 text-sm text-slate-600">
          Map each camp course to beginner, intermediate, advanced, and additional acceptable Canvas course IDs.
        </p>
      </div>

      <CampLmsMappingsTable rows={mappings.rows} schemaReady={mappings.schema_ready} />
    </div>
  );
}
